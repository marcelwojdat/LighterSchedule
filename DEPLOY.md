# Deploy produkcyjny — ProstyGrafik

Checklist uruchomienia poza lokalnym środowiskiem deweloperskim.

## 1. Serwer i runtime

- VPS / cloud z Ubuntu 22.04+ (lub równoważny)
- Python 3.12+ (wymaga tego Django 6), Node.js 24 (build frontendu — lockfile zapisany przez npm 11)
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
python manage.py createsuperuser   # opcjonalnie: dostęp do panelu /admin
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

# Przy DJANGO_DEBUG=False e-maile wysyłane są przez SMTP
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=<login>
EMAIL_HOST_PASSWORD=<haslo>
DEFAULT_FROM_EMAIL=ProstyGrafik <noreply@prostygrafik.com>
```

### 2b. systemd — Gunicorn

Plik `/etc/systemd/system/lighterschedule.service`:

```ini
[Unit]
Description=ProstyGrafik Gunicorn
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
        # Panel administratora nie ma limitu prób logowania — wpuszczaj tylko swoje IP.
        allow 203.0.113.10;   # Twoje IP
        deny all;
        proxy_pass http://127.0.0.1:8000/admin/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        proxy_pass http://127.0.0.1:8000/static/;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
        # Te same nagłówki co w lighterschedule_front/public/serve.json (gdy frontend serwuje `serve`).
        # Build musi mieć INLINE_RUNTIME_CHUNK=false, inaczej CSP zablokuje skrypt startowy.
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }
}
```

Logowanie jest chronione limitem prób na IP. Django bierze IP klienta z ostatniego wpisu
`X-Forwarded-For` (`DJANGO_NUM_PROXIES=1`), dlatego `/api/` musi przekazywać ten nagłówek, jak wyżej.

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
- [ ] Skonfigurowany SMTP (`EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`)
- [ ] `python manage.py collectstatic --noinput`
- [ ] `python manage.py migrate` (tworzy też tabelę liczników logowania i czarnej listy tokenów)
- [ ] Backend nasłuchuje tylko na `127.0.0.1:8000` (w docker-compose: `"127.0.0.1:8000:8000"` — Docker omija UFW)
- [ ] `/admin/` dostępny tylko z Twojego IP
- [ ] `curl -I https://twoja-domena.pl/login` pokazuje `Content-Security-Policy` i `X-Frame-Options`
- [ ] Backup bazy (`pg_dump` / snapshot)

## 6. Smoke test po deployu

1. `/register` zakłada firmę — po zalogowaniu kierownik trafia do `/manager`
2. Kierownik w `/manager` definiuje **szablony zmian** (np. Poranna / Późniejsza)
3. Kierownik dodaje pracownika w **Zarządzanie kontami**
4. Logowanie pracownika i kierownika
5. Pracownik wybiera szablon + opcjonalną notatkę → deklaracja → akceptacja
6. Zamiana (przekazanie / dwustronna)
7. Raport PDF wypłat + powiadomienia w panelu

## 7. Automatyczne releasy (GitHub Actions → GHCR → serwer)

### Jak to działa

1. Każdy push na `main` aktualizuje **Release PR** (release-please): nowy numer wersji + `CHANGELOG.md`.
   Wersję wyznaczają commity: `feat:` → minor (1.**1**.0), `fix:` / `perf:` / `security:` → patch (1.0.**1**),
   `feat!:` lub `BREAKING CHANGE:` w treści → major. `docs:`, `ci:`, `refactor:`, `test:`, `chore:` nie wydają wersji.
2. Merge Release PR tworzy tag `vX.Y.Z`. W tym samym przebiegu: testy (`ci.yml`) → obrazy
   `ghcr.io/marcelwojdat/lighterschedule-web:vX.Y.Z` i `...-frontend:vX.Y.Z` → job `deploy` **czeka na zatwierdzenie**.
3. Po zatwierdzeniu GitHub łączy się przez SSH i uruchamia `deploy/deploy.sh vX.Y.Z`:
   checkout taga → pull obrazów → backup bazy (`backups/`, 14 ostatnich) → `migrate` → nowe kontenery →
   `/api/health/` musi zwrócić tę wersję → inaczej automatyczny powrót do poprzedniej.

