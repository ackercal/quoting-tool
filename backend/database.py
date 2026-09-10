import sqlite3
import os
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "quote_tool.db")))


def get_conn():
    # timeout bounds how long a write waits on a lock before giving up (the DB lives on
    # an Azure Files share, where locks under container overlap can stall). synchronous=NORMAL
    # trims fsync overhead on that share.
    conn = sqlite3.connect(str(DB_PATH), timeout=8.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 8000")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def init_db():
    conn = get_conn()
    c = conn.cursor()

    c.executescript("""
    CREATE TABLE IF NOT EXISTS projects (
        id                      INTEGER PRIMARY KEY AUTOINCREMENT,
        name                    TEXT    NOT NULL,
        quantity_of_assemblies  INTEGER NOT NULL DEFAULT 1,
        material_type           TEXT,
        ht_type                 TEXT,
        internal_margin         REAL    NOT NULL DEFAULT 0.70,
        year_of_execution       INTEGER NOT NULL DEFAULT 2026,
        assembly_pp_internal    REAL    NOT NULL DEFAULT 0,
        assembly_pp_external    REAL    NOT NULL DEFAULT 0,
        assembly_first_part_setup REAL  NOT NULL DEFAULT 0,
        setup_splitting_hrs     REAL    NOT NULL DEFAULT 0,
        shipping_cost           REAL    NOT NULL DEFAULT 0,
        osp_margin              REAL    NOT NULL DEFAULT 0.10,
        internal_notes          TEXT,
        is_active               INTEGER NOT NULL DEFAULT 1,
        -- authorship & visibility
        author_email            TEXT,
        author_name             TEXT,
        access_tag              TEXT    NOT NULL DEFAULT 'all',
        -- linked project code (from the Project Code tab); the quote's own name is `name`
        project_code            TEXT,
        -- per-quote status: 'Open' | 'Closed Won' | 'Not Used' (upgrades is_active)
        quote_status            TEXT    NOT NULL DEFAULT 'Open',
        created_at              TEXT    DEFAULT (datetime('now')),
        updated_at              TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parts (
        id                          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id                  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name                        TEXT    NOT NULL DEFAULT 'New Part',
        quantity_per_assembly       INTEGER NOT NULL DEFAULT 1,
        -- geometry / requirements (stored, not used in math)
        skirted_geometry_file       TEXT,
        minimum_thickness_mm        REAL,
        on_cell_surface_finish_ra   REAL,
        profile_tolerance_mm        REAL,
        -- robot time
        forming_time_hrs            REAL    NOT NULL DEFAULT 0,
        scanning_time_hrs           REAL    NOT NULL DEFAULT 0,
        cutting_time_hrs            REAL    NOT NULL DEFAULT 0,
        stress_relief_time_hrs      REAL    NOT NULL DEFAULT 0,
        -- forming trial count
        est_pre_if_procedures       INTEGER NOT NULL DEFAULT 5,
        est_if_procedures           INTEGER NOT NULL DEFAULT 5,
        -- sheet stock
        sheet_type                  TEXT,
        parts_per_sheet             INTEGER NOT NULL DEFAULT 1,
        cost_per_sheet              REAL    NOT NULL DEFAULT 0,
        -- HT
        ht_cost_per_part            REAL    NOT NULL DEFAULT 0,
        unistrut                    INTEGER NOT NULL DEFAULT 0,
        -- robot type
        robot_strength              TEXT    NOT NULL DEFAULT 'Small',
        -- post processing
        pp_internal                 REAL    NOT NULL DEFAULT 0,
        pp_external                 REAL    NOT NULL DEFAULT 0,
        first_part_additional_setup REAL    NOT NULL DEFAULT 0,
        -- setup
        setup_skirt_path_plan_sim_hrs REAL  NOT NULL DEFAULT 4,
        -- shipping
        shipping_cost_per_part      REAL    NOT NULL DEFAULT 0,
        -- manufacturing method
        manufacturing_method        TEXT    NOT NULL DEFAULT 'roboformed',
        other_mfg_internal          INTEGER NOT NULL DEFAULT 1,
        other_mfg_cost              REAL    NOT NULL DEFAULT 0,
        other_mfg_cost_dup          REAL    NOT NULL DEFAULT 0,
        internal_notes              TEXT,
        sort_order                  INTEGER NOT NULL DEFAULT 0,
        created_at                  TEXT    DEFAULT (datetime('now')),
        updated_at                  TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS constants (
        key         TEXT PRIMARY KEY,
        value       REAL NOT NULL,
        description TEXT,
        category    TEXT
    );

    -- Frozen, self-contained quote snapshots (versioned history per project).
    CREATE TABLE IF NOT EXISTS quote_snapshots (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        created_at       TEXT    DEFAULT (datetime('now')),
        created_by       TEXT,
        label            TEXT,
        pricing_version  TEXT,               -- fingerprint of the constants used
        pricing_summary  TEXT,               -- human-readable pricing description
        quoted_price     REAL,               -- denormalized for quick list display
        result_json      TEXT,               -- full computed quote result (frozen)
        inputs_json      TEXT,               -- project + parts inputs at snapshot time
        is_active        INTEGER NOT NULL DEFAULT 0,   -- 1 = the project's displayed quote
        is_reconstructed INTEGER NOT NULL DEFAULT 0    -- 1 = retroactively rebuilt baseline
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_project ON quote_snapshots(project_id);

    -- Audit log of INPUT changes to a project/quote (who + when). Excludes app/pricing updates.
    CREATE TABLE IF NOT EXISTS project_edits (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        created_at  TEXT    DEFAULT (datetime('now')),
        user_email  TEXT,
        user_name   TEXT,
        summary     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_edits_project ON project_edits(project_id);

    -- People who have accessed the app (identity comes from Entra sign-in).
    CREATE TABLE IF NOT EXISTS users (
        email                TEXT PRIMARY KEY,
        display_name         TEXT,
        is_admin             INTEGER NOT NULL DEFAULT 0,
        -- project visibility scope: 'all' for now; later a vertical tag or CSV of tags
        access_scope         TEXT    NOT NULL DEFAULT 'all',
        -- last release-notes version this user acknowledged (per-user "what's new")
        acknowledged_version TEXT,
        first_seen           TEXT    DEFAULT (datetime('now')),
        last_seen            TEXT    DEFAULT (datetime('now')),
        access_count         INTEGER NOT NULL DEFAULT 0
    );

    -- Project codes (customer / internal), with status tracking. Seeded from the
    -- current Salesforce dataset (etl.sf_opportunities) as a uniqueness baseline.
    -- New codes: <PREFIX><NNN>, prefix from the ported Databricks letter logic,
    -- NNN a per-prefix counter (no letter-swap collisions). sf_account_index /
    -- sf_opp_index are carried at the far right of the table.
    CREATE TABLE IF NOT EXISTS project_codes (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        code              TEXT    NOT NULL UNIQUE,
        work_type         TEXT    NOT NULL DEFAULT 'customer',  -- 'customer' | 'internal'
        team              TEXT,                                 -- internal team, when internal
        customer          TEXT,                                 -- account name (customer)
        project_name      TEXT,                                 -- opportunity name
        status            TEXT    NOT NULL DEFAULT 'Discovery', -- Discovery | Closed Won | Closed Lost
        sf_account_id     TEXT,
        sf_opp_id         TEXT,
        source            TEXT    NOT NULL DEFAULT 'generated', -- 'generated' | 'seed'
        created_by        TEXT,
        created_by_name   TEXT,
        created_at        TEXT    DEFAULT (datetime('now')),
        status_updated_at TEXT    DEFAULT (datetime('now')),
        -- carried from Databricks, kept at the far right per request
        sf_account_index  INTEGER,
        sf_opp_index      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_project_codes_status ON project_codes(status);

    -- Change history for a project code (who changed which field, when, old->new).
    -- `field` is 'status' | 'customer' | 'project_name'. The code itself is never edited.
    CREATE TABLE IF NOT EXISTS project_code_status_events (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        code_id         INTEGER NOT NULL REFERENCES project_codes(id) ON DELETE CASCADE,
        field           TEXT    NOT NULL DEFAULT 'status',
        old_value       TEXT,
        new_value       TEXT,
        changed_by      TEXT,
        changed_by_name TEXT,
        changed_at      TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_code_events_code ON project_code_status_events(code_id);
    """)

    # If an older status-only history table exists (from_status/to_status), rebuild
    # it to the generic field/old_value/new_value schema. Guarded by column presence.
    _pcse_cols = [r[1] for r in c.execute("PRAGMA table_info(project_code_status_events)").fetchall()]
    if _pcse_cols and 'field' not in _pcse_cols:
        c.executescript("""
            ALTER TABLE project_code_status_events RENAME TO _pcse_old;
            CREATE TABLE project_code_status_events (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                code_id         INTEGER NOT NULL REFERENCES project_codes(id) ON DELETE CASCADE,
                field           TEXT    NOT NULL DEFAULT 'status',
                old_value       TEXT,
                new_value       TEXT,
                changed_by      TEXT,
                changed_by_name TEXT,
                changed_at      TEXT    DEFAULT (datetime('now'))
            );
            INSERT INTO project_code_status_events (id, code_id, field, old_value, new_value, changed_by, changed_by_name, changed_at)
                SELECT id, code_id, 'status', from_status, to_status, changed_by, changed_by_name, changed_at FROM _pcse_old;
            DROP TABLE _pcse_old;
            CREATE INDEX IF NOT EXISTS idx_code_events_code ON project_code_status_events(code_id);
        """)

    # Migrate existing DBs
    for migration in [
        "ALTER TABLE projects ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE projects ADD COLUMN shipping_cost REAL NOT NULL DEFAULT 0",
        "ALTER TABLE projects ADD COLUMN osp_margin REAL NOT NULL DEFAULT 0.10",
        "ALTER TABLE parts ADD COLUMN shipping_cost_per_part REAL NOT NULL DEFAULT 0",
        "ALTER TABLE parts ADD COLUMN manufacturing_method TEXT NOT NULL DEFAULT 'roboformed'",
        "ALTER TABLE parts ADD COLUMN other_mfg_internal INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE parts ADD COLUMN other_mfg_cost REAL NOT NULL DEFAULT 0",
        "ALTER TABLE parts ADD COLUMN other_mfg_cost_dup REAL NOT NULL DEFAULT 0",
        "ALTER TABLE projects ADD COLUMN labor_constants TEXT NOT NULL DEFAULT 'formed_parts'",
        "ALTER TABLE parts ADD COLUMN custom_robot_cost_per_hr REAL",
        # Retire the experimental KR1500 robot type: it now falls under Medium (same rate).
        "UPDATE parts SET robot_strength='Medium' WHERE robot_strength='KR1500'",
        "DELETE FROM constants WHERE key='rate_KR1500'",
        # Authorship & visibility columns (v1.8.0)
        "ALTER TABLE projects ADD COLUMN author_email TEXT",
        "ALTER TABLE projects ADD COLUMN author_name TEXT",
        "ALTER TABLE projects ADD COLUMN access_tag TEXT NOT NULL DEFAULT 'all'",
        # Backfill: existing projects default to the admin as author, visible to all.
        f"UPDATE projects SET author_email='{ADMIN_EMAIL}' WHERE author_email IS NULL",
        f"UPDATE projects SET author_name='{ADMIN_NAME}' WHERE author_name IS NULL",
        "UPDATE projects SET access_tag='all' WHERE access_tag IS NULL OR access_tag=''",
        # Linked project code (v1.10)
        "ALTER TABLE projects ADD COLUMN project_code TEXT",
        # Internal project codes: the customer is "Machina <Team>" so it reads as internal.
        "UPDATE project_codes SET customer='Machina ' || team WHERE work_type='internal' AND team IS NOT NULL AND (customer IS NULL OR customer NOT LIKE 'Machina %')",
        # Internal codes now have only Internal / Completed: fold any other status to Internal.
        "UPDATE project_codes SET status='Internal' WHERE work_type='internal' AND status<>'Completed'",
        # Per-quote status (upgrades is_active): add column, map inactive -> Not Used.
        "ALTER TABLE projects ADD COLUMN quote_status TEXT NOT NULL DEFAULT 'Open'",
        "UPDATE projects SET quote_status='Not Used' WHERE is_active=0 AND quote_status='Open'",
    ]:
        try:
            c.execute(migration)
        except Exception:
            pass

    # Reformat old-style internal codes (M_Product001) to the tight form (MPROD001).
    # Idempotent: after it runs, no code starts with 'M_' so it is a no-op.
    _reformat_internal_codes(c)

    # One-time: spread projection years for existing projects (2027->2028, 2028->2030).
    # Guarded by user_version so it runs exactly once (order matters to avoid double-shift).
    schema_version = c.execute("PRAGMA user_version").fetchone()[0]
    if schema_version < 1:
        c.execute("UPDATE projects SET year_of_execution=2030 WHERE year_of_execution=2028")
        c.execute("UPDATE projects SET year_of_execution=2028 WHERE year_of_execution=2027")
        c.execute("PRAGMA user_version = 1")

    _seed_constants(c)
    _seed_admin(c)
    conn.commit()
    conn.close()


def _reformat_internal_codes(c):
    """Rename legacy internal codes (M_<Team><n>) to the compact form (M+PREFIX+n).
    Updates the code, any project linked to it, and logs a 'code' history event."""
    import re
    import code_gen
    try:
        rows = c.execute("SELECT id, code, team FROM project_codes WHERE work_type='internal'").fetchall()
    except Exception:
        return  # project_codes table not present yet
    old = [(r[0], r[1], r[2]) for r in rows if r[1] and r[1].startswith("M_")]
    if not old:
        return
    existing = {r[0] for r in c.execute("SELECT code FROM project_codes").fetchall()}

    def suffix_num(code):
        m = re.search(r"(\d+)$", code)
        return int(m.group(1)) if m else 0

    # Stable order: by team, then original number, so sequences stay sensible.
    for cid, oldcode, team in sorted(old, key=lambda r: ((r[2] or ""), suffix_num(r[1]))):
        t = team
        if not t:
            m = re.match(r"^M_(.*?)\d*$", oldcode)
            t = (m.group(1) if m else "Other") or "Other"
        newcode = code_gen.next_code(code_gen.internal_prefix(t), existing)
        existing.add(newcode)
        c.execute("UPDATE project_codes SET code=? WHERE id=?", (newcode, cid))
        c.execute("UPDATE projects SET project_code=? WHERE project_code=?", (newcode, oldcode))
        c.execute(
            """INSERT INTO project_code_status_events (code_id, field, old_value, new_value, changed_by, changed_by_name)
               VALUES (?, 'code', ?, ?, ?, ?)""",
            (cid, oldcode, newcode, ADMIN_EMAIL, ADMIN_NAME),
        )


# The designated admin. Everyone else defaults to a normal user with 'all' access.
ADMIN_EMAIL = "calvin.acker@machinalabs.ai"
ADMIN_NAME  = "Calvin Acker"


def _seed_admin(c):
    """Ensure the admin account exists and is flagged as admin (idempotent)."""
    c.execute(
        """INSERT INTO users (email, display_name, is_admin, access_scope)
           VALUES (?, ?, 1, 'all')
           ON CONFLICT(email) DO UPDATE SET is_admin=1""",
        (ADMIN_EMAIL, ADMIN_NAME),
    )


def _seed_constants(c):
    """Seed/update constants from Forecast sheet. Uses INSERT OR REPLACE to apply updates."""
    rows = [
        # Hourly rates (same across years currently)
        ("rate_RPE",       90.64393939393939, "RPE hourly rate",             "rates"),
        ("rate_ME",        90.64393939393939, "ME hourly rate",              "rates"),
        ("rate_Tech",      52.52168831168831, "Technician hourly rate",      "rates"),
        ("rate_Purchaser", 77.6948051948052,  "Purchaser hourly rate",       "rates"),
        ("rate_PM",        84.1693722943723,  "Project Manager hourly rate", "rates"),
        ("rate_Small",     10.79, "Small robot hourly rate",     "rates"),
        ("rate_Medium",    13.69, "Medium robot hourly rate",    "rates"),
        ("rate_Large",     18.50, "Large robot hourly rate",     "rates"),
        # Robot improvement multipliers (applied to user's current robot time estimate)
        ("robot_improvement_2026", 1.0,    "Robot time improvement factor 2026", "misc"),
        ("robot_improvement_2027", 0.65,   "Robot time improvement factor 2027", "misc"),
        ("robot_improvement_2028", 0.4225, "Robot time improvement factor 2028", "misc"),
        # Pre-IF Forming labor hours
        ("pre_if_RPE_2026",  2.0, "Pre-IF Forming RPE hrs 2026",  "labor_ops"),
        ("pre_if_ME_2026",   1.0, "Pre-IF Forming ME hrs 2026",   "labor_ops"),
        ("pre_if_Tech_2026", 1.5, "Pre-IF Forming Tech hrs 2026", "labor_ops"),
        ("pre_if_RPE_2027",  1.0, "Pre-IF Forming RPE hrs 2027",  "labor_ops"),
        ("pre_if_ME_2027",   1.0, "Pre-IF Forming ME hrs 2027",   "labor_ops"),
        ("pre_if_Tech_2027", 1.0, "Pre-IF Forming Tech hrs 2027", "labor_ops"),
        ("pre_if_RPE_2028",  0.0, "Pre-IF Forming RPE hrs 2028",  "labor_ops"),
        ("pre_if_ME_2028",   1.0, "Pre-IF Forming ME hrs 2028",   "labor_ops"),
        ("pre_if_Tech_2028", 0.5, "Pre-IF Forming Tech hrs 2028", "labor_ops"),
        # IF Forming labor hours
        ("if_RPE_2026",  0.75, "IF Forming RPE hrs 2026",  "labor_ops"),
        ("if_ME_2026",   0.5,  "IF Forming ME hrs 2026",   "labor_ops"),
        ("if_Tech_2026", 1.5,  "IF Forming Tech hrs 2026", "labor_ops"),
        ("if_RPE_2027",  0.25, "IF Forming RPE hrs 2027",  "labor_ops"),
        ("if_ME_2027",   0.0,  "IF Forming ME hrs 2027",   "labor_ops"),
        ("if_Tech_2027", 1.0,  "IF Forming Tech hrs 2027", "labor_ops"),
        ("if_RPE_2028",  0.0,  "IF Forming RPE hrs 2028",  "labor_ops"),
        ("if_ME_2028",   0.0,  "IF Forming ME hrs 2028",   "labor_ops"),
        ("if_Tech_2028", 0.5,  "IF Forming Tech hrs 2028", "labor_ops"),
        # Dup Forming labor hours
        ("dup_RPE_2026",  0.0, "Dup Forming RPE hrs 2026",  "labor_ops"),
        ("dup_ME_2026",   0.5, "Dup Forming ME hrs 2026",   "labor_ops"),
        ("dup_Tech_2026", 1.5, "Dup Forming Tech hrs 2026", "labor_ops"),
        ("dup_RPE_2027",  0.0, "Dup Forming RPE hrs 2027",  "labor_ops"),
        ("dup_ME_2027",   0.0, "Dup Forming ME hrs 2027",   "labor_ops"),
        ("dup_Tech_2027", 1.0, "Dup Forming Tech hrs 2027", "labor_ops"),
        ("dup_RPE_2028",  0.0, "Dup Forming RPE hrs 2028",  "labor_ops"),
        ("dup_ME_2028",   0.0, "Dup Forming ME hrs 2028",   "labor_ops"),
        ("dup_Tech_2028", 0.5, "Dup Forming Tech hrs 2028", "labor_ops"),
        # Scanning labor hours
        ("scan_RPE_2026",  0.0, "Scanning RPE hrs 2026",  "labor_ops"),
        ("scan_ME_2026",   0.0, "Scanning ME hrs 2026",   "labor_ops"),
        ("scan_Tech_2026", 2.0, "Scanning Tech hrs 2026", "labor_ops"),
        ("scan_RPE_2027",  0.0, "Scanning RPE hrs 2027",  "labor_ops"),
        ("scan_ME_2027",   0.0, "Scanning ME hrs 2027",   "labor_ops"),
        ("scan_Tech_2027", 1.0, "Scanning Tech hrs 2027", "labor_ops"),
        ("scan_RPE_2028",  0.0, "Scanning RPE hrs 2028",  "labor_ops"),
        ("scan_ME_2028",   0.0, "Scanning ME hrs 2028",   "labor_ops"),
        ("scan_Tech_2028", 0.0, "Scanning Tech hrs 2028", "labor_ops"),
        # Cutting labor hours
        ("cut_RPE_2026",  0.5, "Cutting RPE hrs 2026",  "labor_ops"),
        ("cut_ME_2026",   2.0, "Cutting ME hrs 2026",   "labor_ops"),
        ("cut_Tech_2026", 0.5, "Cutting Tech hrs 2026", "labor_ops"),
        ("cut_RPE_2027",  0.5, "Cutting RPE hrs 2027",  "labor_ops"),
        ("cut_ME_2027",   0.5, "Cutting ME hrs 2027",   "labor_ops"),
        ("cut_Tech_2027", 0.5, "Cutting Tech hrs 2027", "labor_ops"),
        ("cut_RPE_2028",  0.0, "Cutting RPE hrs 2028",  "labor_ops"),
        ("cut_ME_2028",   0.0, "Cutting ME hrs 2028",   "labor_ops"),
        ("cut_Tech_2028", 0.5, "Cutting Tech hrs 2028", "labor_ops"),
        # Unistrut & palletize tech hours per year
        ("unistrut_Tech_2026",  6.0, "Unistrut Tech hrs 2026",         "misc"),
        ("unistrut_Tech_2027",  2.0, "Unistrut Tech hrs 2027",         "misc"),
        ("unistrut_Tech_2028",  1.0, "Unistrut Tech hrs 2028",         "misc"),
        ("palletize_Tech_2026", 0.5, "Prep-for-shipping Tech hrs 2026","misc"),
        ("palletize_Tech_2027", 0.5, "Prep-for-shipping Tech hrs 2027","misc"),
        ("palletize_Tech_2028", 0.5, "Prep-for-shipping Tech hrs 2028","misc"),
        # Part-level fixed overhead
        ("purchaser_setup_hrs",    2.0,  "Purchaser setup hrs per first part","misc"),
        ("pm_setup_hrs",           2.0,  "PM setup hrs per first part",       "misc"),
        ("purchaser_overhead_hrs", 0.25, "Purchaser overhead hrs per part",   "misc"),
        ("pm_overhead_hrs",        0.25, "PM overhead hrs per part",          "misc"),
    ]
    c.executemany(
        "INSERT OR REPLACE INTO constants(key, value, description, category) VALUES (?,?,?,?)",
        rows,
    )
