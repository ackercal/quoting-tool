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
    "Small":     {2026: 24.42, 2027: 24.42, 2028: 24.42},
    "Medium":    {2026: 37.57, 2027: 37.57, 2028: 37.57},
    "Large":     {2026: 55.07, 2027: 55.07, 2028: 55.07},
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
    parts_per_sheet: int = 1
    shipping_cost_per_part: float = 0
    manufacturing_method: str = "roboformed"
    other_mfg_internal: bool = True
    other_mfg_cost: float = 0
    other_mfg_cost_dup: float = 0


def _op_labor_robot(op: str, robot_hrs: float, strength: str, year: int) -> tuple[float, float]:
    """Returns (labor_cost, robot_cost) for a single operation."""
    lh = _get_labor(op, year)
    labor = lh["RPE"] * _rate("RPE", year) + lh["ME"] * _rate("ME", year) + lh["Tech"] * _rate("Tech", year)
    robot = robot_hrs * _robot_improvement(year) * _rate(strength, year)
    return labor, robot


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

    # ── Category breakdown ───────────────────────────────────────────────────
    pif_f_l,  pif_f_r  = _op_labor_robot("pre_if_forming", part.forming_time_hrs,  s, year)
    pif_s_l,  pif_s_r  = _op_labor_robot("scanning",       part.scanning_time_hrs, s, year)
    if_f_l,   if_f_r   = _op_labor_robot("if_forming",     part.forming_time_hrs,  s, year)
    if_s_l,   if_s_r   = _op_labor_robot("scanning",       part.scanning_time_hrs, s, year)
    fs_l,     fs_r     = _op_labor_robot("scanning",       part.scanning_time_hrs, s, year)
    fc_l,     fc_r     = _op_labor_robot("cutting",        part.cutting_time_hrs,  s, year) if part.cutting_time_hrs > 0 else (0.0, 0.0)

    cat_labor = (
        (pif_f_l + pif_s_l) * part.est_pre_if_procedures
        + (if_f_l + if_s_l) * part.est_if_procedures
        + fs_l + fc_l
        + rpe_setup + purchaser_setup + pm_setup
        + prep_shipping + unistrut_cost + purchaser_ovhd + pm_ovhd
        + part.pp_internal + part.pp_external + part.first_part_additional_setup
    )
    cat_robot = (
        (pif_f_r + pif_s_r) * part.est_pre_if_procedures
        + (if_f_r + if_s_r) * part.est_if_procedures
        + fs_r + fc_r
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
        "category_breakdown": {
            "labor":     cat_labor,
            "robot":     cat_robot,
            "materials": (part.cost_per_sheet / part.parts_per_sheet) * (part.est_pre_if_procedures + part.est_if_procedures),
            "heat_treat": part.ht_cost_per_part,
            "shipping":  part.shipping_cost_per_part,
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

    # ── Category breakdown ───────────────────────────────────────────────────
    df_l, df_r = _op_labor_robot("dup_forming", part.forming_time_hrs,  s, year)
    ds_l, ds_r = _op_labor_robot("scanning",    part.scanning_time_hrs, s, year)
    dc_l, dc_r = _op_labor_robot("cutting",     part.cutting_time_hrs,  s, year) if part.cutting_time_hrs > 0 else (0.0, 0.0)

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
            "labor":     df_l + ds_l * 2 + dc_l + prep_shipping + unistrut_cost + purchaser_ovhd + pm_ovhd + part.pp_internal + part.pp_external,
            "robot":     df_r + ds_r * 2 + dc_r,
            "materials": part.cost_per_sheet / part.parts_per_sheet,
            "heat_treat": part.ht_cost_per_part,
            "shipping":  part.shipping_cost_per_part,
        },
    }


def calc_part_assembly_costs(part: PartInputs, year: int) -> dict:
    if part.manufacturing_method != "roboformed":
        fc  = part.other_mfg_cost
        dc  = part.other_mfg_cost_dup
        qty = part.quantity_per_assembly
        def _cat(cost):
            if part.other_mfg_internal:
                return {"labor": cost, "robot": 0.0, "materials": 0.0, "heat_treat": 0.0, "shipping": 0.0}
            else:
                return {"labor": 0.0, "robot": 0.0, "materials": cost, "heat_treat": 0.0, "shipping": 0.0}
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
        "first_category_breakdown": first["category_breakdown"],
        "dup_category_breakdown":   dup["category_breakdown"],
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
    total_cost = first_assembly_total + dup_assembly_total * n_dup + project.shipping_cost
    margin     = project.internal_margin
    osp_m      = project.osp_margin

    # ── Project-level category breakdown ─────────────────────────────────────
    proj_cat: dict[str, float] = {"labor": 0.0, "robot": 0.0, "materials": 0.0, "heat_treat": 0.0, "shipping": 0.0}
    for i, p in enumerate(parts):
        fc = part_costs[i]["first_category_breakdown"]
        dc = part_costs[i]["dup_category_breakdown"]
        qty = p.quantity_per_assembly
        for cat in proj_cat:
            proj_cat[cat] += fc[cat] + dc[cat] * (qty - 1) + dc[cat] * qty * n_dup
    proj_cat["labor"] += (
        rpe_splitting
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
    osp_cost      = proj_cat["materials"] + proj_cat["heat_treat"] + proj_cat["shipping"] + external_pp_total
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
        "margin":                     margin,
        "osp_margin":                 osp_m,
        "part_details":               part_costs,
        "robot_improvement":          _robot_improvement(year),
        "project_category_breakdown": proj_cat,
    }
