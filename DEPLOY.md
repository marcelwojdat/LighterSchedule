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
pip install -r requirements.txt gunicorn

cp .env.example .env
# Uzupełnij produkcyjne wartości:
# DJANGO_SECRET_KEY, DJANGO_DEBUG=False
# DJANGO_ALLOWED_HOSTS=twoja-domena.pl
# DB_*, CORS_ALLOWED_ORIGINS=https://twoja-domena.pl
# ALLOW_PUBLIC_REGISTRATION=False + REGISTRATION_INVITE_CODE=...

python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

Uruchomienie (przykład systemd / foreground):

```bash
gunicorn lighterschedule_backend.wsgi:application --bind 127.0.0.1:8000
```

## 3. Frontend

```bash
cd lighterschedule_front
cp .env.example .env
# REACT_APP_API_URL=https://api.twoja-domena.pl/api
# albo https://twoja-domena.pl/api jeśli API jest pod tą samą domeną

npm ci
npm run build
```

Wgraj katalog `build/` na Nginx (static) albo serwuj przez CDN.

## 4. Nginx + HTTPS (szkic)

- `/` → pliki z `lighterschedule_front/build`
- `/api/` → proxy do Gunicorn (`127.0.0.1:8000`)
- `certbot --nginx -d twoja-domena.pl`

Ustaw nagłówki bezpieczeństwa (HSTS, X-Frame-Options) po włączeniu HTTPS.

## 5. Bezpieczeństwo przed startem

- [ ] `DJANGO_DEBUG=False`
- [ ] Silny `DJANGO_SECRET_KEY`
- [ ] CORS tylko na domenę frontendu
- [ ] Rejestracja ograniczona kodem zaproszenia lub wyłączona
- [ ] Backup bazy (pg_dump / snapshot)
- [ ] Kierownik ustawiony w adminie (`is_manager=True`)

## 6. Smoke test po deployu

1. Logowanie pracownika i kierownika
2. Deklaracja → akceptacja
3. Zamiana (przekazanie / dwustronna)
4. Pobranie raportu PDF wypłat
5. Sprawdzenie powiadomień w panelu
