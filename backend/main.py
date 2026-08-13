from fastapi import FastAPI, HTTPException, Request, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3
import base64
import json
import os

from database import get_conn, init_db, ADMIN_EMAIL, ADMIN_NAME
import calculations as _calc
from pricing_history import rates_as_of, RATE_EPOCHS
from calculations import (
    calc_project_quote,
    ProjectInputs,
    PartInputs,
    HOURLY_RATES,
    LABOR_HOURS,
    LABOR_HOURS_SETS,
    PART_HOURS_SETS,
    PROJECT_HOURS,
    ROBOT_IMPROVEMENT,
    TRIAL_REDUCTION,
    UNISTRUT_TECH_HRS,
    PALLETIZE_TECH_HRS,
    pricing_version,
    pricing_summary,
)

app = FastAPI(title="Quote Tool API")

import os as _os
_cors_origins = _os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()
    backfill_reconstructed_baselines()


# ── Identity (Azure Easy Auth / Entra sign-in) ────────────────────────────────
# In production, Azure Easy Auth injects the signed-in user via request headers.
# Locally there is no Easy Auth, so we fall back to a dev identity (env or a
# per-request override header) so the app is testable without sign-in.

def _identity_from_request(request: Request) -> tuple[str, Optional[str]]:
    email = request.headers.get("x-ms-client-principal-name")
    name: Optional[str] = None

    principal_b64 = request.headers.get("x-ms-client-principal")
    if principal_b64:
        try:
            data = json.loads(base64.b64decode(principal_b64).decode("utf-8"))
            claims = {c.get("typ"): c.get("val") for c in data.get("claims", [])}
            name = (claims.get("name")
                    or claims.get("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"))
            if not email:
                email = (claims.get("preferred_username")
                         or claims.get("emails")
                         or claims.get("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"))
        except Exception:
            pass

    if not email:
        # Local/dev fallback. A name only ever pairs with its own email source so an
        # email override never inherits a different user's name (real Easy Auth sends both).
        if request.headers.get("x-dev-user-email"):
            email = request.headers.get("x-dev-user-email")
            name = request.headers.get("x-dev-user-name")
        elif os.environ.get("QUOTE_TOOL_DEV_USER_EMAIL"):
            email = os.environ.get("QUOTE_TOOL_DEV_USER_EMAIL")
            name = os.environ.get("QUOTE_TOOL_DEV_USER_NAME")

    if not email:
        return ("guest@unknown", name or "Guest")

    if not name:
        local = email.split("@")[0]
        name = " ".join(w.capitalize() for w in local.replace(".", " ").replace("_", " ").split())
    return (email.lower(), name)


def current_user(request: Request) -> dict:
    """Resolve the caller's identity — READ-ONLY, so it never blocks on a DB write.
    Recording the visit (insert new user / bump last_seen) happens off the request
    path via record_visit() in a background task."""
    email, name = _identity_from_request(request)
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    finally:
        conn.close()
    if row is not None:
        u = dict(row)
        u["is_admin"] = bool(u["is_admin"])
        u["_name"] = name
        return u
    # Not yet recorded — return a default identity; record_visit() will create the row.
    return {
        "email": email, "display_name": name,
        "is_admin": email == ADMIN_EMAIL, "access_scope": "all",
        "acknowledged_version": None, "_name": name,
    }


