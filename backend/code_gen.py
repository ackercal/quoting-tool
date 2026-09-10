"""
Project-code generation.

Prefix logic is ported from the Databricks `CodeGen` letter derivation (first-4 /
word-initials), but WITHOUT the collision letter-swapping — the part that produced
the "random three letters". Uniqueness is instead a numeric per-prefix counter:
  Toyota's projects -> TOYT001, TOYT002, ...
  Internal Product  -> M_Product001, ...

Codes are always checked against the full set of existing codes (seeded from the
current Salesforce dataset + anything already generated) so they never collide.
"""
from __future__ import annotations

import re


def _alpha_upper(s: str) -> str:
    return "".join(ch for ch in s.upper() if ch.isalpha())


def customer_prefix(account_name: str) -> str:
    """Clean 4-char prefix from an account name — the natural branch of the
    Databricks CodeGen letter logic (no collision variants)."""
    name = (account_name or "").strip()
    words = [w for w in name.upper().split() if w.isalpha()]

    if len(words) >= 4:
        code = "".join(w[0] for w in words[:4])
    elif len(words) == 3:
        code = words[0][:2] + words[1][0] + words[2][0]
    elif len(words) == 2:
        code = words[0][:2] + words[1][:2]
    elif len(words) == 1:
        code = words[0][:4]
    else:
        # No clean alpha words (digits/punctuation names) — fall back to letters.
        code = _alpha_upper(name)[:4]

    code = _alpha_upper(code)[:4]
    if not code:
        code = "XXXX"
    return code.ljust(4, "X")


def internal_prefix(team: str) -> str:
    """Internal codes reuse the customer 4-char compaction with an 'M' in front,
    e.g. Product -> MPROD, Software -> MSOFT. One char longer than customer codes."""
    return "M" + customer_prefix(team or "Other")


def next_code(prefix: str, existing_codes: set[str], pad: int = 3) -> str:
    """Return the first free <prefix><NNN> not already in existing_codes.

    Starts from one past the highest number already used under this exact prefix
    (so it continues cleanly), then guarantees the full string is unused."""
    pat = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    highest = 0
    for c in existing_codes:
        m = pat.match(c)
        if m:
            highest = max(highest, int(m.group(1)))

    n = highest + 1
    while True:
        candidate = f"{prefix}{str(n).zfill(pad)}"
        if candidate not in existing_codes:
            return candidate
        n += 1
