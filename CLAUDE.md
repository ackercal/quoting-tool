# Quote Tool — Context

## Repositories & Deployment
- **GitHub:** https://github.com/ackercal/quoting-tool (default branch `master`)
- **Deployed:** https://machina-quoting-tool.azurewebsites.us/ (Azure App Service, Docker container, US Gov). Behind **Entra sign-in** (Easy Auth) — anonymous requests get 401/redirect to Microsoft login.
- Azure sends email alerts when the app goes down (Azure Monitor).
- **Deploy = build image in ACR, then repoint + restart** (there is NO GitHub Actions pipeline). Commit/push to `master`, then:
  1. `az account set --subscription Machina-Prod`
  2. `az acr build --registry machinaquotetool --image quote-tool:latest .` (from repo root; builds server-side from the Dockerfile)
  3. `az webapp config container set -g quoting-tool-rg -n machina-quoting-tool --container-image-name machinaquotetool.azurecr.us/quote-tool:latest --container-registry-url https://machinaquotetool.azurecr.us`
  4. `az webapp restart -g quoting-tool-rg -n machina-quoting-tool`
  - **`az` CLI unicode bug on Windows:** `az acr build` crashes the CLI while streaming build logs (cp1252 can't encode vite's `✓`). The build still runs server-side — set `PYTHONIOENCODING=utf-8` and/or poll `az acr task list-runs --registry machinaquotetool --top 1` for status instead of trusting the stream.
  - App Service pulls `:latest` from ACR only on restart (same-tag), so step 3+4 are needed each deploy. Restore the local default sub (`machina-sandbox`) when done.

## What this is
Internal manufacturing cost quoting tool for Machina Labs. Takes project inputs (part count, operation types, materials, timeline) and computes a full labor + cost quote using forecasted hourly rates and robot improvement factors.

## Stack
- **Backend:** FastAPI + SQLite (`backend/quote_tool.db`), Python 3.12
- **Frontend:** React + TypeScript + Vite
- **Backend port:** 8000
- **Frontend port:** 5173 (dev), 4173 (preview)

## How to run
```bash
# Backend
cd backend
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm run dev
```

## Key files
- `backend/main.py` — FastAPI app, all API routes
- `backend/calculations.py` — All pricing logic: hourly rates, labor hours, robot improvement factors, trial reduction constants
- `backend/database.py` — SQLite init and connection helpers
- `backend/quote_tool.db` — SQLite database (local, not committed)
- `frontend/src/` — React frontend

## Pricing model
All pricing constants live in `backend/calculations.py` (the runtime source of truth; the DB `constants` table is display-only). Two labor constant sets: **Formed Parts** (`formed_parts`) and **Custom Auto** (`custom_auto`).

- **Projection tiers: 2026 / 2028 / 2030** (non-consecutive — the three assumption tiers were spread out; base + one-step + two-step). No interpolation between them.
- **Labor rates (flat across tiers):** RPE/ME $90.64, Tech $52.52, Purchaser $77.69, PM $84.17/hr.
- **Robot cell rates** (Small/Medium/Large + a Custom override) change periodically — **read the current values from `HOURLY_RATES` in `calculations.py`**, don't trust a number cached here.
- **Robot improvement factors:** forming/cutting 1.0 → 0.65 → 0.4225; scanning 1.0 → 0.75 → 0.50.
- **Trial reduction:** 1.0 → 0.75 → 0.50 (applied to pre-IF/IF procedure counts, rounded up).

## Identity & access (Entra Easy Auth)
- Users sign in with their Machina account; backend reads identity from Easy Auth headers (`main.py::_identity_from_request`, read-only on the request path — visit recording runs in a background task). Local dev falls back to `QUOTE_TOOL_DEV_USER_EMAIL`/`_NAME` env or `x-dev-user-email/name` headers.
- **Admin:** `calvin.acker@machinalabs.ai` (seeded). Admin-mode toggle in the profile menu; Admin area lists users + last-seen and sets per-user project access.
- **RBAC scaffolding:** every project has an `access_tag` (default `all`) and every user an `access_scope` (default `all`); `_can_see` filters. Everyone is `all` for now.
- Full details in the auth memory file. Entra app client id + Easy Auth config are recorded there.

## Quote snapshots / freeze (v1.9.0)
- Quotes are **frozen snapshots**, not live-recomputed — a pricing update never silently changes an existing quote. `pricing_version()` = hash of all pricing constants; a mismatch flags the quote **stale** (shows old-vs-current + a Refresh button that archives the old version).
- **App Update History** (quote view): for the project's current inputs, the quote priced under each past pricing *version* (full pricing — rates + labor era via `pricing_history.py` + `legacy_pricing.py`), with a date column. **User Change History**: who edited the inputs and when (`project_edits` table).
- One-time backfill (`backfill_reconstructed_baselines`, guarded by `PRAGMA user_version>=3`) gave existing projects a reconstructed baseline at the pricing live when last edited.
- Prod DB is at `/data/quote_tool.db` (persists; Kudu can't see it — it's in the app container, not the Kudu container).

