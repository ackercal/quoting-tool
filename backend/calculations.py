"""
Pricing calculations derived from quote_calc_final_labor_forecasts.xlsx (April 2026)
  Two vertical sets: Formed Parts, Custom Auto
  Per-operation robot improvement factors, trial reduction constants
"""
import math
from dataclasses import dataclass

# ── Forecast: Hourly rates (same across years for now) ────────────────────────
HOURLY_RATES: dict[str, dict[int, float]] = {
    "RPE":       {2026: 90.64393939393939, 2027: 90.64393939393939, 2028: 90.64393939393939},
    "ME":        {2026: 90.64393939393939, 2027: 90.64393939393939, 2028: 90.64393939393939},
    "Tech":      {2026: 52.52168831168831, 2027: 52.52168831168831, 2028: 52.52168831168831},
    "Purchaser": {2026: 77.6948051948052,  2027: 77.6948051948052,  2028: 77.6948051948052},
    "PM":        {2026: 84.1693722943723,  2027: 84.1693722943723,  2028: 84.1693722943723},
    "Small":     {2026: 24.42, 2027: 24.42, 2028: 24.42},
    "Medium":    {2026: 37.57, 2027: 37.57, 2028: 37.57},
    "Large":     {2026: 55.07, 2027: 55.07, 2028: 55.07},
}

# ── Forecast: Robot improvement factors — per operation type ──────────────────
# Applied to the user's current robot time estimate.
# User enters 2026-baseline hours; future years multiply by this factor.
ROBOT_IMPROVEMENT: dict[str, dict[int, float]] = {
    "forming":  {2026: 1.0, 2027: 0.65,   2028: 0.4225},
    "scanning": {2026: 1.0, 2027: 0.75,   2028: 0.5},
    "cutting":  {2026: 1.0, 2027: 0.65,   2028: 0.4225},
}

# Maps each operation key → robot improvement category
OP_ROBOT_CATEGORY: dict[str, str] = {
    "pre_if_forming": "forming",
    "if_forming":     "forming",
    "dup_forming":    "forming",
    "first_scan":     "scanning",
    "dup_scan":       "scanning",
    "first_cut":      "cutting",
    "dup_cut":        "cutting",
}

# ── Forecast: Trial reduction — multiplied against est procedures, rounded up ─
TRIAL_REDUCTION: dict[int, float] = {
    2026: 1.0,
    2027: 0.75,
    2028: 0.5,
}

