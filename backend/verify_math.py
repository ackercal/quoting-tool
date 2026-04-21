"""
Math verification script — runs 10 part configs and checks:
  1. breakdown items sum to reported total
  2. robot improvement factor is applied correctly
  3. project quote margin formula is correct
  4. prints every intermediate so you can cross-check against Excel
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from calculations import (
    PartInputs, ProjectInputs,
    calc_first_part_cost, calc_duplicate_part_cost,
    calc_part_assembly_costs, calc_project_quote,
    calc_operation_cost, HOURLY_RATES, ROBOT_IMPROVEMENT, LABOR_HOURS,
    PALLETIZE_TECH_HRS, UNISTRUT_TECH_HRS,
    PURCHASER_SETUP_HRS, PM_SETUP_HRS,
    PURCHASER_OVERHEAD_HRS, PM_OVERHEAD_HRS,
)

def check(label, got, expected, tol=0.01):
    ok = abs(got - expected) < tol
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}: {got:.4f}  (expected {expected:.4f})")
    return ok

def check_sum(label, total, parts_dict):
    s = sum(parts_dict.values())
    ok = abs(total - s) < 0.01
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label} total {total:.2f} == sum of breakdown {s:.2f}")
    return ok

# ─────────────────────────────────────────────────────────────────────────────
# 10 test cases: (name, year, strength, forming, scanning, cutting, qty,
#                 pre_if, est_if, cost_per_sheet, parts_per_sheet,
#                 ht_cost, unistrut, pp_internal, pp_external,
#                 first_part_setup, setup_skirt_hrs)
# ─────────────────────────────────────────────────────────────────────────────
CASES = [
    # name                     yr    str       form scan  cut  qty  pre  if  sheet  pps  ht    uni  ppi  ppe  fps  setup
    ("Small-2026-basic",       2026, "Small",  2.0, 1.0, 0.5,  1,   5,  5,  200,   2,  50.0, 0,   0,   0,   0,  4.0),
    ("Medium-2026-unistrut",   2026, "Medium", 3.0, 1.5, 1.0,  2,   3,  3,  350,   1,  75.0, 1, 100,  50,  200, 4.0),
    ("Large-2026-nocut",       2026, "Large",  5.0, 2.0, 0.0,  1,   6,  4,  500,   1,  100.0,0,   0,   0,   0,  4.0),
    ("Small-2027-basic",       2027, "Small",  2.0, 1.0, 0.5,  1,   5,  5,  200,   2,  50.0, 0,   0,   0,   0,  4.0),
    ("Medium-2027-unistrut",   2027, "Medium", 3.0, 1.5, 1.0,  3,   4,  4,  350,   2,  80.0, 1,  80,  40,  150, 6.0),
    ("Large-2027-nocut",       2027, "Large",  5.0, 2.0, 0.0,  1,   5,  3,  500,   1,  100.0,0,   0,   0,   0,  4.0),
    ("Small-2028-basic",       2028, "Small",  2.0, 1.0, 0.5,  1,   5,  5,  200,   2,  50.0, 0,   0,   0,   0,  4.0),
    ("Medium-2028-ppandht",    2028, "Medium", 3.0, 1.5, 1.0,  2,   3,  3,  350,   1,  90.0, 0, 120,  60,  300, 4.0),
    ("Large-2028-unistrut",    2028, "Large",  8.0, 3.0, 2.0,  1,   7,  6,  600,   1,  150.0,1,   0, 100,   0,  8.0),
    ("Small-2026-qty4-unistr", 2026, "Small",  1.0, 0.5, 0.0,  4,   2,  2,  150,   4,  30.0, 1,  50,  25,  100, 4.0),
]

all_ok = True

for (name, year, strength, forming, scanning, cutting, qty,
     pre_if_cnt, if_cnt, cost_sheet, pps, ht_cost, unistrut,
     ppi, ppe, fps, setup_hrs) in CASES:

    part = PartInputs(
        quantity_per_assembly        = qty,
        forming_time_hrs             = forming,
        scanning_time_hrs            = scanning,
        cutting_time_hrs             = cutting,
        est_pre_if_procedures        = pre_if_cnt,
        est_if_procedures            = if_cnt,
        cost_per_sheet               = cost_sheet,
        ht_cost_per_part             = ht_cost,
        unistrut                     = bool(unistrut),
        robot_strength               = strength,
        pp_internal                  = ppi,
        pp_external                  = ppe,
        first_part_additional_setup  = fps,
        setup_skirt_path_plan_sim_hrs= setup_hrs,
    )

    first = calc_first_part_cost(part, year)
    dup   = calc_duplicate_part_cost(part, year)
    assy  = calc_part_assembly_costs(part, year)

    ri    = ROBOT_IMPROVEMENT[year]
    r_RPE = HOURLY_RATES["RPE"][year]
    r_ME  = HOURLY_RATES["ME"][year]
    r_Tech= HOURLY_RATES["Tech"][year]
    r_rob = HOURLY_RATES[strength][year]

    print(f"\n{'='*70}")
    print(f"CASE: {name}  |  year={year}  robot={strength}  qty={qty}/asm")
    print(f"  robot improvement factor: {ri}")
    print(f"  forming={forming}h  scanning={scanning}h  cutting={cutting}h")
    print(f"  pre_if trials={pre_if_cnt}  if trials={if_cnt}")
    print(f"  cost/sheet=${cost_sheet}  parts/sheet={pps}  ht/part=${ht_cost}")
    print(f"  unistrut={bool(unistrut)}  pp_internal=${ppi}  pp_external=${ppe}  fps=${fps}")

    # ── manual spot-check: forming labor for one pre_if procedure
    lh = LABOR_HOURS["pre_if_forming"][year]
    manual_pre_if_labor = lh["RPE"]*r_RPE + lh["ME"]*r_ME + lh["Tech"]*r_Tech
    manual_pre_if_robot = forming * ri * r_rob
    manual_pre_if_op_cost = manual_pre_if_labor + manual_pre_if_robot
    from_code = calc_operation_cost("pre_if_forming", forming, strength, year)
    print(f"\n  [spot] pre_if forming op cost:")
    print(f"    labor = {lh['RPE']}×{r_RPE:.2f} + {lh['ME']}×{r_ME:.2f} + {lh['Tech']}×{r_Tech:.2f} = {manual_pre_if_labor:.4f}")
    print(f"    robot = {forming}h × {ri} × {r_rob:.4f} = {manual_pre_if_robot:.4f}")
    all_ok &= check("pre_if forming op vs manual", from_code, manual_pre_if_op_cost)

    # ── check scan op
    scan_lh = LABOR_HOURS["scanning"][year]
    manual_scan_labor = scan_lh["RPE"]*r_RPE + scan_lh["ME"]*r_ME + scan_lh["Tech"]*r_Tech
    manual_scan_robot = scanning * ri * r_rob
    scan_from_code = calc_operation_cost("scanning", scanning, strength, year)
    all_ok &= check("scanning op vs manual", scan_from_code, manual_scan_labor + manual_scan_robot)

    # ── check first part breakdown sum
    print(f"\n  First part breakdown:")
    for k, v in first["breakdown"].items():
        print(f"    {k}: {v:.2f}")
    all_ok &= check_sum("first part", first["total"], first["breakdown"])

    # ── check dup part breakdown sum
    print(f"\n  Dup part breakdown:")
    for k, v in dup["breakdown"].items():
        print(f"    {k}: {v:.2f}")
    all_ok &= check_sum("dup part", dup["total"], dup["breakdown"])

    # ── check first_assembly = first + (qty-1)*dup
    expected_first_assy = first["total"] + dup["total"] * (qty - 1)
    all_ok &= check("first_assembly cost", assy["first_assembly"], expected_first_assy)

    # ── check dup_assembly = qty * dup
    expected_dup_assy = dup["total"] * qty
    all_ok &= check("dup_assembly cost", assy["dup_assembly"], expected_dup_assy)

    print(f"\n  first_part_cost  = ${first['total']:>10.2f}")
    print(f"  dup_part_cost    = ${dup['total']:>10.2f}")
    print(f"  first_assy_cost  = ${assy['first_assembly']:>10.2f}  (first + {qty-1} dups)")
    print(f"  dup_assy_cost    = ${assy['dup_assembly']:>10.2f}  ({qty} × dup)")


# ─────────────────────────────────────────────────────────────────────────────
# Project-level quote test
# Use case 0 (Small-2026-basic, qty=1) as single part
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n{'='*70}")
print("PROJECT QUOTE TEST — 1 assembly, margin=0.70, one part (Small-2026-basic)")

p_part = PartInputs(
    quantity_per_assembly=1, forming_time_hrs=2.0, scanning_time_hrs=1.0,
    cutting_time_hrs=0.5, est_pre_if_procedures=5, est_if_procedures=5,
    cost_per_sheet=200, ht_cost_per_part=50.0, unistrut=False,
    robot_strength="Small", pp_internal=0, pp_external=0,
    first_part_additional_setup=0, setup_skirt_path_plan_sim_hrs=4.0,
)
proj = ProjectInputs(
    quantity_of_assemblies=1, internal_margin=0.70, year_of_execution=2026,
    assembly_pp_internal=0, assembly_pp_external=0,
    assembly_first_part_setup=0, setup_splitting_hrs=2.0,
)
q = calc_project_quote(proj, [p_part])

first_assy = calc_part_assembly_costs(p_part, 2026)["first_assembly"]
rpe_split = proj.setup_splitting_hrs * HOURLY_RATES["RPE"][2026]
expected_total_cost = first_assy + rpe_split  # 1 assembly = just first assembly
expected_quoted = expected_total_cost / (1 - 0.70)

print(f"  first_assembly (part): ${first_assy:.2f}")
print(f"  rpe_splitting:         ${rpe_split:.2f}")
print(f"  total_cost:            ${q['total_cost']:.2f}  (expected {expected_total_cost:.2f})")
print(f"  quoted_price:          ${q['quoted_price']:.2f}  (expected {expected_quoted:.2f})")
all_ok &= check("total_cost", q["total_cost"], expected_total_cost)
all_ok &= check("quoted_price", q["quoted_price"], expected_quoted)

# margin formula: quoted = cost / (1 - margin)
all_ok &= check("margin check: cost = quoted × (1-m)",
                q["quoted_price"] * (1 - 0.70), q["total_cost"])

print(f"\n{'='*70}")
print(f"OVERALL: {'ALL CHECKS PASSED' if all_ok else 'SOME CHECKS FAILED'}")
