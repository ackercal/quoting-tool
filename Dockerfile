# Stage 1: build the React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: production image
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends nginx && rm -rf /var/lib/apt/lists/*

# Python dependencies
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ .

# Built frontend static files
COPY --from=frontend-build /app/dist /app/frontend/dist

# nginx config
COPY nginx.conf /etc/nginx/sites-available/default

# Startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Mount point for Azure Files (SQLite lives here)
RUN mkdir -p /data

EXPOSE 80

CMD ["/start.sh"]
