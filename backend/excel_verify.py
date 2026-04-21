"""
Drives Excel via xlwings: writes inputs into the yellow cells,
reads back P26 (first part cost) and P27 (dup part cost),
then compares against the Python calc engine.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import xlwings as xw
from calculations import PartInputs, calc_part_assembly_costs

EXCEL_PATH = r"C:\Users\CalvinAcker\Downloads\claude_version2.xlsx"

# Input cells
IN_YEAR       = "C17"
IN_FORMING    = "C29"
IN_SCANNING   = "C30"
IN_CUTTING    = "C31"
IN_PRE_IF     = "C33"
IN_IF         = "C34"
IN_PPS        = "C37"   # parts per sheet
IN_SHEET_COST = "C38"
IN_HT_COST    = "C40"
IN_UNISTRUT   = "C41"
IN_STRENGTH   = "C43"
IN_PP_INT     = "C45"
IN_PP_EXT     = "C46"
IN_FPS        = "C47"   # first part additional setup
IN_SETUP      = "C49"   # skirt/path/sim hrs

# Output cells
OUT_FIRST = "P26"
OUT_DUP   = "P27"

# ── Test cases ──────────────────────────────────────────────────────────────────
# (name, year, strength, forming, scanning, cutting, qty,
#  pre_if, est_if, cost_sheet, pps, ht_cost, unistrut,
#  pp_internal, pp_external, fps, setup_hrs)
CASES = [
    ("Small-2026-basic",       2026, "Small",  2.0, 1.0, 0.5, 1,  5, 5, 200, 2,  50.0, 0,   0,   0,   0, 4.0),
    ("Medium-2026-unistrut",   2026, "Medium", 3.0, 1.5, 1.0, 2,  3, 3, 350, 1,  75.0, 1, 100,  50, 200, 4.0),
    ("Large-2026-nocut",       2026, "Large",  5.0, 2.0, 0.0, 1,  6, 4, 500, 1, 100.0, 0,   0,   0,   0, 4.0),
    ("Small-2027-basic",       2027, "Small",  2.0, 1.0, 0.5, 1,  5, 5, 200, 2,  50.0, 0,   0,   0,   0, 4.0),
    ("Medium-2027-unistrut",   2027, "Medium", 3.0, 1.5, 1.0, 3,  4, 4, 350, 2,  80.0, 1,  80,  40, 150, 6.0),
    ("Large-2027-nocut",       2027, "Large",  5.0, 2.0, 0.0, 1,  5, 3, 500, 1, 100.0, 0,   0,   0,   0, 4.0),
    ("Small-2028-basic",       2028, "Small",  2.0, 1.0, 0.5, 1,  5, 5, 200, 2,  50.0, 0,   0,   0,   0, 4.0),
    ("Medium-2028-ppandht",    2028, "Medium", 3.0, 1.5, 1.0, 2,  3, 3, 350, 1,  90.0, 0, 120,  60, 300, 4.0),
    ("Large-2028-unistrut",    2028, "Large",  8.0, 3.0, 2.0, 1,  7, 6, 600, 1, 150.0, 1,   0, 100,   0, 8.0),
    ("Small-2026-qty4",        2026, "Small",  1.0, 0.5, 0.0, 4,  2, 2, 150, 4,  30.0, 1,  50,  25, 100, 4.0),
]

def run():
    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    wb = app.books.open(EXCEL_PATH)
    ws = wb.sheets["Labor + Robot Time"]

    all_ok = True
    results = []

    for (name, year, strength, forming, scanning, cutting, qty,
         pre_if_cnt, if_cnt, cost_sheet, pps, ht_cost, unistrut,
         ppi, ppe, fps, setup_hrs) in CASES:

        # Write inputs to Excel
        ws[IN_YEAR].value       = year
        ws[IN_FORMING].value    = forming
        ws[IN_SCANNING].value   = scanning
        ws[IN_CUTTING].value    = cutting
        ws[IN_PRE_IF].value     = pre_if_cnt
        ws[IN_IF].value         = if_cnt
        ws[IN_PPS].value        = pps
        ws[IN_SHEET_COST].value = cost_sheet
        ws[IN_HT_COST].value    = ht_cost
        ws[IN_UNISTRUT].value   = unistrut
        ws[IN_STRENGTH].value   = strength
        ws[IN_PP_INT].value     = ppi
        ws[IN_PP_EXT].value     = ppe
        ws[IN_FPS].value        = fps
        ws[IN_SETUP].value      = setup_hrs

        wb.app.calculate()

        xl_first = float(ws[OUT_FIRST].value)
        xl_dup   = float(ws[OUT_DUP].value)

        # Python calc engine
        part = PartInputs(
            quantity_per_assembly         = qty,
            forming_time_hrs              = forming,
            scanning_time_hrs             = scanning,
            cutting_time_hrs              = cutting,
            est_pre_if_procedures         = pre_if_cnt,
            est_if_procedures             = if_cnt,
            cost_per_sheet                = cost_sheet,
            ht_cost_per_part              = ht_cost,
            unistrut                      = bool(unistrut),
            robot_strength                = strength,
            pp_internal                   = ppi,
            pp_external                   = ppe,
            first_part_additional_setup   = fps,
            setup_skirt_path_plan_sim_hrs = setup_hrs,
        )
        py = calc_part_assembly_costs(part, year)
        py_first = py["first_part_cost"]
        py_dup   = py["dup_part_cost"]

        first_ok = abs(xl_first - py_first) < 0.10
        dup_ok   = abs(xl_dup   - py_dup)   < 0.10
        ok = first_ok and dup_ok
        all_ok = all_ok and ok

        results.append((name, year, strength, xl_first, py_first, first_ok,
                                               xl_dup,   py_dup,   dup_ok))

    wb.close()
    app.quit()

    # ── Print results ──────────────────────────────────────────────────────────
    print(f"\n{'Case':<28} {'Year'} {'Robot':<8} "
          f"{'XL First':>12} {'PY First':>12} {'':6} "
          f"{'XL Dup':>10} {'PY Dup':>10} {''}")
    print("-" * 105)
    for (name, year, strength, xl_f, py_f, f_ok, xl_d, py_d, d_ok) in results:
        fmark = "PASS" if f_ok else "FAIL"
        dmark = "PASS" if d_ok else "FAIL"
        print(f"{name:<28} {year} {strength:<8} "
              f"${xl_f:>11,.2f} ${py_f:>11,.2f} [{fmark}] "
              f"${xl_d:>9,.2f} ${py_d:>9,.2f} [{dmark}]")
    print("-" * 105)
    print(f"OVERALL: {'ALL CASES MATCH' if all_ok else 'DISCREPANCIES FOUND'}")

if __name__ == "__main__":
    run()