def record_visit(email: str, name: str) -> None:
    """Best-effort: create the user on first visit, else bump last_seen. Runs in a
    background task so slow/locked Azure Files writes never delay the response."""
    try:
        conn = get_conn()
        try:
            conn.execute(
                """INSERT INTO users (email, display_name, is_admin, access_scope, access_count, last_seen)
                   VALUES (?,?,?,?,1,datetime('now'))
                   ON CONFLICT(email) DO UPDATE SET
                     last_seen=datetime('now'),
                     access_count=access_count+1,
                     display_name=COALESCE(excluded.display_name, users.display_name)""",
                (email, name, 1 if email == ADMIN_EMAIL else 0, "all"),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print(f"[record_visit] skipped for {email}: {e}")


def require_admin(user: dict = Depends(current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(403, "Admin access required")
    return user


def _can_see(project_row, user: dict) -> bool:
    """Whether `user` may view a project given its access_tag and their access_scope."""
    if user.get("is_admin") or user.get("access_scope", "all") == "all":
        return True
    tag = (project_row["access_tag"] if "access_tag" in project_row.keys() else None) or "all"
    if tag == "all":
        return True
    allowed = {t.strip() for t in (user.get("access_scope") or "").split(",") if t.strip()}
    return tag in allowed


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    quantity_of_assemblies: int = 1
    material_type: Optional[str] = None
    ht_type: Optional[str] = None
    internal_margin: float = 0.70
    year_of_execution: int = 2026
    assembly_pp_internal: float = 0
    assembly_pp_external: float = 0
    assembly_first_part_setup: float = 0
    setup_splitting_hrs: float = 0
    shipping_cost: float = 0
    osp_margin: float = 0.10
    labor_constants: str = "formed_parts"
    internal_notes: Optional[str] = None
    is_active: int = 1
    # authorship & visibility (author is set from identity on create;
    # author/access_tag are editable by an admin on update)
    author_email: Optional[str] = None
    author_name: Optional[str] = None
    access_tag: str = "all"


class ProjectUpdate(ProjectCreate):
    pass


class AccessUpdate(BaseModel):
    access_scope: str


class AckVersion(BaseModel):
    version: str


class PartCreate(BaseModel):
    name: str = "New Part"
    quantity_per_assembly: int = 1
    skirted_geometry_file: Optional[str] = None
    minimum_thickness_mm: Optional[float] = None
    on_cell_surface_finish_ra: Optional[float] = None
    profile_tolerance_mm: Optional[float] = None
    forming_time_hrs: float = 0
    scanning_time_hrs: float = 0
    cutting_time_hrs: float = 0
    stress_relief_time_hrs: float = 0
    est_pre_if_procedures: int = 5
    est_if_procedures: int = 5
    sheet_type: Optional[str] = None
    parts_per_sheet: int = 1
    cost_per_sheet: float = 0
    ht_cost_per_part: float = 0
    unistrut: int = 0
    robot_strength: str = "Small"
    pp_internal: float = 0
    pp_external: float = 0
    first_part_additional_setup: float = 0
    setup_skirt_path_plan_sim_hrs: float = 4
    shipping_cost_per_part: float = 0
    manufacturing_method: str = "roboformed"
    other_mfg_internal: int = 1
    other_mfg_cost: float = 0
    other_mfg_cost_dup: float = 0
    custom_robot_cost_per_hr: Optional[float] = None
    internal_notes: Optional[str] = None
    sort_order: int = 0


class PartUpdate(PartCreate):
    pass


class ConstantUpdate(BaseModel):
    value: float


# ── Helper: row → dict ────────────────────────────────────────────────────────

def row_to_dict(row) -> dict:
    return dict(row) if row else None


# ── Projects ──────────────────────────────────────────────────────────────────

@app.get("/projects")
def list_projects(user: dict = Depends(current_user)):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()

    cur_ver = pricing_version()
    result = []
    for row in rows:
        if not _can_see(row, user):
            continue
        proj = row_to_dict(row)
        proj["parts_count"] = conn.execute(
            "SELECT COUNT(*) FROM parts WHERE project_id=?", (proj["id"],)
        ).fetchone()[0]

        # Frozen quote comes from the active snapshot; a project is "stale" when its
        # snapshot was computed under a different pricing version than what's live now.
        snap = conn.execute(
            "SELECT quoted_price, pricing_version FROM quote_snapshots WHERE project_id=? AND is_active=1",
            (proj["id"],),
        ).fetchone()
        if snap is not None:
            proj["quoted_price"] = snap["quoted_price"]
            proj["pricing_stale"] = snap["pricing_version"] != cur_ver
        else:
            # No snapshot yet — show a live preview (created for real when the quote is opened).
            proj["quoted_price"] = None
            proj["pricing_stale"] = False
            if proj["parts_count"]:
                try:
                    _, parts_data = _load_project_and_parts(conn, proj["id"])
                    proj["quoted_price"] = compute_quote_result(proj, parts_data)["quoted_price"]
                except Exception as e:
                    print(f"[list_projects] quote preview failed for project {proj['id']}: {e}")

        result.append(proj)

    conn.close()
    return result


@app.post("/projects", status_code=201)
def create_project(data: ProjectCreate, user: dict = Depends(current_user)):
    conn = get_conn()
    c = conn.execute(
        """INSERT INTO projects
           (name,quantity_of_assemblies,material_type,ht_type,internal_margin,
            year_of_execution,assembly_pp_internal,assembly_pp_external,
            assembly_first_part_setup,setup_splitting_hrs,shipping_cost,osp_margin,
            labor_constants,internal_notes,is_active,author_email,author_name,access_tag)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (data.name, data.quantity_of_assemblies, data.material_type, data.ht_type,
         data.internal_margin, data.year_of_execution, data.assembly_pp_internal,
         data.assembly_pp_external, data.assembly_first_part_setup,
         data.setup_splitting_hrs, data.shipping_cost, data.osp_margin,
         data.labor_constants, data.internal_notes, data.is_active,
         user["email"], user["display_name"], data.access_tag or "all"),
    )
    pid = c.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    conn.close()
    _log_edit(pid, user, "Created project")
    return row_to_dict(row)


@app.get("/projects/{pid}")
def get_project(pid: int, user: dict = Depends(current_user)):
    conn = get_conn()
    prow = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not prow:
        conn.close()
        raise HTTPException(404, "Project not found")
    if not _can_see(prow, user):
        conn.close()
        raise HTTPException(403, "You don't have access to this project")
    project = row_to_dict(prow)
    parts = [row_to_dict(r) for r in conn.execute(
        "SELECT * FROM parts WHERE project_id=? ORDER BY sort_order, id", (pid,)
    ).fetchall()]
    conn.close()
    project["parts"] = parts
    return project


@app.put("/projects/{pid}")
def update_project(pid: int, data: ProjectUpdate, user: dict = Depends(current_user)):
    conn = get_conn()
    existing = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(404, "Project not found")
    if not _can_see(existing, user):
        conn.close()
        raise HTTPException(403, "You don't have access to this project")

    # Only an admin may reassign author or change who can see a project.
    if user.get("is_admin"):
        author_email = data.author_email if data.author_email is not None else existing["author_email"]
        author_name  = data.author_name  if data.author_name  is not None else existing["author_name"]
        access_tag   = data.access_tag   if data.access_tag             else existing["access_tag"]
    else:
        author_email = existing["author_email"]
        author_name  = existing["author_name"]
        access_tag   = existing["access_tag"]

    conn.execute(
        """UPDATE projects SET
           name=?,quantity_of_assemblies=?,material_type=?,ht_type=?,
           internal_margin=?,year_of_execution=?,assembly_pp_internal=?,
           assembly_pp_external=?,assembly_first_part_setup=?,
           setup_splitting_hrs=?,shipping_cost=?,osp_margin=?,
           labor_constants=?,internal_notes=?,is_active=?,
           author_email=?,author_name=?,access_tag=?,
           updated_at=datetime('now')
           WHERE id=?""",
        (data.name, data.quantity_of_assemblies, data.material_type, data.ht_type,
         data.internal_margin, data.year_of_execution, data.assembly_pp_internal,
         data.assembly_pp_external, data.assembly_first_part_setup,
         data.setup_splitting_hrs, data.shipping_cost, data.osp_margin,
         data.labor_constants, data.internal_notes, data.is_active,
         author_email, author_name, access_tag, pid),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    conn.close()
    _recompute_active_snapshot(pid, "Edited project settings", user.get("email"))
    _log_edit(pid, user, "Edited project settings")
    return row_to_dict(row)


@app.delete("/projects/{pid}", status_code=204)
def delete_project(pid: int):
    conn = get_conn()
    conn.execute("DELETE FROM projects WHERE id=?", (pid,))
    conn.commit()
    conn.close()


@app.post("/projects/{pid}/duplicate", status_code=201)
def duplicate_project(pid: int, user: dict = Depends(current_user)):
    conn = get_conn()
    src = row_to_dict(conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())
    if not src:
        raise HTTPException(404, "Project not found")
    parts = [row_to_dict(r) for r in conn.execute(
        "SELECT * FROM parts WHERE project_id=? ORDER BY sort_order, id", (pid,)
    ).fetchall()]

    c = conn.execute(
        """INSERT INTO projects
           (name,quantity_of_assemblies,material_type,ht_type,internal_margin,
            year_of_execution,assembly_pp_internal,assembly_pp_external,
            assembly_first_part_setup,setup_splitting_hrs,shipping_cost,osp_margin,
            labor_constants,internal_notes,is_active,author_email,author_name,access_tag)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (f"Copy of {src['name']}", src['quantity_of_assemblies'], src['material_type'],
         src['ht_type'], src['internal_margin'], src['year_of_execution'],
         src['assembly_pp_internal'], src['assembly_pp_external'],
         src['assembly_first_part_setup'], src['setup_splitting_hrs'],
         src['shipping_cost'], src['osp_margin'], src['labor_constants'],
         src['internal_notes'], src['is_active'],
         user["email"], user["display_name"], src.get('access_tag', 'all') or 'all'),
    )
    new_pid = c.lastrowid

    for pt in parts:
        conn.execute(
            """INSERT INTO parts
               (project_id,name,quantity_per_assembly,skirted_geometry_file,
                minimum_thickness_mm,on_cell_surface_finish_ra,profile_tolerance_mm,
                forming_time_hrs,scanning_time_hrs,cutting_time_hrs,stress_relief_time_hrs,
                est_pre_if_procedures,est_if_procedures,sheet_type,parts_per_sheet,
                cost_per_sheet,ht_cost_per_part,unistrut,robot_strength,
                pp_internal,pp_external,first_part_additional_setup,
                setup_skirt_path_plan_sim_hrs,shipping_cost_per_part,
                manufacturing_method,other_mfg_internal,other_mfg_cost,other_mfg_cost_dup,
                custom_robot_cost_per_hr,internal_notes,sort_order)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (new_pid, pt['name'], pt['quantity_per_assembly'], pt['skirted_geometry_file'],
             pt['minimum_thickness_mm'], pt['on_cell_surface_finish_ra'], pt['profile_tolerance_mm'],
             pt['forming_time_hrs'], pt['scanning_time_hrs'], pt['cutting_time_hrs'],
             pt['stress_relief_time_hrs'], pt['est_pre_if_procedures'], pt['est_if_procedures'],
             pt['sheet_type'], pt['parts_per_sheet'], pt['cost_per_sheet'], pt['ht_cost_per_part'],
             pt['unistrut'], pt['robot_strength'], pt['pp_internal'], pt['pp_external'],
             pt['first_part_additional_setup'], pt['setup_skirt_path_plan_sim_hrs'],
             pt['shipping_cost_per_part'], pt['manufacturing_method'], pt['other_mfg_internal'],
             pt['other_mfg_cost'], pt['other_mfg_cost_dup'], pt.get('custom_robot_cost_per_hr'),
             pt['internal_notes'], pt['sort_order']),
        )

    conn.commit()
    new_proj = row_to_dict(conn.execute("SELECT * FROM projects WHERE id=?", (new_pid,)).fetchone())
    conn.close()
    _log_edit(new_pid, user, f"Created as a copy of '{src['name']}'")
    return new_proj


# ── Parts ─────────────────────────────────────────────────────────────────────

@app.post("/projects/{pid}/parts", status_code=201)
def create_part(pid: int, data: PartCreate, user: dict = Depends(current_user)):
    conn = get_conn()
    project = conn.execute("SELECT id FROM projects WHERE id=?", (pid,)).fetchone()
    if not project:
        raise HTTPException(404, "Project not found")
    c = conn.execute(
        """INSERT INTO parts
           (project_id,name,quantity_per_assembly,skirted_geometry_file,
            minimum_thickness_mm,on_cell_surface_finish_ra,profile_tolerance_mm,
            forming_time_hrs,scanning_time_hrs,cutting_time_hrs,stress_relief_time_hrs,
            est_pre_if_procedures,est_if_procedures,sheet_type,parts_per_sheet,
            cost_per_sheet,ht_cost_per_part,unistrut,robot_strength,
            pp_internal,pp_external,first_part_additional_setup,
            setup_skirt_path_plan_sim_hrs,shipping_cost_per_part,
            manufacturing_method,other_mfg_internal,other_mfg_cost,other_mfg_cost_dup,
            custom_robot_cost_per_hr,internal_notes,sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (pid, data.name, data.quantity_per_assembly, data.skirted_geometry_file,
         data.minimum_thickness_mm, data.on_cell_surface_finish_ra, data.profile_tolerance_mm,
         data.forming_time_hrs, data.scanning_time_hrs, data.cutting_time_hrs,
         data.stress_relief_time_hrs, data.est_pre_if_procedures, data.est_if_procedures,
         data.sheet_type, data.parts_per_sheet, data.cost_per_sheet, data.ht_cost_per_part,
         data.unistrut, data.robot_strength, data.pp_internal, data.pp_external,
         data.first_part_additional_setup, data.setup_skirt_path_plan_sim_hrs,
         data.shipping_cost_per_part, data.manufacturing_method, data.other_mfg_internal,
         data.other_mfg_cost, data.other_mfg_cost_dup, data.custom_robot_cost_per_hr,
         data.internal_notes, data.sort_order),
    )
    part_id = c.lastrowid
    conn.execute("UPDATE projects SET updated_at=datetime('now') WHERE id=?", (pid,))
    conn.commit()
    row = conn.execute("SELECT * FROM parts WHERE id=?", (part_id,)).fetchone()
    conn.close()
    _recompute_active_snapshot(pid, "Added a part", user.get("email"))
    _log_edit(pid, user, f"Added part '{data.name}'")
    return row_to_dict(row)


@app.put("/parts/{part_id}")
def update_part(part_id: int, data: PartUpdate, user: dict = Depends(current_user)):
    conn = get_conn()
    conn.execute(
        """UPDATE parts SET
           name=?,quantity_per_assembly=?,skirted_geometry_file=?,
           minimum_thickness_mm=?,on_cell_surface_finish_ra=?,profile_tolerance_mm=?,
           forming_time_hrs=?,scanning_time_hrs=?,cutting_time_hrs=?,stress_relief_time_hrs=?,
           est_pre_if_procedures=?,est_if_procedures=?,sheet_type=?,parts_per_sheet=?,
           cost_per_sheet=?,ht_cost_per_part=?,unistrut=?,robot_strength=?,
           pp_internal=?,pp_external=?,first_part_additional_setup=?,
           setup_skirt_path_plan_sim_hrs=?,shipping_cost_per_part=?,
           manufacturing_method=?,other_mfg_internal=?,other_mfg_cost=?,other_mfg_cost_dup=?,
           custom_robot_cost_per_hr=?,internal_notes=?,sort_order=?,
           updated_at=datetime('now')
           WHERE id=?""",
        (data.name, data.quantity_per_assembly, data.skirted_geometry_file,
         data.minimum_thickness_mm, data.on_cell_surface_finish_ra, data.profile_tolerance_mm,
         data.forming_time_hrs, data.scanning_time_hrs, data.cutting_time_hrs,
         data.stress_relief_time_hrs, data.est_pre_if_procedures, data.est_if_procedures,
         data.sheet_type, data.parts_per_sheet, data.cost_per_sheet, data.ht_cost_per_part,
         data.unistrut, data.robot_strength, data.pp_internal, data.pp_external,
         data.first_part_additional_setup, data.setup_skirt_path_plan_sim_hrs,
         data.shipping_cost_per_part, data.manufacturing_method, data.other_mfg_internal,
         data.other_mfg_cost, data.other_mfg_cost_dup, data.custom_robot_cost_per_hr,
         data.internal_notes, data.sort_order, part_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM parts WHERE id=?", (part_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Part not found")
    # update project timestamp
    p = row_to_dict(row)
    conn2 = get_conn()
    conn2.execute("UPDATE projects SET updated_at=datetime('now') WHERE id=?", (p["project_id"],))
    conn2.commit()
    conn2.close()
    _recompute_active_snapshot(p["project_id"], "Edited a part", user.get("email"))
    _log_edit(p["project_id"], user, f"Edited part '{p['name']}'")
    return p


@app.delete("/parts/{part_id}", status_code=204)
def delete_part(part_id: int, user: dict = Depends(current_user)):
    conn = get_conn()
    row = conn.execute("SELECT project_id FROM parts WHERE id=?", (part_id,)).fetchone()
    pid = row["project_id"] if row else None
    if row:
        conn.execute("DELETE FROM parts WHERE id=?", (part_id,))
        conn.execute("UPDATE projects SET updated_at=datetime('now') WHERE id=?", (pid,))
    conn.commit()
    conn.close()
    if pid is not None:
        _recompute_active_snapshot(pid, "Removed a part", user.get("email"))
        _log_edit(pid, user, "Removed a part")


# ── Quote calculation & snapshots ─────────────────────────────────────────────

def _build_quote_inputs(p: dict, parts_data: list[dict]):
    proj_inputs = ProjectInputs(
        quantity_of_assemblies=p["quantity_of_assemblies"],
        internal_margin=p["internal_margin"],
        year_of_execution=p["year_of_execution"],
        assembly_pp_internal=p["assembly_pp_internal"],
        assembly_pp_external=p["assembly_pp_external"],
        assembly_first_part_setup=p["assembly_first_part_setup"],
        setup_splitting_hrs=p["setup_splitting_hrs"],
        shipping_cost=p.get("shipping_cost", 0),
        osp_margin=p.get("osp_margin", 0.10),
    )
    lc = p.get("labor_constants", "formed_parts") or "formed_parts"
    part_inputs = [PartInputs(
        quantity_per_assembly=pt["quantity_per_assembly"],
        forming_time_hrs=pt["forming_time_hrs"],
        scanning_time_hrs=pt["scanning_time_hrs"],
        cutting_time_hrs=pt["cutting_time_hrs"],
        est_pre_if_procedures=pt["est_pre_if_procedures"],
        est_if_procedures=pt["est_if_procedures"],
        cost_per_sheet=pt["cost_per_sheet"],
        ht_cost_per_part=pt["ht_cost_per_part"],
        unistrut=bool(pt["unistrut"]),
        robot_strength=pt["robot_strength"],
        pp_internal=pt["pp_internal"],
        pp_external=pt["pp_external"],
        first_part_additional_setup=pt["first_part_additional_setup"],
        setup_skirt_path_plan_sim_hrs=pt["setup_skirt_path_plan_sim_hrs"],
        parts_per_sheet=pt.get("parts_per_sheet", 1) or 1,
        shipping_cost_per_part=pt.get("shipping_cost_per_part", 0),
        manufacturing_method=pt.get("manufacturing_method", "roboformed"),
        other_mfg_internal=bool(pt.get("other_mfg_internal", 1)),
        other_mfg_cost=pt.get("other_mfg_cost", 0),
        other_mfg_cost_dup=pt.get("other_mfg_cost_dup", 0),
        labor_constants=lc,
        custom_robot_rate=pt.get("custom_robot_cost_per_hr"),
    ) for pt in parts_data]
    return proj_inputs, part_inputs


def compute_quote_result(p: dict, parts_data: list[dict]) -> dict:
    """Compute the full quote result live from the current pricing constants."""
    proj_inputs, part_inputs = _build_quote_inputs(p, parts_data)
    result = calc_project_quote(proj_inputs, part_inputs)
    year_prices = {}
    for yr in [2026, 2028, 2030]:
        yr_inputs, _ = _build_quote_inputs({**p, "year_of_execution": yr}, parts_data)
        yr_result = calc_project_quote(yr_inputs, part_inputs)
        year_prices[yr] = {
            "quoted_price":         yr_result["quoted_price"],
            "total_cost":           yr_result["total_cost"],
            "first_assembly_price": yr_result["first_assembly_price"],
            "dup_assembly_price":   yr_result["dup_assembly_price"],
        }
    result["year_prices"] = year_prices
    result["project"] = p
    result["parts"] = parts_data
    return result


def _load_project_and_parts(conn, pid: int):
    proj_row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not proj_row:
        return None, None
    parts_rows = conn.execute(
        "SELECT * FROM parts WHERE project_id=? ORDER BY sort_order, id", (pid,)
    ).fetchall()
    return row_to_dict(proj_row), [row_to_dict(r) for r in parts_rows]


def _snapshot_meta(row) -> dict:
    d = dict(row)
    d.pop("result_json", None)
    d.pop("inputs_json", None)
    d["is_active"] = bool(d["is_active"])
    d["is_reconstructed"] = bool(d.get("is_reconstructed", 0))
    return d


def _create_snapshot(conn, pid: int, result: dict, inputs: dict, *, label: str,
                     make_active: bool, created_by: Optional[str] = None,
                     reconstructed: bool = False) -> int:
    if make_active:
        conn.execute("UPDATE quote_snapshots SET is_active=0 WHERE project_id=?", (pid,))
    cur = conn.execute(
        """INSERT INTO quote_snapshots
           (project_id, created_by, label, pricing_version, pricing_summary,
            quoted_price, result_json, inputs_json, is_active, is_reconstructed)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (pid, created_by, label, pricing_version(), pricing_summary(),
         result.get("quoted_price"), json.dumps(result), json.dumps(inputs),
         1 if make_active else 0, 1 if reconstructed else 0),
    )
    return cur.lastrowid


def _recompute_active_snapshot(pid: int, label: str, created_by: Optional[str] = None) -> None:
    """Recompute the quote at CURRENT pricing and store it as the active snapshot.
    If the current active snapshot was on a *different* pricing version (e.g. a
    customer-facing quote frozen under old pricing), it's archived to history first
    so it isn't lost; same-pricing edits just update in place (no history spam)."""
    conn = get_conn()
    try:
        p, parts_data = _load_project_and_parts(conn, pid)
        if not p:
            return
        active = conn.execute(
            "SELECT * FROM quote_snapshots WHERE project_id=? AND is_active=1", (pid,)
        ).fetchone()
        result = compute_quote_result(p, parts_data)
        inputs = {"project": p, "parts": parts_data}
        if active is not None and active["pricing_version"] == pricing_version():
            conn.execute(
                """UPDATE quote_snapshots SET result_json=?, inputs_json=?, quoted_price=?,
                   pricing_summary=?, created_at=datetime('now'), label=? WHERE id=?""",
                (json.dumps(result), json.dumps(inputs), result.get("quoted_price"),
                 pricing_summary(), label, active["id"]),
            )
        else:
            _create_snapshot(conn, pid, result, inputs, label=label,
                             make_active=True, created_by=created_by)
        conn.commit()
    finally:
        conn.close()


def _log_edit(pid: int, user: dict, summary: str) -> None:
    """Record an input-change audit entry (who + when). Best-effort."""
    try:
        conn = get_conn()
        conn.execute(
            "INSERT INTO project_edits (project_id, user_email, user_name, summary) VALUES (?,?,?,?)",
            (pid, user.get("email"), user.get("display_name") or user.get("_name"), summary),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[log_edit] project {pid} failed: {e}")


@app.get("/projects/{pid}/price-history")
def price_history(pid: int, user: dict = Depends(current_user)):
    """For the project's CURRENT inputs, what the quote would price at under each past
    pricing version — so you can see how pricing updates moved this quote's number."""
    conn = get_conn()
    p, parts_data = _load_project_and_parts(conn, pid)
    conn.close()
    if not p:
        raise HTTPException(404, "Project not found")
    if not _can_see(p, user):
        raise HTTPException(403, "You don't have access to this project")

    live = {k: _calc.HOURLY_RATES[k][2026] for k in ("Small", "Medium", "Large")}
    orig = _calc.HOURLY_RATES
    out = []
    try:
        for eff, rates in RATE_EPOCHS:
            patched = dict(orig)
            for k in ("Small", "Medium", "Large"):
                patched[k] = {2026: rates[k], 2028: rates[k], 2030: rates[k]}
            _calc.HOURLY_RATES = patched
            res = compute_quote_result(p, parts_data)
            out.append({
                "effective":            None if eff.startswith("0000") else eff,
                "rates":                rates,
                "quoted_price":         res["quoted_price"],
                "first_assembly_price": res["first_assembly_price"],
                "dup_assembly_price":   res["dup_assembly_price"],
                "is_current":           all(abs(rates[k] - live[k]) < 1e-9 for k in ("Small", "Medium", "Large")),
            })
    finally:
        _calc.HOURLY_RATES = orig
    return out


@app.get("/projects/{pid}/edits")
def list_edits(pid: int, user: dict = Depends(current_user)):
    """Audit log of who changed this project's inputs and when (not app/pricing updates)."""
    conn = get_conn()
    p, _ = _load_project_and_parts(conn, pid)
    if not p:
        conn.close()
        raise HTTPException(404, "Project not found")
    if not _can_see(p, user):
        conn.close()
        raise HTTPException(403, "You don't have access to this project")
    rows = conn.execute(
        "SELECT * FROM project_edits WHERE project_id=? ORDER BY created_at DESC, id DESC LIMIT 200", (pid,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def backfill_reconstructed_baselines() -> None:
    """One-time: give every existing project a reconstructed baseline snapshot priced at the
    robot rates that were live when it was last edited. Runs once (guarded by user_version>=2),
    only for projects that don't already have a snapshot."""
    conn = get_conn()
    try:
        ver = conn.execute("PRAGMA user_version").fetchone()[0]
        if ver >= 2:
            return
        proj_ids = [r[0] for r in conn.execute("SELECT id FROM projects").fetchall()]
        for pid in proj_ids:
            has = conn.execute("SELECT 1 FROM quote_snapshots WHERE project_id=? LIMIT 1", (pid,)).fetchone()
            if has:
                continue
            p, parts_data = _load_project_and_parts(conn, pid)
            if not p:
                continue
            rates = rates_as_of(p.get("updated_at"))
            orig = _calc.HOURLY_RATES
            patched = dict(orig)
            for k in ("Small", "Medium", "Large"):
                patched[k] = {2026: rates[k], 2028: rates[k], 2030: rates[k]}
            _calc.HOURLY_RATES = patched
            try:
                result = compute_quote_result(p, parts_data)
                label = (f"Reconstructed baseline — robots "
                         f"${rates['Small']:.2f}/${rates['Medium']:.2f}/${rates['Large']:.2f}")
                _create_snapshot(conn, pid, result, {"project": p, "parts": parts_data},
                                 label=label, make_active=True, reconstructed=True)
            except Exception as e:
                print(f"[backfill] project {pid} failed: {e}")
            finally:
                _calc.HOURLY_RATES = orig
        conn.execute("PRAGMA user_version = 2")
        conn.commit()
    finally:
        conn.close()


@app.get("/projects/{pid}/quote")
def get_quote(pid: int, user: dict = Depends(current_user)):
    conn = get_conn()
    p, parts_data = _load_project_and_parts(conn, pid)
    if not p:
        conn.close()
        raise HTTPException(404, "Project not found")
    if not _can_see(p, user):
        conn.close()
        raise HTTPException(403, "You don't have access to this project")

    active = conn.execute(
        "SELECT * FROM quote_snapshots WHERE project_id=? AND is_active=1", (pid,)
    ).fetchone()
    if active is None:
        # First time this project's quote is viewed — establish the baseline snapshot.
        result = compute_quote_result(p, parts_data)
        _create_snapshot(conn, pid, result, {"project": p, "parts": parts_data},
                         label="Initial quote", make_active=True, created_by=user["email"])
        conn.commit()
        active = conn.execute(
            "SELECT * FROM quote_snapshots WHERE project_id=? AND is_active=1", (pid,)
        ).fetchone()

    frozen = json.loads(active["result_json"])
    cur_ver = pricing_version()
    stale = active["pricing_version"] != cur_ver

    # When stale, also compute what the quote would be under current pricing (for the
    # "newer pricing available — was X, now Y" comparison), without saving it.
    if stale:
        preview = compute_quote_result(p, parts_data)
        frozen["current_preview"] = {
            "quoted_price":         preview["quoted_price"],
            "first_assembly_price": preview["first_assembly_price"],
            "dup_assembly_price":   preview["dup_assembly_price"],
            "year_prices":          preview["year_prices"],
        }
    conn.close()

    frozen["snapshot"] = _snapshot_meta(active)
    frozen["stale"] = stale
    frozen["current_pricing_version"] = cur_ver
    frozen["current_pricing_summary"] = pricing_summary()
    return frozen


@app.post("/projects/{pid}/quote/refresh")
def refresh_quote(pid: int, user: dict = Depends(current_user)):
    """Adopt current pricing: recompute, archive the prior active snapshot to history,
    and make the new one active."""
    conn = get_conn()
    p, parts_data = _load_project_and_parts(conn, pid)
    if not p:
        conn.close()
        raise HTTPException(404, "Project not found")
    if not _can_see(p, user):
        conn.close()
        raise HTTPException(403, "You don't have access to this project")
    result = compute_quote_result(p, parts_data)
    sid = _create_snapshot(conn, pid, result, {"project": p, "parts": parts_data},
                           label="Refreshed to current pricing", make_active=True,
                           created_by=user["email"])
    conn.commit()
    conn.close()
    return {"ok": True, "snapshot_id": sid, "quoted_price": result.get("quoted_price")}


@app.get("/projects/{pid}/snapshots")
def list_snapshots(pid: int, user: dict = Depends(current_user)):
    conn = get_conn()
    p, _ = _load_project_and_parts(conn, pid)
    if not p:
        conn.close()
        raise HTTPException(404, "Project not found")
    if not _can_see(p, user):
        conn.close()
        raise HTTPException(403, "You don't have access to this project")
    rows = conn.execute(
        "SELECT * FROM quote_snapshots WHERE project_id=? ORDER BY is_active DESC, created_at DESC, id DESC",
        (pid,),
    ).fetchall()
    conn.close()
    return [_snapshot_meta(r) for r in rows]


@app.get("/snapshots/{sid}")
def get_snapshot(sid: int, user: dict = Depends(current_user)):
    conn = get_conn()
    row = conn.execute("SELECT * FROM quote_snapshots WHERE id=?", (sid,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Snapshot not found")
    p, _ = _load_project_and_parts(conn, row["project_id"])
    conn.close()
    if p and not _can_see(p, user):
        raise HTTPException(403, "You don't have access to this project")
    result = json.loads(row["result_json"])
    result["snapshot"] = _snapshot_meta(row)
    result["stale"] = row["pricing_version"] != pricing_version()
    return result


# ── Constants (admin) ─────────────────────────────────────────────────────────

@app.get("/constants")
def list_constants():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM constants ORDER BY category, key").fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@app.get("/constants/labor-sets")
def get_labor_sets():
    """Returns labor hour constant sets, part hour sets, project hours, robot improvement, and trial reduction."""
    return {
        "labor_sets":        LABOR_HOURS_SETS,
        "part_sets":         PART_HOURS_SETS,
        "project_hours":     PROJECT_HOURS,
        "robot_improvement": ROBOT_IMPROVEMENT,
        "trial_reduction":   TRIAL_REDUCTION,
    }


@app.put("/constants/{key}")
def update_constant(key: str, data: ConstantUpdate):
    conn = get_conn()
    conn.execute("UPDATE constants SET value=? WHERE key=?", (data.value, key))
    conn.commit()
    row = conn.execute("SELECT * FROM constants WHERE key=?", (key,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Constant not found")
    return row_to_dict(row)


# ── Identity & users ──────────────────────────────────────────────────────────

@app.get("/me")
def get_me(background: BackgroundTasks, user: dict = Depends(current_user)):
    """Current signed-in user: identity, permission level, and last acknowledged version.
    Returns immediately; the visit is recorded after the response is sent."""
    background.add_task(record_visit, user["email"], user.get("_name") or user["display_name"])
    return {
        "email":                user["email"],
        "display_name":         user["display_name"],
        "is_admin":             user["is_admin"],
        "access_scope":         user["access_scope"],
        "acknowledged_version": user["acknowledged_version"],
    }


@app.post("/me/acknowledge-version")
def acknowledge_version(data: AckVersion, user: dict = Depends(current_user)):
    """Record that this user has seen a given release-notes version."""
    conn = get_conn()
    conn.execute(
        """INSERT INTO users (email, display_name, is_admin, access_scope, acknowledged_version, access_count)
           VALUES (?,?,?,?,?,0)
           ON CONFLICT(email) DO UPDATE SET acknowledged_version=excluded.acknowledged_version""",
        (user["email"], user.get("_name") or user["display_name"],
         1 if user["is_admin"] else 0, user.get("access_scope", "all"), data.version),
    )
    conn.commit()
    conn.close()
    return {"ok": True, "acknowledged_version": data.version}


@app.get("/admin/users")
def list_users(user: dict = Depends(require_admin)):
    """Admin: everyone who has accessed the app, when they were last seen, and their access scope."""
    conn = get_conn()
    rows = conn.execute("SELECT * FROM users ORDER BY last_seen DESC").fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        d["is_admin"] = bool(d["is_admin"])
        out.append(d)
    return out


@app.put("/admin/users/{email}")
def update_user_access(email: str, data: AccessUpdate, user: dict = Depends(require_admin)):
    """Admin: set which projects a user can see ('all' or a comma-separated list of tags)."""
    conn = get_conn()
    row = conn.execute("SELECT email FROM users WHERE email=?", (email.lower(),)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "User not found")
    conn.execute("UPDATE users SET access_scope=? WHERE email=?", (data.access_scope, email.lower()))
    conn.commit()
    updated = conn.execute("SELECT * FROM users WHERE email=?", (email.lower(),)).fetchone()
    conn.close()
    d = dict(updated)
    d["is_admin"] = bool(d["is_admin"])
    return d


@app.get("/admin/access-tags")
def list_access_tags(user: dict = Depends(require_admin)):
    """Admin: distinct access tags currently in use across projects (for building visibility menus)."""
    conn = get_conn()
    rows = conn.execute("SELECT DISTINCT access_tag FROM projects WHERE access_tag IS NOT NULL").fetchall()
    conn.close()
    return sorted({(r["access_tag"] or "all") for r in rows} | {"all"})
