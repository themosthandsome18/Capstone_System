# Running the tests

## Backend (from `backend/`)

### WARNING: `backend/.env` points at the LIVE Supabase database

A plain `manage.py runserver` or `manage.py migrate` hits LIVE, not `local_dev.sqlite3`. `.env` says `DB_ENGINE=postgresql` with the
Supabase pooler host, and `settings.py` only forces SQLite for `test` and `testserver`; there is no guard for anything else. Environment
variables in the shell win over `.env`, so the override below is the only thing that points a command at the local file.

This has already happened: on 13 Nov 2026 migration 0072 was applied to LIVE from the owner's machine, because a plain `migrate` was used.

Put the override in front of EVERY `runserver`, `migrate`, `makemigrations`, `showmigrations`, `shell` or script that touches the database.

PowerShell (from `backend\`; the variables stay in that terminal until it is closed):

```
$env:DB_ENGINE="sqlite"; $env:SQLITE_DB_PATH="C:/Capstone_System/backend/data/local_dev.sqlite3"; $env:DATABASE_URL=""; .venv\Scripts\python.exe manage.py runserver
```

Bash (from `backend/`):

```
DB_ENGINE=sqlite SQLITE_DB_PATH=C:/Capstone_System/backend/data/local_dev.sqlite3 DATABASE_URL= DEBUG=true SECRET_KEY=x .venv/Scripts/python.exe manage.py runserver
```

Before a `migrate`, prove where it will go (same prefix; this does not connect to anything):

```
.venv/Scripts/python.exe manage.py shell -c "from django.conf import settings; d = settings.DATABASES['default']; print(d['ENGINE'], d.get('NAME'), d.get('HOST'))"
```

It must print `django.db.backends.sqlite3 C:/Capstone_System/backend/data/local_dev.sqlite3`. If it prints `postgresql` or a Supabase host, the
prefix is not in effect: stop.

### The tests

```
DB_ENGINE=sqlite SQLITE_DB_PATH=C:/Capstone_System/backend/data/local_dev.sqlite3 DATABASE_URL= DEBUG=true SECRET_KEY=x .venv/Scripts/python.exe manage.py test --parallel 8
```

- The local database is `backend/data/local_dev.sqlite3`, not `db.sqlite3`.
- `--parallel` needs `tblib`: `.venv/Scripts/python.exe -m pip install -r requirements-dev.txt`. Without it the run
  crashes within seconds (`TypeError: cannot pickle 'traceback' object`) as soon as one test is red.
- Measured on an 8-core / 16-thread machine with `--parallel 8`: about 3 minutes, against about 11 minutes without it.
- On 12 Nov 2026, on `main` at `eb5daa3`, the whole suite is 1538 tests (the count grows with every new test),
  9 skipped, and 3 red that are not ours:
  `api.test_owner_status_throttle_postgres` (needs Postgres) and two sanitation tests
  (`test_mobile_sanitation_inspection_creates_establishment_inspection`,
  `test_real_http_contract_auth_creation_edit_and_inspection`). Anything else red is new.

## Frontend (from `frontend/`)

```
rm -f .eslintcache node_modules/.cache/.eslintcache
CI=true npx react-scripts test --watchAll=false --maxWorkers=6
```

Delete `.eslintcache` first, every time.

## How to run them

- Do not run the backend and the frontend suites at the same time. Under that load one frontend test
  (`src/sanitation/pages/PublicCommunityReport.test.js`) failed once and passed alone.
- While fixing something, run only the tests it touches. Run the whole suite once, before pushing.