# ── Forecast: Labor hours per operation — Formed Parts ────────────────────────
LABOR_HOURS_FORMED_PARTS: dict[str, dict[int, dict[str, float]]] = {
    "pre_if_forming": {
        2026: {"RPE": 2.0,  "ME": 1.0,  "Tech": 1.5},
        2027: {"RPE": 1.0,  "ME": 0.5,  "Tech": 1.0},
        2028: {"RPE": 0.5,  "ME": 0.0,  "Tech": 0.0},
    },
    "if_forming": {
        2026: {"RPE": 0.75, "ME": 0.5,  "Tech": 1.5},
        2027: {"RPE": 0.25, "ME": 0.0,  "Tech": 1.0},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "dup_forming": {
        2026: {"RPE": 0.0,  "ME": 0.5,  "Tech": 1.5},
        2027: {"RPE": 0.0,  "ME": 0.0,  "Tech": 1.0},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "first_scan": {
        2026: {"RPE": 0.75, "ME": 1.0,  "Tech": 1.0},
        2027: {"RPE": 0.75, "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "dup_scan": {
        2026: {"RPE": 0.0,  "ME": 0.0,  "Tech": 1.0},
        2027: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "first_cut": {
        2026: {"RPE": 3.0,  "ME": 2.5,  "Tech": 0.5},
        2027: {"RPE": 1.5,  "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "dup_cut": {
        2026: {"RPE": 0.5,  "ME": 2.0,  "Tech": 0.5},
        2027: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
}

# ── Forecast: Labor hours per operation — Custom Auto ─────────────────────────
LABOR_HOURS_CUSTOM_AUTO: dict[str, dict[int, dict[str, float]]] = {
    "pre_if_forming": {
        2026: {"RPE": 2.5,  "ME": 0.5,  "Tech": 0.75},
        2027: {"RPE": 1.25, "ME": 0.5,  "Tech": 0.5},
        2028: {"RPE": 0.75, "ME": 0.0,  "Tech": 0.0},
    },
    "if_forming": {
        2026: {"RPE": 1.0,  "ME": 0.5,  "Tech": 0.75},
        2027: {"RPE": 0.25, "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "dup_forming": {
        2026: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.75},
        2027: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "first_scan": {
        2026: {"RPE": 0.0,  "ME": 0.25, "Tech": 0.5},
        2027: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.5},
    },
    "dup_scan": {
        2026: {"RPE": 0.0,  "ME": 0.25, "Tech": 0.5},
        2027: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.25},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "first_cut": {
        2026: {"RPE": 2.0,  "ME": 2.0,  "Tech": 0.5},
        2027: {"RPE": 1.0,  "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
    "dup_cut": {
        2026: {"RPE": 2.0,  "ME": 2.0,  "Tech": 0.5},
        2027: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.5},
        2028: {"RPE": 0.0,  "ME": 0.0,  "Tech": 0.0},
    },
}

LABOR_HOURS_SETS: dict[str, dict] = {
    "formed_parts": LABOR_HOURS_FORMED_PARTS,
    "custom_auto":  LABOR_HOURS_CUSTOM_AUTO,
}

# ── Part-level hours per set ──────────────────────────────────────────────────
PART_HOURS_FORMED_PARTS: dict[str, object] = {
    "palletize_tech":     {2026: 0.5,  2027: 0.5,  2028: 0.5},
    "unistrut_tech":      {2026: 6.0,  2027: 2.0,  2028: 1.0},
    "purchaser_setup":    2.0,
    "pm_setup":           2.0,
    "purchaser_overhead": 0.25,
    "pm_overhead":        0.25,
}
PART_HOURS_CUSTOM_AUTO: dict[str, object] = {
    "palletize_tech":     {2026: 0.5,  2027: 0.5,  2028: 0.5},
    "unistrut_tech":      {2026: 6.0,  2027: 6.0,  2028: 6.0},
    "purchaser_setup":    2.0,
    "pm_setup":           2.0,
    "purchaser_overhead": 0.25,
    "pm_overhead":        0.25,
}
PART_HOURS_SETS: dict[str, dict] = {
    "formed_parts": PART_HOURS_FORMED_PARTS,
    "custom_auto":  PART_HOURS_CUSTOM_AUTO,
}

# ── Project-level overhead hours (year-varying, applied once per project) ─────
PROJECT_HOURS: dict[str, dict[int, float]] = {
    "purchaser": {2026: 2.0, 2027: 1.0, 2028: 1.0},
    "pm":        {2026: 5.0, 2027: 3.0, 2028: 1.0},
}

# Keep alias for any legacy references
LABOR_HOURS = LABOR_HOURS_FORMED_PARTS

# ── Forecast: Extra tech hours (legacy aliases) ───────────────────────────────
UNISTRUT_TECH_HRS:   dict[int, float] = {2026: 6.0, 2027: 2.0, 2028: 1.0}
PALLETIZE_TECH_HRS:  dict[int, float] = {2026: 0.5, 2027: 0.5, 2028: 0.5}

# ── Part-level fixed overhead (legacy scalars) ────────────────────────────────
PURCHASER_SETUP_HRS    = 2.0
PM_SETUP_HRS           = 2.0
PURCHASER_OVERHEAD_HRS = 0.25
PM_OVERHEAD_HRS        = 0.25


# ── Helpers ───────────────────────────────────────────────────────────────────

def _rate(role: str, year: int) -> float:
    return HOURLY_RATES[role].get(year) or HOURLY_RATES[role][2026]

def _get_labor(op: str, year: int, constants_set: str = "formed_parts") -> dict[str, float]:
    table = LABOR_HOURS_SETS.get(constants_set, LABOR_HOURS_FORMED_PARTS)
    op_data = table.get(op, {})
    return op_data.get(year) or op_data.get(2026) or {"RPE": 0.0, "ME": 0.0, "Tech": 0.0}

def _robot_improvement(op: str, year: int) -> float:
    cat = OP_ROBOT_CATEGORY.get(op, "forming")
    return ROBOT_IMPROVEMENT[cat].get(year, 1.0)

def _role_costs(op: str, year: int, constants_set: str = "formed_parts") -> tuple[float, float, float]:
    """Returns (RPE_cost, ME_cost, Tech_cost) for the labor portion of an operation."""
    lh = _get_labor(op, year, constants_set)
    return (
        lh["RPE"]  * _rate("RPE",  year),
        lh["ME"]   * _rate("ME",   year),
        lh["Tech"] * _rate("Tech", year),
    )


# ── Operation cost ────────────────────────────────────────────────────────────
# robot_hrs = user's CURRENT (2026-baseline) estimate.
# Effective robot hrs = robot_hrs * improvement_factor[year]

def calc_operation_cost(op: str, robot_hrs: float, strength: str, year: int, constants_set: str = "formed_parts") -> float:
    hrs = _get_labor(op, year, constants_set)
    labor = (
        hrs["RPE"]  * _rate("RPE",  year)
        + hrs["ME"] * _rate("ME",   year)
        + hrs["Tech"]* _rate("Tech", year)
    )
    effective_robot_hrs = robot_hrs * _robot_improvement(op, year)
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
    constants_set: str = "formed_parts",
) -> float:
    op_map = {"pre_if": "pre_if_forming", "if_proc": "if_forming", "duplicate": "dup_forming"}
    forming_cost = calc_operation_cost(op_map[proc_type], forming_hrs, strength, year, constants_set)
    scan_cost    = calc_operation_cost("dup_scan", scanning_hrs, strength, year, constants_set)
    cut_cost     = calc_operation_cost("dup_cut",  cutting_hrs,  strength, year, constants_set) if cutting_hrs > 0 else 0.0

    if proc_type in ("pre_if", "if_proc"):
        ops = forming_cost + scan_cost
    else:  # duplicate: form + scan [+ scan + cut] (second scan only when cutting > 0)
        ops = forming_cost + scan_cost + (scan_cost + cut_cost if cutting_hrs > 0 else 0.0)

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
    parts_per_sheet: int = 1
    shipping_cost_per_part: float = 0
    manufacturing_method: str = "roboformed"
    other_mfg_internal: bool = True
    other_mfg_cost: float = 0
    other_mfg_cost_dup: float = 0
    labor_constants: str = "formed_parts"


def _op_labor_robot(op: str, robot_hrs: float, strength: str, year: int, constants_set: str = "formed_parts") -> tuple[float, float]:
    """Returns (labor_cost, robot_cost) for a single operation."""
    lh = _get_labor(op, year, constants_set)
    labor = lh["RPE"] * _rate("RPE", year) + lh["ME"] * _rate("ME", year) + lh["Tech"] * _rate("Tech", year)
    robot = robot_hrs * _robot_improvement(op, year) * _rate(strength, year)
    return labor, robot


def calc_first_part_cost(part: PartInputs, year: int) -> dict:
    s  = part.robot_strength
    cs = part.labor_constants

    # Apply trial reduction (round up to nearest whole number)
    trial_factor = TRIAL_REDUCTION.get(year, 1.0)
    n_pre = math.ceil(part.est_pre_if_procedures * trial_factor)
    n_if  = math.ceil(part.est_if_procedures     * trial_factor)

    mat_per_part = part.cost_per_sheet / part.parts_per_sheet
    pre_if_proc = calc_procedure_cost("pre_if",  part.forming_time_hrs, part.scanning_time_hrs,
                                      part.cutting_time_hrs, mat_per_part, s, year, cs)
    if_proc     = calc_procedure_cost("if_proc", part.forming_time_hrs, part.scanning_time_hrs,
                                      part.cutting_time_hrs, mat_per_part, s, year, cs)

    trials = pre_if_proc * n_pre + if_proc * n_if

    ph              = PART_HOURS_SETS.get(cs, PART_HOURS_FORMED_PARTS)
    rpe_setup       = part.setup_skirt_path_plan_sim_hrs * _rate("RPE", year)
    purchaser_setup = ph["purchaser_setup"]              * _rate("Purchaser", year)
    pm_setup        = ph["pm_setup"]                     * _rate("PM",        year)
    prep_shipping   = ph["palletize_tech"].get(year, 0.5)  * _rate("Tech", year)
    unistrut_cost   = (ph["unistrut_tech"].get(year, 6.0)  * _rate("Tech", year)) if part.unistrut else 0.0
    purchaser_ovhd  = ph["purchaser_overhead"]           * _rate("Purchaser", year)
    pm_ovhd         = ph["pm_overhead"]                  * _rate("PM",        year)

    pp_first = part.pp_internal + part.pp_external + part.first_part_additional_setup + part.ht_cost_per_part

    scan_op = calc_operation_cost("first_scan", part.scanning_time_hrs, s, year, cs)
    cut_op  = calc_operation_cost("first_cut", part.cutting_time_hrs,  s, year, cs) if part.cutting_time_hrs > 0 else 0.0

    total = (
        trials
        + rpe_setup + purchaser_setup + pm_setup
        + prep_shipping + unistrut_cost
        + purchaser_ovhd + pm_ovhd
        + pp_first
        + scan_op + cut_op
    )

    # ── Category breakdown ───────────────────────────────────────────────────
    pif_f_l,  pif_f_r  = _op_labor_robot("pre_if_forming", part.forming_time_hrs,  s, year, cs)
    pif_s_l,  pif_s_r  = _op_labor_robot("dup_scan",       part.scanning_time_hrs, s, year, cs)
    if_f_l,   if_f_r   = _op_labor_robot("if_forming",     part.forming_time_hrs,  s, year, cs)
    if_s_l,   if_s_r   = _op_labor_robot("dup_scan",       part.scanning_time_hrs, s, year, cs)
    fs_l,     fs_r     = _op_labor_robot("first_scan",     part.scanning_time_hrs, s, year, cs)
    fc_l,     fc_r     = _op_labor_robot("first_cut",      part.cutting_time_hrs,  s, year, cs) if part.cutting_time_hrs > 0 else (0.0, 0.0)

    cat_labor = (
        (pif_f_l + pif_s_l) * n_pre
        + (if_f_l + if_s_l) * n_if
        + fs_l + fc_l
        + rpe_setup + purchaser_setup + pm_setup
        + prep_shipping + unistrut_cost + purchaser_ovhd + pm_ovhd
        + part.pp_internal + part.pp_external + part.first_part_additional_setup
    )
    cat_robot = (
        (pif_f_r + pif_s_r) * n_pre
        + (if_f_r + if_s_r) * n_if
        + fs_r + fc_r
    )

    # ── Detailed breakdown ───────────────────────────────────────────────────
    pif_rpe, pif_me, pif_tech  = _role_costs("pre_if_forming", year, cs)
    sc_rpe,  sc_me,  sc_tech   = _role_costs("dup_scan",       year, cs)
    if_rpe,  if_me,  if_tech   = _role_costs("if_forming",     year, cs)
    fs_rpe,  fs_me,  fs_tech   = _role_costs("first_scan",     year, cs)
    cut_rpe, cut_me, cut_tech  = _role_costs("first_cut",      year, cs) if part.cutting_time_hrs > 0 else (0.0, 0.0, 0.0)

    mat_per_trial = mat_per_part  # already computed above

    detailed: list[tuple[str, float]] = []

    def _add(lbl: str, val: float) -> None:
        if val > 0:
            detailed.append((lbl, val))

    if n_pre > 0:
        _add("Robot — Pre-IF Forming",  pif_f_r  * n_pre)
        _add("RPE — Pre-IF Forming",    pif_rpe  * n_pre)
        _add("ME — Pre-IF Forming",     pif_me   * n_pre)
        _add("Tech — Pre-IF Forming",   pif_tech * n_pre)
        _add("Robot — Pre-IF Scanning", pif_s_r  * n_pre)
        _add("Tech — Pre-IF Scanning",  sc_tech  * n_pre)
        _add("Sheet Material — Pre-IF", mat_per_trial * n_pre)

    if n_if > 0:
        _add("Robot — IF Forming",  if_f_r  * n_if)
        _add("RPE — IF Forming",    if_rpe  * n_if)
        _add("ME — IF Forming",     if_me   * n_if)
        _add("Tech — IF Forming",   if_tech * n_if)
        _add("Robot — IF Scanning", if_s_r  * n_if)
        _add("Tech — IF Scanning",  sc_tech * n_if)
        _add("Sheet Material — IF", mat_per_trial * n_if)

    _add("Robot — Final Scan", fs_r)
    _add("RPE — Final Scan",   fs_rpe)
    _add("ME — Final Scan",    fs_me)
    _add("Tech — Final Scan",  fs_tech)
    if part.cutting_time_hrs > 0:
        _add("Robot — Final Cut", fc_r)
        _add("RPE — Final Cut",   cut_rpe)
        _add("ME — Final Cut",    cut_me)
        _add("Tech — Final Cut",  cut_tech)

    _add("RPE — Setup",       rpe_setup)
    _add("Purchaser — Setup", purchaser_setup)
    _add("PM — Setup",        pm_setup)

    _add("Tech — Prep for Shipping", prep_shipping)
    _add("Tech — Unistrut",          unistrut_cost)
    _add("Purchaser — Overhead",     purchaser_ovhd)
    _add("PM — Overhead",            pm_ovhd)

    _add("Heat Treatment",                     part.ht_cost_per_part)
    _add("Post Processing — Internal",         part.pp_internal)
    _add("Post Processing — First Part Setup", part.first_part_additional_setup)
    _add("Post Processing — External",         part.pp_external)
    _add("Shipping",                           part.shipping_cost_per_part)

    return {
        "total": total,
        "breakdown": {
            "pre_if_trials":       pre_if_proc * n_pre,
            "if_trials":           if_proc     * n_if,
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
        "category_breakdown": {
            "labor":          cat_labor,
            "robot":          cat_robot,
            "materials":      mat_per_trial * (n_pre + n_if),
            "heat_treat":     part.ht_cost_per_part,
            "shipping":       part.shipping_cost_per_part,
            "non_roboformed": 0.0,
        },
        "detailed_breakdown": detailed,
    }


def calc_duplicate_part_cost(part: PartInputs, year: int) -> dict:
    s  = part.robot_strength
    cs = part.labor_constants
    mat_per_part = part.cost_per_sheet / part.parts_per_sheet
    dup_proc = calc_procedure_cost("duplicate", part.forming_time_hrs, part.scanning_time_hrs,
                                   part.cutting_time_hrs, mat_per_part, s, year, cs)

    ph             = PART_HOURS_SETS.get(cs, PART_HOURS_FORMED_PARTS)
    prep_shipping  = ph["palletize_tech"].get(year, 0.5)  * _rate("Tech", year)
    unistrut_cost  = (ph["unistrut_tech"].get(year, 6.0)  * _rate("Tech", year)) if part.unistrut else 0.0
    purchaser_ovhd = ph["purchaser_overhead"]           * _rate("Purchaser", year)
    pm_ovhd        = ph["pm_overhead"]                  * _rate("PM",        year)
    pp_dup         = part.ht_cost_per_part + part.pp_internal + part.pp_external

    total = dup_proc + prep_shipping + unistrut_cost + purchaser_ovhd + pm_ovhd + pp_dup

    # ── Category breakdown ───────────────────────────────────────────────────
    df_l, df_r = _op_labor_robot("dup_forming", part.forming_time_hrs,  s, year, cs)
    ds_l, ds_r = _op_labor_robot("dup_scan",    part.scanning_time_hrs, s, year, cs)
    dc_l, dc_r = _op_labor_robot("dup_cut",     part.cutting_time_hrs,  s, year, cs) if part.cutting_time_hrs > 0 else (0.0, 0.0)

    # ── Detailed breakdown ───────────────────────────────────────────────────
    df_rpe, df_me, df_tech  = _role_costs("dup_forming", year, cs)
    sc_rpe,  sc_me,  sc_tech = _role_costs("dup_scan",   year, cs)
    dc_rpe, dc_me, dc_tech  = _role_costs("dup_cut",     year, cs) if part.cutting_time_hrs > 0 else (0.0, 0.0, 0.0)
    mat_cost = mat_per_part  # already computed above

    detailed: list[tuple[str, float]] = []

    def _add(lbl: str, val: float) -> None:
        if val > 0:
            detailed.append((lbl, val))

    _add("Robot — Forming", df_r)
    _add("ME — Forming",    df_me)
    _add("Tech — Forming",  df_tech)
    _add("Robot — Scan",    ds_r)
    _add("Tech — Scan",     sc_tech)
    if part.cutting_time_hrs > 0:
        _add("Robot — Pre-Cut Scan", ds_r)
        _add("Tech — Pre-Cut Scan",  sc_tech)
        _add("Robot — Cutting",      dc_r)
        _add("RPE — Cutting",        dc_rpe)
        _add("ME — Cutting",         dc_me)
        _add("Tech — Cutting",       dc_tech)
    _add("Sheet Material",  mat_cost)

    _add("Tech — Prep for Shipping", prep_shipping)
    _add("Tech — Unistrut",          unistrut_cost)
    _add("Purchaser — Overhead",     purchaser_ovhd)
    _add("PM — Overhead",            pm_ovhd)

    _add("Heat Treatment",             part.ht_cost_per_part)
    _add("Post Processing — Internal", part.pp_internal)
    _add("Post Processing — External", part.pp_external)
    _add("Shipping",                   part.shipping_cost_per_part)

    n_scans = 2 if part.cutting_time_hrs > 0 else 1
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
        "category_breakdown": {
            "labor":          df_l + ds_l * n_scans + dc_l + prep_shipping + unistrut_cost + purchaser_ovhd + pm_ovhd + part.pp_internal + part.pp_external,
            "robot":          df_r + ds_r * n_scans + dc_r,
            "materials":      mat_per_part,
            "heat_treat":     part.ht_cost_per_part,
            "shipping":       part.shipping_cost_per_part,
            "non_roboformed": 0.0,
        },
        "detailed_breakdown": detailed,
    }


def calc_part_assembly_costs(part: PartInputs, year: int) -> dict:
    if part.manufacturing_method != "roboformed":
        fc  = part.other_mfg_cost
        dc  = part.other_mfg_cost_dup
        qty = part.quantity_per_assembly
        def _cat(cost):
            return {"labor": 0.0, "robot": 0.0, "materials": 0.0, "heat_treat": 0.0, "shipping": 0.0, "non_roboformed": cost}
        return {
            "first_assembly":  fc + dc * (qty - 1),
            "dup_assembly":    dc * qty,
            "first_part_cost": fc,
            "dup_part_cost":   dc,
            "first_breakdown": {},
            "dup_breakdown":   {},
            "first_category_breakdown": _cat(fc),
            "dup_category_breakdown":   _cat(dc),
        }

    first = calc_first_part_cost(part, year)
    dup   = calc_duplicate_part_cost(part, year)
    return {
        "first_assembly":  first["total"] + dup["total"] * (part.quantity_per_assembly - 1),
        "dup_assembly":    dup["total"] * part.quantity_per_assembly,
        "first_part_cost": first["total"],
        "dup_part_cost":   dup["total"],
        "first_breakdown": first["breakdown"],
        "dup_breakdown":   dup["breakdown"],
        "first_category_breakdown":  first["category_breakdown"],
        "dup_category_breakdown":    dup["category_breakdown"],
        "first_detailed_breakdown":  first["detailed_breakdown"],
        "dup_detailed_breakdown":    dup["detailed_breakdown"],
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
    shipping_cost: float = 0
    osp_margin: float = 0.10


def calc_project_quote(project: ProjectInputs, parts: list[PartInputs]) -> dict:
    year = project.year_of_execution
    part_costs = [calc_part_assembly_costs(p, year) for p in parts]

    parts_first = sum(p["first_assembly"] for p in part_costs)
    parts_dup   = sum(p["dup_assembly"]   for p in part_costs)

    rpe_splitting     = project.setup_splitting_hrs * _rate("RPE", year)
    proj_purchaser    = PROJECT_HOURS["purchaser"].get(year, 1.0) * _rate("Purchaser", year)
    proj_pm           = PROJECT_HOURS["pm"].get(year, 1.0)        * _rate("PM",        year)

    first_assembly_total = (
        parts_first + rpe_splitting
        + proj_purchaser + proj_pm
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
    total_cost = first_assembly_total + dup_assembly_total * n_dup + project.shipping_cost
    margin     = project.internal_margin
    osp_m      = project.osp_margin

    # ── Project-level category breakdown ─────────────────────────────────────
    proj_cat: dict[str, float] = {"labor": 0.0, "robot": 0.0, "materials": 0.0, "heat_treat": 0.0, "shipping": 0.0, "non_roboformed": 0.0}
    for i, p in enumerate(parts):
        fc = part_costs[i]["first_category_breakdown"]
        dc = part_costs[i]["dup_category_breakdown"]
        qty = p.quantity_per_assembly
        for cat in proj_cat:
            proj_cat[cat] += fc[cat] + dc[cat] * (qty - 1) + dc[cat] * qty * n_dup
    proj_cat["labor"] += (
        rpe_splitting
        + proj_purchaser + proj_pm
        + project.assembly_first_part_setup
        + project.assembly_pp_internal * project.quantity_of_assemblies
        + project.assembly_pp_external * project.quantity_of_assemblies
    )
    proj_cat["shipping"] += project.shipping_cost

    # ── OSP vs internal price split ───────────────────────────────────────────
    external_pp_total = (
        sum(p.pp_external * p.quantity_per_assembly for p in parts) * project.quantity_of_assemblies
        + project.assembly_pp_external * project.quantity_of_assemblies
    )
    ext_non_roboformed = sum(
        part_costs[i]["first_part_cost"] + part_costs[i]["dup_part_cost"] * (p.quantity_per_assembly - 1)
        + part_costs[i]["dup_part_cost"] * p.quantity_per_assembly * n_dup
        for i, p in enumerate(parts)
        if p.manufacturing_method != "roboformed" and not p.other_mfg_internal
    )
    osp_cost      = proj_cat["materials"] + proj_cat["heat_treat"] + proj_cat["shipping"] + external_pp_total + ext_non_roboformed
    internal_cost = total_cost - osp_cost
    quoted = (
        (internal_cost / (1.0 - margin) if margin < 1.0 else internal_cost)
        + (osp_cost / (1.0 - osp_m) if osp_m < 1.0 else osp_cost)
    )

    if total_cost > 0:
        first_assembly_price = quoted * first_assembly_total / total_cost
        dup_assembly_price   = quoted * dup_assembly_total   / total_cost
    else:
        first_assembly_price = dup_assembly_price = 0.0

    return {
        "total_cost":                 total_cost,
        "quoted_price":               quoted,
        "first_assembly_cost":        first_assembly_total,
        "dup_assembly_cost":          dup_assembly_total,
        "first_assembly_price":       first_assembly_price,
        "dup_assembly_price":         dup_assembly_price,
        "num_dup_assemblies":         n_dup,
        "rpe_splitting":              rpe_splitting,
        "proj_purchaser":             proj_purchaser,
        "proj_pm":                    proj_pm,
        "margin":                     margin,
        "osp_margin":                 osp_m,
        "part_details":               part_costs,
        "robot_improvement":          {cat: ROBOT_IMPROVEMENT[cat].get(year, 1.0) for cat in ROBOT_IMPROVEMENT},
        "project_category_breakdown": proj_cat,
    }
