# Running the tests

## Backend (from `backend/`)

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
