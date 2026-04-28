from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3

from database import get_conn, init_db
from calculations import (
    calc_project_quote,
    ProjectInputs,
    PartInputs,
    HOURLY_RATES,
    LABOR_HOURS,
    LABOR_HOURS_SETS,
    UNISTRUT_TECH_HRS,
    PALLETIZE_TECH_HRS,
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


class ProjectUpdate(ProjectCreate):
    pass


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
def list_projects():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()

    result = []
    for row in rows:
        proj = row_to_dict(row)
        parts_rows = conn.execute(
            "SELECT * FROM parts WHERE project_id=? ORDER BY sort_order, id", (proj["id"],)
        ).fetchall()
        parts_data = [row_to_dict(r) for r in parts_rows]

        proj["parts_count"] = len(parts_data)

        proj["quoted_price"] = None
        if parts_data:
            try:
                proj_inputs = ProjectInputs(
                    quantity_of_assemblies=proj["quantity_of_assemblies"],
                    internal_margin=proj["internal_margin"],
                    year_of_execution=proj["year_of_execution"],
                    assembly_pp_internal=proj["assembly_pp_internal"],
                    assembly_pp_external=proj["assembly_pp_external"],
                    assembly_first_part_setup=proj["assembly_first_part_setup"],
                    setup_splitting_hrs=proj["setup_splitting_hrs"],
                    shipping_cost=proj.get("shipping_cost", 0),
                    osp_margin=proj.get("osp_margin", 0.10),
                )
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
                    labor_constants=proj.get("labor_constants", "formed_parts"),
                ) for pt in parts_data]
                quote = calc_project_quote(proj_inputs, part_inputs)
                proj["quoted_price"] = quote["quoted_price"]
            except Exception as e:
                print(f"[list_projects] quote calc failed for project {proj['id']}: {e}")

        result.append(proj)

    conn.close()
    return result


