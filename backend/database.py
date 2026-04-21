import sqlite3
import os
from pathlib import Path

DB_PATH = Path(os.environ.get("DB_PATH", str(Path(__file__).parent / "quote_tool.db")))


def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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
        internal_notes          TEXT,
        is_active               INTEGER NOT NULL DEFAULT 1,
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
    """)

    # Migrate existing DBs that don't have is_active yet
    try:
        c.execute("ALTER TABLE projects ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")
    except Exception:
        pass  # column already exists

    _seed_constants(c)
    conn.commit()
    conn.close()


def _seed_constants(c):
    """Seed/update constants from Forecast sheet. Uses INSERT OR REPLACE to apply updates."""
    rows = [
        # Hourly rates (same across years currently)
        ("rate_RPE",       90.64393939393939, "RPE hourly rate",             "rates"),
        ("rate_ME",        90.64393939393939, "ME hourly rate",              "rates"),
        ("rate_Tech",      52.52168831168831, "Technician hourly rate",      "rates"),
        ("rate_Purchaser", 77.6948051948052,  "Purchaser hourly rate",       "rates"),
        ("rate_PM",        84.1693722943723,  "Project Manager hourly rate", "rates"),
        ("rate_Small",     17.680921052631582,"Small robot hourly rate",     "rates"),
        ("rate_Medium",    29.69663742690059, "Medium robot hourly rate",    "rates"),
        ("rate_Large",     45.68713450292399, "Large robot hourly rate",     "rates"),
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
