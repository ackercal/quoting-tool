"""
Pricing calculations derived from Claude Version.xlsx (updated April 2026)
  Sheet 1: Labor + Robot Time  (inputs + formulas)
  Sheet 2: Forecast             (constants)
"""
from dataclasses import dataclass

# ── Forecast: Hourly rates (same across years for now) ────────────────────────
HOURLY_RATES: dict[str, dict[int, float]] = {
    "RPE":       {2026: 90.64393939393939, 2027: 90.64393939393939, 2028: 90.64393939393939},
    "ME":        {2026: 90.64393939393939, 2027: 90.64393939393939, 2028: 90.64393939393939},
    "Tech":      {2026: 52.52168831168831, 2027: 52.52168831168831, 2028: 52.52168831168831},
    "Purchaser": {2026: 77.6948051948052,  2027: 77.6948051948052,  2028: 77.6948051948052},
    "PM":        {2026: 84.1693722943723,  2027: 84.1693722943723,  2028: 84.1693722943723},
    "Small":     {2026: 17.680921052631582, 2027: 17.680921052631582, 2028: 17.680921052631582},
    "Medium":    {2026: 29.69663742690059,  2027: 29.69663742690059,  2028: 29.69663742690059},
    "Large":     {2026: 45.68713450292399,  2027: 45.68713450292399,  2028: 45.68713450292399},
}

# ── Forecast: Robot improvement factors (B44:D48) ─────────────────────────────
# Applied to the user's current robot time estimate.
# User enters 2026-baseline hours; future years multiply by this factor.
ROBOT_IMPROVEMENT: dict[int, float] = {
    2026: 1.0,
    2027: 0.65,
    2028: 0.4225,
}

