# Deploy produkcyjny — LighterSchedule

Checklist uruchomienia poza lokalnym środowiskiem deweloperskim.

## 1. Serwer i runtime

- VPS / cloud z Ubuntu 22.04+ (lub równoważny)
- Python 3.11+, Node.js 18+ (build frontendu)
- PostgreSQL 14+
- Nginx (reverse proxy) + Certbot (HTTPS)

## 2. Backend

```bash
git clone <repo>
cd LighterSchedule
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# Uzupełnij produkcyjne wartości (patrz sekcja 2a).

python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser   # jednorazowo: potem is_manager=True w adminie / shellu
```

### 2a. Przykładowe `.env` produkcyjne

```env
DJANGO_SECRET_KEY=<losowy-długi-sekret>
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=twoja-domena.pl,www.twoja-domena.pl
DJANGO_SECURE_SSL_REDIRECT=True

DB_NAME=lighterschedule_db
DB_USER=ls_app
DB_PASSWORD=<haslo>
DB_HOST=127.0.0.1
DB_PORT=5432

CORS_ALLOWED_ORIGINS=https://twoja-domena.pl,https://www.twoja-domena.pl
CSRF_TRUSTED_ORIGINS=https://twoja-domena.pl,https://www.twoja-domena.pl

ALLOW_PUBLIC_REGISTRATION=False
REGISTRATION_INVITE_CODE=
```

### 2b. systemd — Gunicorn

Plik `/etc/systemd/system/lighterschedule.service`:

```ini
[Unit]
Description=LighterSchedule Gunicorn
After=network.target postgresql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/LighterSchedule
EnvironmentFile=/var/www/LighterSchedule/.env
ExecStart=/var/www/LighterSchedule/.venv/bin/gunicorn \
  --workers 3 \
  --bind 127.0.0.1:8000 \
  lighterschedule_backend.wsgi:application
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now lighterschedule
```

## 3. Frontend

```bash
cd lighterschedule_front
cp .env.example .env
# REACT_APP_API_URL=https://twoja-domena.pl/api

npm ci
npm run build
```

Wgraj katalog `build/` na serwer (np. `/var/www/LighterSchedule/frontend`).

## 4. Nginx + HTTPS

Plik `/etc/nginx/sites-available/lighterschedule`:

```nginx
server {
    listen 80;
    server_name twoja-domena.pl www.twoja-domena.pl;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name twoja-domena.pl www.twoja-domena.pl;

    # ssl_certificate / itd. — uzupełnia Certbot

    root /var/www/LighterSchedule/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8000/admin/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        proxy_pass http://127.0.0.1:8000/static/;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lighterschedule /etc/nginx/sites-enabled/
sudo nginx -t
sudo certbot --nginx -d twoja-domena.pl -d www.twoja-domena.pl
sudo systemctl reload nginx
```

## 5. Bezpieczeństwo przed startem

- [ ] `DJANGO_DEBUG=False`
- [ ] Silny `DJANGO_SECRET_KEY`
- [ ] `CORS_ALLOWED_ORIGINS` i `CSRF_TRUSTED_ORIGINS` tylko na domenę frontendu
- [ ] Rejestracja wyłączona (`ALLOW_PUBLIC_REGISTRATION=False`)
- [ ] `python manage.py collectstatic --noinput`
- [ ] Backup bazy (`pg_dump` / snapshot)
- [ ] Pierwszy kierownik: `is_manager=True` (admin / shell) — potem konta z `/manager`

## 6. Smoke test po deployu

1. `/register` pokazuje „Rejestracja niedostępna”
2. Kierownik w `/manager` definiuje **szablony zmian** (np. Poranna / Późniejsza)
3. Kierownik dodaje pracownika w **Zarządzanie kontami**
4. Logowanie pracownika i kierownika
5. Pracownik wybiera szablon + opcjonalną notatkę → deklaracja → akceptacja
6. Zamiana (przekazanie / dwustronna)
7. Raport PDF wypłat + powiadomienia w panelu
