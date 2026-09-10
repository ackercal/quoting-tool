"""
Salesforce account + opportunity lists, sourced from Databricks.

This mirrors the way Calvin's Databricks ETL reads Salesforce: there is NO SQL
warehouse in the workspace, so we run Spark SQL on the interactive cluster via
the SDK `command_execution` API (same pattern as the databricks-metrics repo).

Only the two lists are pulled here (accounts = SF Accounts, opportunities =
SF Opportunities) — none of the code-generation / mapping logic. Results are
cached to disk and refreshed at most ~hourly.

Credentials are read from the environment first, then a local (gitignored)
config file. They are NEVER hardcoded in committed source.
    env: DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_CLUSTER_ID
    file: backend/sf_config.local.json  {"host": ..., "token": ..., "cluster_id": ...}
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Optional

_HERE = Path(__file__).resolve().parent
_CONFIG_FILE = _HERE / "sf_config.local.json"
_CACHE_FILE = _HERE / "sf_cache.json"

# Refresh at most this often. The lists change slowly; "refilled every hour or
# so" per the original query's cadence.
_TTL_SECONDS = 3600

# The command_execution inline result set is capped (~1000 rows), so both
# queries are paged with LIMIT/OFFSET ordered by the unique id and re-sorted by
# name afterward. Page size stays at/under that cap.
_PAGE = 1000
_MAX_ROWS = 100_000  # safety stop

_ACCOUNTS_SELECT = "SELECT id, name FROM salesforce.account WHERE is_deleted = FALSE AND name IS NOT NULL"
_OPPS_SELECT = (
    "SELECT id, name, account_id, stage_name, is_closed, is_won, amount, close_date "
    "FROM salesforce.opportunity WHERE is_deleted = FALSE AND name IS NOT NULL"
)
# Seed / uniqueness baseline: existing project codes from the Databricks ETL.
_SEED_SELECT = (
    "SELECT project_code, account_name, opp_name, sf_account_id, sf_opp_id, "
    "sf_account_index, sf_opp_index, is_closed, is_won, opp_created_date "
    "FROM etl.sf_opportunities WHERE project_code IS NOT NULL"
)

_lock = threading.Lock()
_mem: Optional[dict] = None  # in-process copy of the cached payload


class SalesforceUnavailable(RuntimeError):
    """Raised when the lists cannot be fetched and no cache exists."""


def _config() -> dict:
    host = os.environ.get("DATABRICKS_HOST")
    token = os.environ.get("DATABRICKS_TOKEN")
    cluster = os.environ.get("DATABRICKS_CLUSTER_ID")
    if not (host and token and cluster) and _CONFIG_FILE.exists():
        try:
            file_cfg = json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            raise SalesforceUnavailable(f"could not read {_CONFIG_FILE.name}: {e}")
        host = host or file_cfg.get("host")
        token = token or file_cfg.get("token")
        cluster = cluster or file_cfg.get("cluster_id")
    if not (host and token and cluster):
        raise SalesforceUnavailable(
            "Databricks credentials not configured. Set DATABRICKS_HOST / "
            "DATABRICKS_TOKEN / DATABRICKS_CLUSTER_ID, or create "
            "backend/sf_config.local.json."
        )
    return {"host": host, "token": token, "cluster_id": cluster}


def _fetch_from_databricks() -> dict:
    """Run the two SELECTs on the interactive cluster. Blocking; call off the event loop."""
    from databricks.sdk import WorkspaceClient
    from databricks.sdk.service.compute import Language

    cfg = _config()
    w = WorkspaceClient(host=cfg["host"], token=cfg["token"])
    cluster_id = cfg["cluster_id"]
    ctx = w.command_execution.create(cluster_id=cluster_id, language=Language.SQL).result()
    try:
        def run(sql: str) -> list[list]:
            r = w.command_execution.execute(
                cluster_id=cluster_id, context_id=ctx.id,
                language=Language.SQL, command=sql,
            ).result()
            res = r.results
            rtype = getattr(res, "result_type", None)
            if rtype is not None and str(getattr(rtype, "value", rtype)).lower() == "error":
                summary = getattr(res, "summary", "") or getattr(res, "cause", "") or "query error"
                raise SalesforceUnavailable(f"Databricks query failed: {summary}")
            return list(res.data) if res and res.data else []

        def run_all(select_sql: str) -> list[list]:
            """Page past the inline row cap, ordered by the unique id."""
            out: list[list] = []
            offset = 0
            while offset < _MAX_ROWS:
                batch = run(f"{select_sql} ORDER BY id LIMIT {_PAGE} OFFSET {offset}")
                out.extend(batch)
                if len(batch) < _PAGE:
                    break
                offset += _PAGE
            return out

        acct_rows = run_all(_ACCOUNTS_SELECT)
        opp_rows = run_all(_OPPS_SELECT)
    finally:
        try:
            w.command_execution.destroy(cluster_id=cluster_id, context_id=ctx.id)
        except Exception:  # noqa: BLE001
            pass

    def _as_bool(v) -> bool:
        return str(v).strip().lower() in ("true", "1", "t", "yes")

    accounts = [{"id": r[0], "name": r[1]} for r in acct_rows if r and r[0] and r[1]]
    accounts.sort(key=lambda a: a["name"].lower())
    def _num(v):
        try:
            return float(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    opportunities = [
        {
            "id": r[0], "name": r[1], "account_id": r[2],
            "stage": r[3] if len(r) > 3 else None,
            # is_closed=False => opportunity is still active/open (for later filtering).
            "is_closed": _as_bool(r[4]) if len(r) > 4 else False,
            "is_won": _as_bool(r[5]) if len(r) > 5 else False,
            "amount": _num(r[6]) if len(r) > 6 else None,
            "close_date": (r[7] if len(r) > 7 else None) or None,
        }
        for r in opp_rows if r and r[0] and r[1]
    ]
    opportunities.sort(key=lambda o: o["name"].lower())
    return {
        "fetched_at": time.time(),
        "accounts": accounts,
        "opportunities": opportunities,
    }


def _load_cache() -> Optional[dict]:
    global _mem
    if _mem is not None:
        return _mem
    if _CACHE_FILE.exists():
        try:
            _mem = json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
            return _mem
        except Exception:  # noqa: BLE001
            return None
    return None


def _save_cache(payload: dict) -> None:
    global _mem
    _mem = payload
    try:
        _CACHE_FILE.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def _is_fresh(payload: Optional[dict]) -> bool:
    return bool(payload) and (time.time() - payload.get("fetched_at", 0)) < _TTL_SECONDS


def get_options(force: bool = False) -> dict:
    """Return {accounts, opportunities, fetched_at, stale}. Uses cache within TTL.

    On refresh failure, falls back to stale cache (marked stale) rather than erroring,
    so the tab keeps working. Raises SalesforceUnavailable only if there is nothing
    at all to return.
    """
    cached = _load_cache()
    if not force and _is_fresh(cached):
        return {**cached, "stale": False}

    with _lock:
        # Re-check after acquiring the lock — another request may have refreshed.
        cached = _load_cache()
        if not force and _is_fresh(cached):
            return {**cached, "stale": False}
        try:
            fresh = _fetch_from_databricks()
            _save_cache(fresh)
            return {**fresh, "stale": False}
        except Exception as e:  # noqa: BLE001
            if cached:
                return {**cached, "stale": True, "error": str(e)}
            raise SalesforceUnavailable(str(e))


def fetch_seed_rows() -> list[dict]:
    """Pull existing project codes from etl.sf_opportunities (Databricks).

    Used once to seed the project_codes table as a uniqueness baseline. Blocking;
    call off the event loop."""
    from databricks.sdk import WorkspaceClient
    from databricks.sdk.service.compute import Language

    cfg = _config()
    w = WorkspaceClient(host=cfg["host"], token=cfg["token"])
    cluster_id = cfg["cluster_id"]
    ctx = w.command_execution.create(cluster_id=cluster_id, language=Language.SQL).result()
    try:
        def run(sql: str) -> list[list]:
            r = w.command_execution.execute(
                cluster_id=cluster_id, context_id=ctx.id,
                language=Language.SQL, command=sql,
            ).result()
            res = r.results
            rtype = getattr(res, "result_type", None)
            if rtype is not None and str(getattr(rtype, "value", rtype)).lower() == "error":
                summary = getattr(res, "summary", "") or getattr(res, "cause", "") or "query error"
                raise SalesforceUnavailable(f"Databricks seed query failed: {summary}")
            return list(res.data) if res and res.data else []

        rows: list[list] = []
        offset = 0
        while offset < _MAX_ROWS:
            batch = run(f"{_SEED_SELECT} ORDER BY sf_opp_index LIMIT {_PAGE} OFFSET {offset}")
            rows.extend(batch)
            if len(batch) < _PAGE:
                break
            offset += _PAGE
    finally:
        try:
            w.command_execution.destroy(cluster_id=cluster_id, context_id=ctx.id)
        except Exception:  # noqa: BLE001
            pass

    def _as_bool(v) -> bool:
        return str(v).strip().lower() in ("true", "1", "t", "yes")

    def _as_int(v):
        try:
            return int(float(v)) if v not in (None, "") else None
        except (TypeError, ValueError):
            return None

    seed: list[dict] = []
    for r in rows:
        if not r or not r[0]:
            continue
        seed.append({
            "code": str(r[0]).strip(),
            "customer": r[1],
            "project_name": r[2],
            "sf_account_id": r[3],
            "sf_opp_id": r[4],
            "sf_account_index": _as_int(r[5]),
            "sf_opp_index": _as_int(r[6]),
            "is_closed": _as_bool(r[7]),
            "is_won": _as_bool(r[8]),
            "created_date": (str(r[9])[:19] if len(r) > 9 and r[9] else None),
        })
    return seed
