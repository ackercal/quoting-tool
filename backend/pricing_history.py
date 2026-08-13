"""
Historical robot-rate epochs, reconstructed from the git history of calculations.py.
Used to retroactively rebuild each existing project's baseline quote at the rates that
were live when the project was last edited.

Only the robot cell rates (Small/Medium/Large) changed over time; the labor roles
(RPE/ME/Tech/Purchaser/PM) were constant. Labor-hour tables also changed once (Aug 7),
but the rate changes are the dominant and most frequent driver, so reconstruction keys
off the rate history and uses the current labor tables. Reconstructed snapshots are
clearly labeled and flagged stale so they can be refreshed.

Each epoch: (effective_datetime_utc, {Small, Medium, Large}). Newest first.
"""

RATE_EPOCHS = [
    ("2026-08-12 09:59", {"Small": 10.79, "Medium": 13.69, "Large": 18.50}),  # v1.8.5 (current)
    ("2026-08-12 08:14", {"Small": 11.29, "Medium": 14.19, "Large": 19.00}),  # v1.8.4
    ("2026-08-07 14:19", {"Small": 10.95, "Medium": 13.69, "Large": 18.24}),  # v1.8.3
    ("2026-08-04 09:11", {"Small": 10.77, "Medium": 13.51, "Large": 18.06}),  # bde9cf0
    ("0000-00-00 00:00", {"Small": 24.42, "Medium": 37.57, "Large": 55.07}),  # original (Apr–early Aug)
]


def rates_as_of(updated_at_iso: str | None) -> dict:
    """Robot rates (Small/Medium/Large) that were live at a given 'YYYY-MM-DD HH:MM:SS' time."""
    if not updated_at_iso:
        return RATE_EPOCHS[-1][1]
    stamp = updated_at_iso[:16]  # 'YYYY-MM-DD HH:MM'
    for eff, rates in RATE_EPOCHS:
        if stamp >= eff:
            return rates
    return RATE_EPOCHS[-1][1]
