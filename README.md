# LighterSchedule

Aplikacja do deklaracji dyspozycyjności i zatwierdzania grafiku pracy (perspektywa pracownika i kierownika).

Stack: **Django REST + JWT** (backend), **React** (frontend), **PostgreSQL**.

---

## Wymagania

- Python 3.11+
- Node.js 18+ (LTS)
- PostgreSQL 14+

---

## 1. PostgreSQL

1. Zainstaluj PostgreSQL i uruchom serwer.
2. Utwórz bazę i użytkownika (przykład w `psql`):

```sql
CREATE DATABASE lighterschedule_db;
CREATE USER postgres WITH PASSWORD 'your-password';
ALTER ROLE postgres SET client_encoding TO 'utf8';
GRANT ALL PRIVILEGES ON DATABASE lighterschedule_db TO postgres;
```

Na Windowsie często używasz domyślnego użytkownika `postgres` utworzonego przy instalacji — wtedy wystarczy utworzyć bazę:

```sql
CREATE DATABASE lighterschedule_db;
```

3. Skopiuj konfigurację środowiska:

```powershell
copy .env.example .env
```

Uzupełnij w `.env` dane bazy (`DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`).

> Uwaga: backend czyta zmienne z otoczenia procesu. Na Windowsie możesz ustawić je w PowerShell przed startem (`$env:DB_PASSWORD="..."`) albo załadować z `.env` narzędziem typu `python-dotenv` / skryptem startowym. Domyślne wartości są też w `lighterschedule_backend/settings.py`.

---

## 2. Backend

W katalogu głównym repozytorium:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python manage.py migrate
python manage.py runserver
```

API będzie dostępne pod `http://127.0.0.1:8000/api/`.

Opcjonalnie utwórz konto admina Django (przydatne przy ustawianiu kierownika):

```powershell
python manage.py createsuperuser
```

Panel admina: `http://127.0.0.1:8000/admin/`.

---

## 3. Frontend

W osobnym terminalu:

```powershell
cd lighterschedule_front
copy .env.example .env
npm install
npm start
```

Aplikacja: `http://localhost:3000`.

`REACT_APP_API_URL` w `.env` powinno wskazywać na backend, np. `http://127.0.0.1:8000/api`.

---

## 4. Rejestracja i bezpieczeństwo kont

Domyślnie rejestracja publiczna jest **wyłączona** (`ALLOW_PUBLIC_REGISTRATION=False`).
Konta dodaje kierownik w panelu **Zarządzanie kontami** (`/manager`).

Pierwszego kierownika ustawiasz jednorazowo (admin / shell), potem wszystko z UI.

---

## 5. Pierwszy kierownik

Rejestracja tworzy zwykłego pracownika (`is_manager=False`). Kierownika ustawiasz ręcznie.

### Opcja A — Django admin

1. Zaloguj się na `http://127.0.0.1:8000/admin/` (superuser).
2. Otwórz **Employee profiles**.
3. Przy wybranym użytkowniku zaznacz **Is manager** i zapisz.

### Opcja B — shell Django

```powershell
python manage.py shell
```

```python
from django.contrib.auth.models import User

user = User.objects.get(username='twoj_login')
user.profile.is_manager = True
user.profile.save()
```

Po zalogowaniu kierownik trafia na `/manager` (sekcja **Zarządzanie kontami**), pracownik na `/dashboard`.

---

## 6. Smoke test (produkcja / lokalnie)

Publiczna rejestracja jest **wyłączona** — konta tworzy kierownik w `/manager` → **Zarządzanie kontami**.

1. **Pierwszy kierownik** (jednorazowo): admin Django / shell (`is_manager=True`) — zobacz krok 5.
2. Kierownik loguje się → w **Szablony zmian** definiuje np. Poranną / Późniejszą (godziny per dzień tygodnia).
3. Kierownik dodaje **pracownika** w panelu kont.
4. Pracownik loguje się → `/dashboard` → wybiera **szablon zmiany** (+ opcjonalna notatka) → **Wyślij deklaracje**.
5. Kierownik → **Do akceptacji** → Zatwierdź / Edytuj / Odrzuć.
6. Pracownik odświeża kalendarz — zielony (zatwierdzony), teal (zatwierdzony z notatką), czerwony (odrzucony).
7. (Opcjonalnie) zamiana zmiany + akceptacja kierownika; raport PDF w panelu kierownika.

### Testy automatyczne

```powershell
# backend
python manage.py test core

# frontend
cd lighterschedule_front
npm test -- --watchAll=false
```

---

## Struktura

```
LighterSchedule/
├── core/                      # modele, API, testy
├── lighterschedule_backend/   # settings, urls
├── lighterschedule_front/     # React
├── requirements.txt
├── manage.py
├── DEPLOY.md                  # checklista deployu produkcyjnego
└── .env.example
```

Deploy produkcyjny (Nginx, HTTPS, Gunicorn): zobacz [DEPLOY.md](DEPLOY.md).

---

## Przydatne endpointy

| Endpoint | Opis |
|----------|------|
| `POST /api/register/` | Rejestracja |
| `POST /api/token/` | Logowanie JWT |
| `GET /api/me/` | Profil zalogowanego użytkownika |
| `GET/POST /api/workdays/` | Grafik / deklaracje |
| `POST /api/workdays/{id}/approve/` | Zatwierdzenie (kierownik) |
| `POST /api/workdays/{id}/reject/` | Odrzucenie (kierownik) |
| `GET/POST /api/swaps/` | Zamiany zmian |