Migracje muszą być wstecznie kompatybilne (expand/contract): przez chwilę stary kod działa na nowym schemacie,
a rollback nie cofa migracji. Usunięcie lub zmianę nazwy kolumny rozbij na dwa releasy.

### Jednorazowo: GitHub

- **Settings → Actions → General → Workflow permissions:** zaznacz *Allow GitHub Actions to create and approve pull requests*.
- **Settings → Environments → New environment `production`:**
  - *Required reviewers*: Ty; *Deployment branches and tags*: tylko `main`.
  - *Environment secrets* (nie repository secrets — są dostępne dopiero po zatwierdzeniu):
    - `DEPLOY_HOST` — IP lub domena serwera
    - `DEPLOY_USER` — `ubuntu`
    - `DEPLOY_SSH_KEY` — klucz prywatny wygenerowany niżej
    - `DEPLOY_KNOWN_HOSTS` — linia z `ssh-keyscan` (niżej)
- Po pierwszym releasie: **Packages → lighterschedule-web / lighterschedule-frontend → Package settings →
  Change visibility → Public** (repo jest publiczne, obrazy nie zawierają sekretów — te są tylko w `.env` na serwerze).

### Jednorazowo: serwer

```bash
# Lokalnie: osobny klucz tylko do deployu (bez hasła, bo używa go automat)
ssh-keygen -t ed25519 -f prostygrafik_deploy -C github-deploy -N ""

# Odcisk klucza hosta — porównaj z wynikiem na serwerze, zanim wkleisz do DEPLOY_KNOWN_HOSTS
ssh-keyscan -t ed25519 <IP-serwera>
# na serwerze: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub   vs lokalnie: ssh-keyscan ... | ssh-keygen -lf -
```

Na serwerze dopisz do `~/.ssh/authorized_keys` użytkownika `ubuntu` **jedną linię** (treść `prostygrafik_deploy.pub`):

```
command="/bin/bash /opt/LighterSchedule/deploy/deploy.sh",restrict ssh-ed25519 AAAA... github-deploy
```

`command=` sprawia, że ten klucz może wyłącznie uruchomić skrypt (wysłana „komenda” trafia do niego jako numer wersji
i jest walidowana), a `restrict` wyłącza przekierowania portów, agenta i terminal.

```bash
sudo usermod -aG docker ubuntu          # deploy.sh woła docker bez sudo; wyloguj się i zaloguj ponownie
ls -ld /opt/LighterSchedule             # właścicielem musi być ubuntu, inaczej: sudo chown -R ubuntu:ubuntu /opt/LighterSchedule
cd /opt/LighterSchedule && git pull     # ostatni ręczny pull: przynosi deploy/deploy.sh
```

### Pierwsze przełączenie (frontend z hosta do kontenera)

Do tej pory frontend serwował proces `serve` uruchomiony na hoście. Kontener `frontend` zajmuje ten sam port 3000,
więc przy pierwszym releasie (zamiast zatwierdzać deploy w GitHubie):

```bash
sudo ss -ltnp 'sport = :3000'           # znajdź proces serve
sudo kill <PID>                         # (albo zatrzymaj usługę, jeśli działa przez systemd/pm2)
bash deploy/deploy.sh v1.1.0            # numer z pierwszego Release PR
```

Jeśli to się nie powiedzie, nie ma poprzedniej wersji do powrotu — uruchom stary `serve` jak dotąd i sprawdź log
wskazany przez skrypt. Kolejne releasy idą już przez zatwierdzenie w GitHubie.

### Na co dzień

- Ręczne komendy compose na serwerze poprzedzaj `export APP_VERSION=$(cat .deployed_version)` — bez tego compose
  szuka obrazów z tagiem `local`, których nie ma w rejestrze.
- Powrót do starszej wersji: `bash deploy/deploy.sh v1.0.3` (dowolny istniejący tag; migracje zostają).
- Repo na serwerze jest w stanie *detached HEAD* na tagu ostatniego releasu — nie rób tam `git pull` ani zmian.
- Backupy w `backups/` leżą na tym samym dysku co baza. To ochrona przed złą migracją, nie przed awarią serwera —
  kopiuj je także poza VPS.
