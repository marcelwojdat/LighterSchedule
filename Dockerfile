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

# ---- Frontend runtime: nginx on :3000 serves the build and forwards /api/, /admin/, /static/admin/ to Django ----
# Kept before the backend stage, so a plain `docker build .` still builds the backend (the last stage).
# The unprivileged variant runs nginx without root; templates are rendered at start (see the .template file).
FROM nginxinc/nginx-unprivileged:1.28-alpine AS frontend-runtime
ENV BACKEND_URL=http://web:8000 \
    ADMIN_ALLOW_CIDR=127.0.0.1/32 \
    NGINX_ENVSUBST_FILTER='^(BACKEND_URL|ADMIN_ALLOW_CIDR)$'
COPY lighterschedule_front/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=frontend /frontend/build /usr/share/nginx/html
EXPOSE 3000

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