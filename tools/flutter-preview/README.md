# Flutter preview backend (local, synthetic, disposable)

A loopback-only Django backend for reviewing the real Flutter Sanitation UI in Chrome
with synthetic data. It is a development tool: nothing here is imported by the backend,
deployed, or built into the APK.

> This preview is **not** a substitute for testing against real Supabase storage,
> PostgreSQL (including concurrency) or a physical Android device.

## Start

From the repository root, with the backend virtualenv:

```powershell
backend\venv\Scripts\python.exe tools\flutter-preview\run_backend.py
```

- API: `http://127.0.0.1:8770/api` (change with `--port`)
- Status: `http://127.0.0.1:8770/api/__preview__/status/`
- Allowed Flutter web origins (CORS): `http://localhost:3001`, `http://127.0.0.1:3001`
  (change with `--app-origin http://localhost:<port>`; only `localhost`/`127.0.0.1` over http are accepted)

Point Flutter at it with `--dart-define=API_BASE_URL=http://127.0.0.1:8770/api`.
(The staff screens need the separate preview entrypoint, which is a later step.)

## Stop

Press **Ctrl+C**. The temp folder (database and media) is deleted on exit.
If the process was killed instead (Task Manager, closed terminal), remove leftovers with:

```powershell
backend\venv\Scripts\python.exe tools\flutter-preview\run_backend.py --cleanup-stale
```

Each preview folder records its owning process id (`owner.pid`). `--cleanup-stale` deletes a
`capstone-flutter-preview-*` folder directly inside the system temp folder only when that process
has exited. It skips (and lists) folders whose owner is still running or unknown, and refuses
symlinks, junctions or any reparse point at or inside the folder; such leftovers must be checked
and removed by hand.

## What it isolates, and how

The launcher sets these **before Django is imported**; the backend settings read the process
environment ahead of `backend/.env`, so `.env` (which may name remote PostgreSQL/Supabase) is
overridden, never edited:

- SQLite in a new `%TEMP%\capstone-flutter-preview-*` folder; `DATABASE_URL` and all `DB_*`
  connection values are blanked.
- Public-media S3 off and its keys blanked; `MEDIA_ROOT` moved into the temp folder.
- Real private photo storage off and its endpoint/bucket/keys blanked.
- `ALLOWED_HOSTS=127.0.0.1,localhost`, `CORS_ALLOW_ALL_ORIGINS=False`, local origins only.
- A random preview-only `SECRET_KEY` and `TRACKING_CODE_KEY` per run.
- The server binds to `127.0.0.1` only.

After Django starts, the **effective** settings are checked and the launcher refuses to run if
any database, storage, CORS or host value is not local and disposable.

## What is mocked

- **Private photos:** an in-memory store inside the preview process. The real storage client is
  replaced with one that raises, and attempts are counted (status endpoint:
  `real_private_storage_attempts`, expected `0`).
- **Data:** created fresh on every start by `seed.py`. All names are labelled "Synthetic":
  - staff login `preview.inspector` / `preview-only-not-a-secret` (Sanitation role; exists only
    in the throwaway database);
  - 4 establishments (good standing, violation, for completion, not yet inspected);
  - 3 households (two with coordinates, one without), two with generated "SYNTHETIC PREVIEW PHOTO"
    images saved through the real household-photo service;
  - 3 community reports with reporter-provided, staff-provided and unknown location sources.

Authentication is the real `/api/auth/login/`; nothing is bypassed.

## Verify it is local

- Startup prints the effective database file; it must be under `%TEMP%\capstone-flutter-preview-*`.
- `GET /api/__preview__/status/` reports the effective engine, database file, bind address and
  the real-storage attempt count.
- With the preview running:

  ```powershell
  backend\venv\Scripts\python.exe tools\flutter-preview\smoke_check.py
  ```

- Safety tests (no server needed):

  ```powershell
  backend\venv\Scripts\python.exe -m unittest discover -s tools\flutter-preview -v
  ```
