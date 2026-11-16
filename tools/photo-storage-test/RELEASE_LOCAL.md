# Photos release preparation - local only

Normal Household and Establishment GET/multipart PUT routes now support explicit
native selection. Django still authorizes the user before storage access. Native
reads resolve the persisted provider/attempt binding, independently of the write
selector. No native deletion exists. Retired and uncertain attempts remain held.

## Environment names (not production configuration instructions)

| Name | Default |
| --- | --- |
| SANITATION_PHOTO_WRITE_PROVIDER | S3 |
| SANITATION_NATIVE_PHOTO_UPLOADS_ENABLED | false |
| SANITATION_NATIVE_PHOTO_READS_ENABLED | false |
| SANITATION_NATIVE_PHOTOS_BUCKET_CONFIRMED_PRIVATE | false |
| SANITATION_NATIVE_PHOTOS_PROJECT_REF | empty |
| SANITATION_NATIVE_PHOTOS_ENDPOINT | empty |
| SANITATION_NATIVE_PHOTOS_BUCKET | empty |
| SANITATION_NATIVE_PHOTOS_SECRET_KEY | empty |

Native endpoint/project/bucket/secret validation is performed before provider
access. Unknown write selectors fail closed. Explicit native selection never
falls back to S3. Development flags remain available to historical local tests,
but cannot select native uploads through normal routes. Do not set those flags
in production. Native reads can remain enabled with native uploads disabled.
The existing public-media AWS settings and private S3 settings are independent.

## Offline verification

From the original repository, using the existing backend virtual environment:

```powershell
& backend/venv/Scripts/python.exe -B tools/photo-storage-test/release_offline.py
```

`release_offline.py` and `release_preview.py` take their isolation helpers
(disposable PostgreSQL cluster, isolated Django configuration, fake provider
response, quiet loopback server, report writer) only from `release_support.py`
in this directory. They do not import the earlier probe scripts, and all three
files run from a clean checkout without them.

The offline run initializes an
empty loopback cluster on a fresh non-5432 port, verifies its identity, applies
existing migrations through 0073, and tests the NORMAL routes. It does not import
backend.settings or read backend/.env. Python socket connections outside loopback
are denied. Storage is fake. The cluster stops in finally; reports remain in Temp.

`release_preview.py` uses the same isolated configuration and serves the built
React application and normal Django routes on one loopback origin. Build locally
with REACT_APP_API_BASE_URL=/api. Its synthetic account is valid only in the fresh
disposable database. It never accepts real credentials. Native transport is fake,
S3 construction is rejected, and no external socket is permitted. The printed
evidence directory contains synthetic image inputs and `control.json`, accepting
a bounded fake delay and failure mode. Create `stop.txt` there to stop, verify
unchanged non-photo fields, save HTTP/journal evidence, and stop PostgreSQL.
Browser automation must also block all external origins.

## Release gates still closed

- Verify deployed revision and full production migration history. Review all
  pending migrations, including 0064 fare backfill, 0066 resort image cleanup,
  and the unrelated additive 0071 GPS/Sitio dependency. Do not skip/fake them.
- Obtain an operational backup and verify restore/recovery procedures.
- Select/verify a dedicated operational private bucket, limits and capacity;
  preserve all existing proof/test objects. Supply secrets privately server-side.
- Verify effective USE_SEED_DATA and the actual Render startup/migration commands.
- Approve deployment and feature activation separately. No production changes
  have been made by this development checkpoint.
- Perform live-client acceptance separately, including existing records and
  narrow-screen navigation. Local browser tests are not production acceptance.
- Roll back by disabling uploads while preserving reads, provenance, journals
  and schema. Do not reverse migrations or delete native objects automatically.
