#!/bin/sh
set -e

# Start FastAPI backend
cd /app/backend
uvicorn main:app --host 127.0.0.1 --port 8000 &

# Start nginx in the foreground (keeps the container alive)
nginx -g "daemon off;"