## Project Codes (v1.10.0)
A project-code registry that lives in the app's own SQLite, **diverged from the old Databricks CodeGen system**. Key files: `backend/code_gen.py` (prefix + counter), `backend/salesforce_source.py` (Salesforce reads via Databricks), `frontend/src/components/ProjectCodeTab.tsx`. Narrative/slide summary: `docs/project-code-system-slides.md`.

- **How codes are made:** manually, on demand, in the **Project Code tab → Generate**. Customer work = pick a Salesforce **account + opportunity** (searched live) or type a new one; Internal work = pick a **team** + name. Format: 4-letter compaction of the name + a per-prefix counter (`TOYT001`); internal codes prepend `M` (`MPROD001`) and use customer = `Machina <Team>`. **No random-letter collision variants** — uniqueness is the number.
- **One code per account+opportunity:** generation dedupes on `sf_opp_id` (returns the existing code instead of a duplicate).
- **Old vs new:** the old Databricks notebook auto-generated `project_code = account_code + global_opp_index` in `etl.sf_opportunities` for *every* account+opportunity. The tool was **seeded once** from that table, then diverges — new codes come only from the tool; the old list is not read again (the seed endpoint is strictly one-time, only runs when the table is empty).
- **Storage:** `project_codes` + `project_code_status_events` (history: field/old/new/who/when — the code itself never changes) in `backend/quote_tool.db`. Statuses: customer = Discovery/Completed/Closed Won/Closed Lost; internal = Internal/Completed. Pickable-for-a-quote = Discovery/Closed Won/Internal ("open").
- **Salesforce data path (still live):** `salesforce_source.py` reads `salesforce.account`/`salesforce.opportunity` (Fivetran-synced) via the Databricks SDK `command_execution` API on cluster `1105-185134-2tfate0e`, paged past the 1000-row cap, cached ~1hr to `backend/sf_cache.json`. Exposed at `GET /salesforce/options` (also returns `code_by_opp`). This powers the account/opportunity pickers and the reference Salesforce list.
- **Credentials:** `DATABRICKS_HOST` / `DATABRICKS_TOKEN` / `DATABRICKS_CLUSTER_ID` from env, else `backend/sf_config.local.json` (gitignored — token never committed). **`databricks-sdk` is in requirements.txt.** In **prod these three must be set as App Service settings** or the Salesforce features return 503 (the app still boots and internal/typed-custom codes still work). Fresh prod DB is empty of codes → an admin uses the one-time "Import existing codes" banner to seed the baseline.
- **Quote integration:** a project (quote) has an optional `project_code` link (first field in the project detail; picking it fills read-only Account/Project Name) and its own `quote_status` (**Open / Closed Won / Not Used**, upgraded from is_active), shown as a home-card pill with filters. The project's `name` is the **Quote Name**. `list_projects` returns `code_customer`/`code_project_name` for the home-card subtext.

## Azure hosting & monitoring
- **Cloud:** Azure US Government (`.azurewebsites.us`), sub `071e310d-bae1-4e39-af2a-8e76d0373492`, RG `quoting-tool-rg`, region USGov Virginia. `az` CLI works from WSL2 (already authed to `AzureUSGovernment`).
- **Metric alerts:** `quoting-tool-5xx-errors` (fires on a *single* Http5xx over 5 min), `quoting-tool-4xx-errors`, `quoting-tool-slow-response`, `quoting-tool-app-stopped`. Action group `quoting-tool-alerts`.
- **Recurring 5xx alerts are almost always benign container cold starts** — App Service periodically recycles/relocates the Linux container; during the ~1 min swap, requests get platform 502/503 → one 5xx → alert fires then auto-resolves. Confirmed for the June 6 2026 event via docker logs (fresh instance booting, clean uvicorn startup, no app error).
- **Investigate alerts:** `az webapp log download -g quoting-tool-rg -n machina-quoting-tool --log-file /tmp/x.zip`, then read `LogFiles/<date>_<instance>_docker.log` + `_containerStream.log`. A new instance id near the alert time = cold start. `/home/LogFiles` persists ~6+ days. The Azure metrics API returns sparse/empty data at PT1H/P1D here — trust the downloaded logs, not the metric.
- **Diagnostic logging enabled 2026-06-09** (all were Off before): application logging (Information), docker-container logging, HTTP logging, detailed error messages, failed-request tracing. HTTP filesystem logs are a fixed rolling ~3-day/100MB buffer (can't extend on filesystem; blob HTTP logs unsupported on Linux). Durable/queryable stack traces would need App Insights + the Python SDK in app code (not yet done).

## Known issues / notes
- The README is a leftover Python template README — ignore it, it doesn't describe this project
- Chrome disk cache can cause stale app at localhost ports — clear via `chrome://settings/content/all` or use port 4173
- Docker/nginx config exists but local dev is the primary workflow