# ── Forecast: Labor hours per operation (B15:D35) ─────────────────────────────
LABOR_HOURS: dict[str, dict[int, dict[str, float]]] = {
    "pre_if_forming": {
        2026: {"RPE": 2.0,  "ME": 1.0, "Tech": 1.5},
        2027: {"RPE": 1.0,  "ME": 1.0, "Tech": 1.0},
        2028: {"RPE": 0.0,  "ME": 1.0, "Tech": 0.5},
    },
    "if_forming": {
        2026: {"RPE": 0.75, "ME": 0.5, "Tech": 1.5},
        2027: {"RPE": 0.25, "ME": 0.0, "Tech": 1.0},
        2028: {"RPE": 0.0,  "ME": 0.0, "Tech": 0.5},
    },
    "dup_forming": {
        2026: {"RPE": 0.0,  "ME": 0.5, "Tech": 1.5},
        2027: {"RPE": 0.0,  "ME": 0.0, "Tech": 1.0},
        2028: {"RPE": 0.0,  "ME": 0.0, "Tech": 0.5},
    },
    "scanning": {
        2026: {"RPE": 0.0,  "ME": 0.0, "Tech": 2.0},
        2027: {"RPE": 0.0,  "ME": 0.0, "Tech": 1.0},
        2028: {"RPE": 0.0,  "ME": 0.0, "Tech": 0.0},
    },
    "cutting": {
        2026: {"RPE": 0.5,  "ME": 2.0, "Tech": 0.5},
        2027: {"RPE": 0.5,  "ME": 0.5, "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0, "Tech": 0.5},
    },
}

# ── Forecast: Extra tech hours (B37:D38) ──────────────────────────────────────
UNISTRUT_TECH_HRS: dict[int, float] = {2026: 6.0, 2027: 2.0, 2028: 1.0}
PALLETIZE_TECH_HRS: dict[int, float] = {2026: 0.5, 2027: 0.5, 2028: 0.5}

# ── Part-level fixed overhead (hardcoded in Labor+Robot sheet) ────────────────
PURCHASER_SETUP_HRS    = 2.0
PM_SETUP_HRS           = 2.0
PURCHASER_OVERHEAD_HRS = 0.25
PM_OVERHEAD_HRS        = 0.25


# ── Helpers ───────────────────────────────────────────────────────────────────

def _rate(role: str, year: int) -> float:
    return HOURLY_RATES[role].get(year) or HOURLY_RATES[role][2026]

def _get_labor(op: str, year: int) -> dict[str, float]:
    op_data = LABOR_HOURS.get(op, {})
    return op_data.get(year) or op_data.get(2026) or {"RPE": 0.0, "ME": 0.0, "Tech": 0.0}

def _robot_improvement(year: int) -> float:
    return ROBOT_IMPROVEMENT.get(year, 1.0)


# ── Operation cost ────────────────────────────────────────────────────────────
# robot_hrs = user's CURRENT (2026-baseline) estimate.
# Effective robot hrs = robot_hrs * improvement_factor[year]

def calc_operation_cost(op: str, robot_hrs: float, strength: str, year: int) -> float:
    hrs = _get_labor(op, year)
    labor = (
        hrs["RPE"]  * _rate("RPE",  year)
        + hrs["ME"] * _rate("ME",   year)
        + hrs["Tech"]* _rate("Tech", year)
    )
    effective_robot_hrs = robot_hrs * _robot_improvement(year)
    robot_cost = effective_robot_hrs * _rate(strength, year)
    return labor + robot_cost


# ── Procedure cost ────────────────────────────────────────────────────────────

def calc_procedure_cost(
    proc_type: str,
    forming_hrs: float,
    scanning_hrs: float,
    cutting_hrs: float,
    cost_per_sheet: float,
    strength: str,
    year: int,
) -> float:
    op_map = {"pre_if": "pre_if_forming", "if_proc": "if_forming", "duplicate": "dup_forming"}
    forming_cost = calc_operation_cost(op_map[proc_type], forming_hrs, strength, year)
    scan_cost    = calc_operation_cost("scanning", scanning_hrs, strength, year)
    cut_cost     = calc_operation_cost("cutting",  cutting_hrs,  strength, year) if cutting_hrs > 0 else 0.0

    if proc_type in ("pre_if", "if_proc"):
        ops = forming_cost + scan_cost
    else:  # duplicate: form + scan + scan + cut
        ops = forming_cost + scan_cost + scan_cost + cut_cost

    return cost_per_sheet + ops


# ── Part cost ─────────────────────────────────────────────────────────────────

@dataclass
class PartInputs:
    quantity_per_assembly: int
    forming_time_hrs: float       # current (2026-baseline) estimate
    scanning_time_hrs: float
    cutting_time_hrs: float
    est_pre_if_procedures: int
    est_if_procedures: int
    cost_per_sheet: float
    ht_cost_per_part: float
    unistrut: bool
    robot_strength: str
    pp_internal: float
    pp_external: float
    first_part_additional_setup: float
    setup_skirt_path_plan_sim_hrs: float


def calc_first_part_cost(part: PartInputs, year: int) -> dict:
    s = part.robot_strength

    pre_if_proc = calc_procedure_cost("pre_if",  part.forming_time_hrs, part.scanning_time_hrs,
                                      part.cutting_time_hrs, part.cost_per_sheet, s, year)
    if_proc     = calc_procedure_cost("if_proc", part.forming_time_hrs, part.scanning_time_hrs,
                                      part.cutting_time_hrs, part.cost_per_sheet, s, year)

    trials = pre_if_proc * part.est_pre_if_procedures + if_proc * part.est_if_procedures

    rpe_setup       = part.setup_skirt_path_plan_sim_hrs * _rate("RPE", year)
    purchaser_setup = PURCHASER_SETUP_HRS    * _rate("Purchaser", year)
    pm_setup        = PM_SETUP_HRS           * _rate("PM",        year)
    prep_shipping   = PALLETIZE_TECH_HRS.get(year, 0.5) * _rate("Tech", year)
    unistrut_cost   = (UNISTRUT_TECH_HRS.get(year, 6.0) * _rate("Tech", year)) if part.unistrut else 0.0
    purchaser_ovhd  = PURCHASER_OVERHEAD_HRS * _rate("Purchaser", year)
    pm_ovhd         = PM_OVERHEAD_HRS        * _rate("PM",        year)

    pp_first = part.pp_internal + part.pp_external + part.first_part_additional_setup + part.ht_cost_per_part

    scan_op = calc_operation_cost("scanning", part.scanning_time_hrs, s, year)
    cut_op  = calc_operation_cost("cutting",  part.cutting_time_hrs,  s, year) if part.cutting_time_hrs > 0 else 0.0

    total = (
        trials
        + rpe_setup + purchaser_setup + pm_setup
        + prep_shipping + unistrut_cost
        + purchaser_ovhd + pm_ovhd
        + pp_first
        + scan_op + cut_op
    )

    return {
        "total": total,
        "breakdown": {
            "pre_if_trials":       pre_if_proc * part.est_pre_if_procedures,
            "if_trials":           if_proc     * part.est_if_procedures,
            "rpe_setup":           rpe_setup,
            "purchaser_setup":     purchaser_setup,
            "pm_setup":            pm_setup,
            "prep_shipping":       prep_shipping,
            "unistrut":            unistrut_cost,
            "purchaser_overhead":  purchaser_ovhd,
            "pm_overhead":         pm_ovhd,
            "post_processing":     pp_first,
            "final_scan_cut_scan": scan_op + cut_op,
        },
    }


def calc_duplicate_part_cost(part: PartInputs, year: int) -> dict:
    s = part.robot_strength
    dup_proc = calc_procedure_cost("duplicate", part.forming_time_hrs, part.scanning_time_hrs,
                                   part.cutting_time_hrs, part.cost_per_sheet, s, year)

    prep_shipping  = PALLETIZE_TECH_HRS.get(year, 0.5) * _rate("Tech", year)
    unistrut_cost  = (UNISTRUT_TECH_HRS.get(year, 6.0) * _rate("Tech", year)) if part.unistrut else 0.0
    purchaser_ovhd = PURCHASER_OVERHEAD_HRS * _rate("Purchaser", year)
    pm_ovhd        = PM_OVERHEAD_HRS        * _rate("PM",        year)
    pp_dup         = part.ht_cost_per_part + part.pp_internal + part.pp_external

    total = dup_proc + prep_shipping + unistrut_cost + purchaser_ovhd + pm_ovhd + pp_dup

    return {
        "total": total,
        "breakdown": {
            "duplicate_procedure": dup_proc,
            "prep_shipping":       prep_shipping,
            "unistrut":            unistrut_cost,
            "purchaser_overhead":  purchaser_ovhd,
            "pm_overhead":         pm_ovhd,
            "post_processing":     pp_dup,
        },
    }


def calc_part_assembly_costs(part: PartInputs, year: int) -> dict:
    first = calc_first_part_cost(part, year)
    dup   = calc_duplicate_part_cost(part, year)
    return {
        "first_assembly":  first["total"] + dup["total"] * (part.quantity_per_assembly - 1),
        "dup_assembly":    dup["total"] * part.quantity_per_assembly,
        "first_part_cost": first["total"],
        "dup_part_cost":   dup["total"],
        "first_breakdown": first["breakdown"],
        "dup_breakdown":   dup["breakdown"],
    }


# ── Project quote ─────────────────────────────────────────────────────────────

@dataclass
class ProjectInputs:
    quantity_of_assemblies: int
    internal_margin: float
    year_of_execution: int
    assembly_pp_internal: float
    assembly_pp_external: float
    assembly_first_part_setup: float
    setup_splitting_hrs: float


def calc_project_quote(project: ProjectInputs, parts: list[PartInputs]) -> dict:
    year = project.year_of_execution
    part_costs = [calc_part_assembly_costs(p, year) for p in parts]

    parts_first = sum(p["first_assembly"] for p in part_costs)
    parts_dup   = sum(p["dup_assembly"]   for p in part_costs)

    rpe_splitting = project.setup_splitting_hrs * _rate("RPE", year)

    first_assembly_total = (
        parts_first + rpe_splitting
        + project.assembly_first_part_setup
        + project.assembly_pp_external
        + project.assembly_pp_internal
    )
    dup_assembly_total = (
        parts_dup
        + project.assembly_pp_external
        + project.assembly_pp_internal
    )

    n_dup      = project.quantity_of_assemblies - 1
    total_cost = first_assembly_total + dup_assembly_total * n_dup
    margin     = project.internal_margin
    quoted     = total_cost / (1.0 - margin) if margin < 1.0 else total_cost

    return {
        "total_cost":          total_cost,
        "quoted_price":        quoted,
        "first_assembly_cost": first_assembly_total,
        "dup_assembly_cost":   dup_assembly_total,
        "num_dup_assemblies":  n_dup,
        "rpe_splitting":       rpe_splitting,
        "margin":              margin,
        "part_details":        part_costs,
        "robot_improvement":   _robot_improvement(year),
    }
