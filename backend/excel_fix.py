"""
Fixes the Excel "Labor + Robot Time" sheet:
  1. Labor hour cells: hardcoded Forecast!BXX -> INDEX/MATCH on C17 (year)
  2. Robot time cells: raw hours -> hours * improvement factor for year
  3. Unistrut (Q12): always-on -> IF(C41=1, ..., 0), also year-based hours
  4. Palletize (O11): hardcoded 2026 -> year-based
Saves to claude_version2_fixed.xlsx, then re-runs verification.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import xlwings as xw
from calculations import PartInputs, calc_part_assembly_costs

SRC  = r"C:\Users\CalvinAcker\Downloads\claude_version2.xlsx"
DEST = r"C:\Users\CalvinAcker\Downloads\claude_version2_fixed.xlsx"

# Helper: INDEX/MATCH formula for a Forecast labor-hours row
def labor(row):
    return f"=INDEX(Forecast!$B${row}:$D${row},MATCH($C$17,Forecast!$B$2:$D$2,0))"

# Helper: robot time * improvement factor (per-op improvement row in Forecast 44-48)
def robot_improved(time_cell, imp_row):
    return (f"={time_cell}"
            f"*INDEX(Forecast!$B${imp_row}:$D${imp_row},"
            f"MATCH($C$17,Forecast!$B$42:$D$42,0))")

# Helper: year-based misc hours (unistrut/palletize)
def misc(row):
    return f"=INDEX(Forecast!$B${row}:$D${row},MATCH($C$17,Forecast!$B$2:$D$2,0))"

FORMULA_FIXES = {
    # ── Labor hours: pre-IF forming (op rows 5-9, F col) ──
    "F6":  labor(17),   # pre-IF RPE
    "F7":  labor(18),   # pre-IF ME
    "F8":  labor(19),   # pre-IF Tech
    # ── Labor hours: IF forming (op rows 11-15) ──
    "F12": labor(21),   # IF RPE
    "F13": labor(22),   # IF ME
    "F14": labor(23),   # IF Tech
    # ── Labor hours: Duplicate forming (op rows 17-21) ──
    "F18": labor(25),   # Dup RPE
    "F19": labor(26),   # Dup ME
    "F20": labor(27),   # Dup Tech
    # ── Labor hours: Scanning (op rows 23-27) ──
    "F24": labor(29),   # Scan RPE
    "F25": labor(30),   # Scan ME
    "F26": labor(31),   # Scan Tech
    # ── Labor hours: Cutting (op rows 29-33) ──
    "F30": labor(33),   # Cut RPE
    "F31": labor(34),   # Cut ME
    "F32": labor(35),   # Cut Tech
    # ── Robot time * improvement factor ──
    "F9":  robot_improved("C29", 44),   # pre-IF forming robot
    "F15": robot_improved("C29", 45),   # IF forming robot
    "F21": robot_improved("C29", 46),   # Dup forming robot
    "F27": robot_improved("C30", 47),   # Scanning robot
    "F33": robot_improved("C31", 48),   # Cutting robot
    # ── Palletize hours: year-based ──
    "O11": misc(38),
    # ── Unistrut hours: year-based ──
    "O12": misc(37),
    # ── Unistrut cost: conditional on C41 toggle ──
    "Q12": "=IF($C$41=1,O12*P12,0)",
}

# ── Test cases (same as verify_math) ──────────────────────────────────────────
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

IN = dict(year="C17", forming="C29", scanning="C30", cutting="C31",
          pre_if="C33", est_if="C34", pps="C37", sheet_cost="C38",
          ht_cost="C40", unistrut="C41", strength="C43",
          pp_int="C45", pp_ext="C46", fps="C47", setup="C49")

def run():
    import shutil
    shutil.copy2(SRC, DEST)

    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    wb = app.books.open(DEST)
    ws = wb.sheets["Labor + Robot Time"]

    # Apply formula fixes
    print("Applying formula fixes...")
    for cell, formula in FORMULA_FIXES.items():
        ws[cell].value = formula
        print(f"  {cell}: {formula}")

    wb.save()
    print(f"\nSaved fixed workbook to {DEST}")

    # ── Verify all 10 cases ────────────────────────────────────────────────────
    print("\nRunning verification against Python engine...")
    all_ok = True
    results = []

    for (name, year, strength, forming, scanning, cutting, qty,
         pre_if_cnt, if_cnt, cost_sheet, pps, ht_cost, unistrut,
         ppi, ppe, fps, setup_hrs) in CASES:

        ws[IN["year"]].value       = year
        ws[IN["forming"]].value    = forming
        ws[IN["scanning"]].value   = scanning
        ws[IN["cutting"]].value    = cutting
        ws[IN["pre_if"]].value     = pre_if_cnt
        ws[IN["est_if"]].value     = if_cnt
        ws[IN["pps"]].value        = pps
        ws[IN["sheet_cost"]].value = cost_sheet
        ws[IN["ht_cost"]].value    = ht_cost
        ws[IN["unistrut"]].value   = unistrut
        ws[IN["strength"]].value   = strength
        ws[IN["pp_int"]].value     = ppi
        ws[IN["pp_ext"]].value     = ppe
        ws[IN["fps"]].value        = fps
        ws[IN["setup"]].value      = setup_hrs

        wb.app.calculate()

        xl_first = float(ws["P26"].value)
        xl_dup   = float(ws["P27"].value)

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

        f_ok = abs(xl_first - py_first) < 0.10
        d_ok = abs(xl_dup   - py_dup)   < 0.10
        ok = f_ok and d_ok
        all_ok = all_ok and ok
        results.append((name, year, strength, xl_first, py_first, f_ok,
                                               xl_dup,   py_dup,   d_ok))

    wb.close()
    app.quit()

    print(f"\n{'Case':<28} {'Year'} {'Robot':<8} "
          f"{'XL First':>12} {'PY First':>12} {'':6} "
          f"{'XL Dup':>10} {'PY Dup':>10}")
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
