# ---- Frontend build ----
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY lighterschedule_front/package.json lighterschedule_front/package-lock.json ./
RUN npm ci
COPY lighterschedule_front/ ./
# Na VPS ustaw przy buildzie, np. /api jeśli Nginx proxy'uje pod tą samą domeną
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

# ---- Backend ----
FROM python:3.12-slim AS backend
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=frontend /frontend/build ./lighterschedule_front/build

RUN python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "lighterschedule_backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]