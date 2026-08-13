"""
Historical pricing versions, reconstructed from the git history of calculations.py.
Used to (a) show an App Update History (this quote's price under each past pricing version)
and (b) retroactively rebuild each existing project's baseline at the pricing that was live
when it was last edited.

Each entry is a *pricing-distinct* release: (version, effective_datetime_utc, robot rates,
labor_era). `labor_era` is 'current' (use the live labor/part tables) or 'legacy' (use the
pre-v1.8.3 tables in legacy_pricing.py). Robot roles (RPE/ME/Tech/Purchaser/PM), robot
improvement, trial reduction, and project-hours were unchanged across versions.

Newest first. The top entry's rates+era match what's live now.
"""

PRICING_VERSIONS = [
    ("v1.8.5", "2026-08-12 09:59", {"Small": 10.79, "Medium": 13.69, "Large": 18.50}, "current"),
    ("v1.8.4", "2026-08-12 08:14", {"Small": 11.29, "Medium": 14.19, "Large": 19.00}, "current"),
    ("v1.8.3", "2026-08-07 14:19", {"Small": 10.95, "Medium": 13.69, "Large": 18.24}, "current"),
    ("v1.6.0", "2026-08-04 09:11", {"Small": 10.77, "Medium": 13.51, "Large": 18.06}, "legacy"),
    ("v1.0.0", None,               {"Small": 24.42, "Medium": 37.57, "Large": 55.07}, "legacy"),
]


def version_as_of(updated_at_iso: str | None):
    """The pricing version live at a given 'YYYY-MM-DD HH:MM:SS' time (for baseline reconstruction)."""
    if not updated_at_iso:
        return PRICING_VERSIONS[-1]
    stamp = updated_at_iso[:16]
    for entry in PRICING_VERSIONS:
        eff = entry[1]
        if eff is None or stamp >= eff:
            return entry
    return PRICING_VERSIONS[-1]
