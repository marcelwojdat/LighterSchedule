# ---- Frontend build ----
FROM node:24-alpine AS frontend
WORKDIR /frontend
COPY lighterschedule_front/package.json lighterschedule_front/package-lock.json ./
RUN npm ci
COPY lighterschedule_front/ ./
# Na VPS ustaw przy buildzie, np. /api jeśli Nginx proxy'uje pod tą samą domeną
ARG REACT_APP_API_URL=/api
ENV REACT_APP_API_URL=$REACT_APP_API_URL
# The startup script goes to a file instead of inline <script>, as the CSP in public/serve.json requires.
ENV INLINE_RUNTIME_CHUNK=false
RUN npm run build

# ---- Frontend runtime: the static build served on :3000, where nginx proxies "/" ----
# Kept before the backend stage, so a plain `docker build .` still builds the backend (the last stage).
FROM node:24-alpine AS frontend-runtime
ENV NO_UPDATE_CHECK=1
RUN npm install --global serve@14.2.4
WORKDIR /srv
# build/serve.json comes from public/ and sets the CSP and other security headers.
COPY --from=frontend /frontend/build ./build
USER node
EXPOSE 3000
CMD ["serve", "--single", "--no-port-switching", "--listen", "tcp://0.0.0.0:3000", "build"]

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

# collectstatic only copies files, but importing settings requires these; real values come at runtime.
RUN DJANGO_SECRET_KEY=build-only DB_PASSWORD=build-only python manage.py collectstatic --noinput

# The release tag is baked into the image, so /api/health/ reports what really runs (deploy.sh checks it).
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# Run without root: a flaw in the app must not give root inside the container.
RUN useradd --system --no-create-home --uid 10001 app
USER app

EXPOSE 8000

CMD ["gunicorn", "lighterschedule_backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]