@app.post("/projects", status_code=201)
def create_project(data: ProjectCreate):
    conn = get_conn()
    c = conn.execute(
        """INSERT INTO projects
           (name,quantity_of_assemblies,material_type,ht_type,internal_margin,
            year_of_execution,assembly_pp_internal,assembly_pp_external,
            assembly_first_part_setup,setup_splitting_hrs,shipping_cost,osp_margin,
            labor_constants,internal_notes,is_active)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (data.name, data.quantity_of_assemblies, data.material_type, data.ht_type,
         data.internal_margin, data.year_of_execution, data.assembly_pp_internal,
         data.assembly_pp_external, data.assembly_first_part_setup,
         data.setup_splitting_hrs, data.shipping_cost, data.osp_margin,
         data.labor_constants, data.internal_notes, data.is_active),
    )
    pid = c.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    conn.close()
    return row_to_dict(row)


@app.get("/projects/{pid}")
def get_project(pid: int):
    conn = get_conn()
    project = row_to_dict(conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone())
    if not project:
        raise HTTPException(404, "Project not found")
    parts = [row_to_dict(r) for r in conn.execute(
        "SELECT * FROM parts WHERE project_id=? ORDER BY sort_order, id", (pid,)
    ).fetchall()]
    conn.close()
    project["parts"] = parts
    return project


@app.put("/projects/{pid}")
def update_project(pid: int, data: ProjectUpdate):
    conn = get_conn()
    conn.execute(
        """UPDATE projects SET
           name=?,quantity_of_assemblies=?,material_type=?,ht_type=?,
           internal_margin=?,year_of_execution=?,assembly_pp_internal=?,
           assembly_pp_external=?,assembly_first_part_setup=?,
           setup_splitting_hrs=?,shipping_cost=?,osp_margin=?,
           labor_constants=?,internal_notes=?,is_active=?,
           updated_at=datetime('now')
           WHERE id=?""",
        (data.name, data.quantity_of_assemblies, data.material_type, data.ht_type,
         data.internal_margin, data.year_of_execution, data.assembly_pp_internal,
         data.assembly_pp_external, data.assembly_first_part_setup,
         data.setup_splitting_hrs, data.shipping_cost, data.osp_margin,
         data.labor_constants, data.internal_notes, data.is_active, pid),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Project not found")
    return row_to_dict(row)


@app.delete("/projects/{pid}", status_code=204)
def delete_project(pid: int):
    conn = get_conn()
    conn.execute("DELETE FROM projects WHERE id=?", (pid,))
    conn.commit()
    conn.close()


# ── Parts ─────────────────────────────────────────────────────────────────────

@app.post("/projects/{pid}/parts", status_code=201)
def create_part(pid: int, data: PartCreate):
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
            internal_notes,sort_order)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (pid, data.name, data.quantity_per_assembly, data.skirted_geometry_file,
         data.minimum_thickness_mm, data.on_cell_surface_finish_ra, data.profile_tolerance_mm,
         data.forming_time_hrs, data.scanning_time_hrs, data.cutting_time_hrs,
         data.stress_relief_time_hrs, data.est_pre_if_procedures, data.est_if_procedures,
         data.sheet_type, data.parts_per_sheet, data.cost_per_sheet, data.ht_cost_per_part,
         data.unistrut, data.robot_strength, data.pp_internal, data.pp_external,
         data.first_part_additional_setup, data.setup_skirt_path_plan_sim_hrs,
         data.shipping_cost_per_part, data.manufacturing_method, data.other_mfg_internal,
         data.other_mfg_cost, data.other_mfg_cost_dup, data.internal_notes, data.sort_order),
    )
    part_id = c.lastrowid
    conn.execute("UPDATE projects SET updated_at=datetime('now') WHERE id=?", (pid,))
    conn.commit()
    row = conn.execute("SELECT * FROM parts WHERE id=?", (part_id,)).fetchone()
    conn.close()
    return row_to_dict(row)


@app.put("/parts/{part_id}")
def update_part(part_id: int, data: PartUpdate):
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
           internal_notes=?,sort_order=?,
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
         data.other_mfg_cost, data.other_mfg_cost_dup, data.internal_notes, data.sort_order, part_id),
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
    return p


@app.delete("/parts/{part_id}", status_code=204)
def delete_part(part_id: int):
    conn = get_conn()
    row = conn.execute("SELECT project_id FROM parts WHERE id=?", (part_id,)).fetchone()
    if row:
        conn.execute("DELETE FROM parts WHERE id=?", (part_id,))
        conn.execute("UPDATE projects SET updated_at=datetime('now') WHERE id=?", (row["project_id"],))
    conn.commit()
    conn.close()


# ── Quote calculation ─────────────────────────────────────────────────────────

@app.get("/projects/{pid}/quote")
def get_quote(pid: int):
    conn = get_conn()
    proj_row = conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    if not proj_row:
        raise HTTPException(404, "Project not found")
    parts_rows = conn.execute(
        "SELECT * FROM parts WHERE project_id=? ORDER BY sort_order, id", (pid,)
    ).fetchall()
    conn.close()

    p = row_to_dict(proj_row)
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

    part_inputs = []
    parts_data = [row_to_dict(r) for r in parts_rows]
    lc = p.get("labor_constants", "formed_parts") or "formed_parts"
    for pt in parts_data:
        part_inputs.append(PartInputs(
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
        ))

    result = calc_project_quote(proj_inputs, part_inputs)

    # Year-over-year comparison using the same inputs but varying the year
    year_prices = {}
    for yr in [2026, 2027, 2028]:
        yr_inputs = ProjectInputs(
            quantity_of_assemblies=p["quantity_of_assemblies"],
            internal_margin=p["internal_margin"],
            year_of_execution=yr,
            assembly_pp_internal=p["assembly_pp_internal"],
            assembly_pp_external=p["assembly_pp_external"],
            assembly_first_part_setup=p["assembly_first_part_setup"],
            setup_splitting_hrs=p["setup_splitting_hrs"],
            shipping_cost=p.get("shipping_cost", 0),
            osp_margin=p.get("osp_margin", 0.10),
        )
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


# ── Constants (admin) ─────────────────────────────────────────────────────────

@app.get("/constants")
def list_constants():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM constants ORDER BY category, key").fetchall()
    conn.close()
    return [row_to_dict(r) for r in rows]


@app.get("/constants/labor-sets")
def get_labor_sets():
    """Returns both labor hour constant sets for display in dev tools."""
    return LABOR_HOURS_SETS


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
