# Quote Tool — Context

## Repositories & Deployment
- **GitHub:** https://github.com/ackercal/quoting-tool
- **Deployed:** https://machina-quoting-tool.azurewebsites.us/ (Azure App Service, Docker container)
- Azure sends email alerts when the app goes down (configured via Azure Monitor)

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
Rates are sourced from `quote_calc_final_labor_forecasts.xlsx` (April 2026). Two labor constant sets:
- **Formed Parts** (`formed_parts`)
- **Custom Auto** (`custom_auto`)

Key rates (2026):
- RPE / ME: $90.64/hr
- Tech: $52.52/hr
- PM: $84.17/hr

Robot improvement factors (year-over-year reduction):
- Forming/cutting: 1.0 → 0.65 → 0.4225 (2026/27/28)
- Scanning: 1.0 → 0.75 → 0.5

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
