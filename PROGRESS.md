# Project Progress & Status Tracker

## Working Conventions
This project is being developed with a Claude-based planner/reviewer working alongside you (Antigravity) as implementer, following strict discipline: small scoped steps, real test output required (not just "tests should pass" claims), full file contents requested when reviewing critical logic (not truncated diffs), git discipline (explicit staging, review diffs before commit, no push without explicit review/approval), and an audit-before-fix approach for any broad review. If a different session or tool picks this up, maintain the same discipline: show real command output, don't claim something works without demonstrating it.

## Completed & Verified (pushed to origin/main)
- **Notification model + violation write-time trigger** (`8ffb4f7`)
  - Created `Notification` model with target roles, audience types, modules, severity levels, and idempotency keying.
  - Added write-time violation trigger in `backend/api/services/notifications.py` wired into sanitation inspection submissions when status is violation.
- **Staff notification list/read/mark-all-read endpoints** (`7f56898`)
  - Endpoints at `/api/notifications/`, `/api/notifications/<id>/read/`, and `/api/notifications/mark-all-read/`.
  - Enforced role and ownership boundaries so staff only see and update their own notifications.
- **`evaluate_due_notifications` command** (`5eed5a5`)
  - Created daily management command scanning both upcoming and overdue items (permits due within 30 days or expired, inspections due within 7 days or overdue).
  - Configured severity splitting ("critical" for overdue, "warning" for due soon) and idempotent generation keyed on due-date value.
  - Added `notify_staff_users` helper.
- **Staff-authored public advisory CRUD endpoints** (`17546c5`, `8d1ceee`)
  - Added public advisory management endpoints at `/api/notifications/public/` allowing staff (`admin`, `tourism`, `sanitation`) to publish public notices, while rejecting unauthorized roles (`establishment`).
  - Wrapped public responses in a standard `{ "results": [...] }` envelope and guarded profile lookups against missing profile objects.
- **settings.py hardening** (`61a118f`)
  - Updated fallback defaults for `DEBUG` and `CORS_ALLOW_ALL_ORIGINS` to `False` using `bool_config` to ensure fail-safe behavior in production environments.
- **Flutter sanitation app real authentication** (`59334c6`)
  - Integrated `/api/auth/login/` with persistent token, username, and role storage in `SharedPreferences`.
  - Added role-based access gating (`admin` and `sanitation` permitted, `establishment` and unauthenticated rejected) and persistent session restoration on app startup.
- **Mobile inspection and survey endpoint authorization** (`ca6c761`)
  - Secured `mobile_sanitation_inspection_submit` and `mobile_household_survey_submit` from `AllowAny` to `IsAuthenticated` with explicit role validation (`admin` or `sanitation` required; missing profile or `establishment` role rejected with 403).
  - Updated Flutter API client (`ApiException`) and screens to handle 401 session expiry (clearing stored token and prompting re-login) and 403 forbidden access (alerting without clearing credentials).
  - Updated `test_mobile_household_survey_creates_household_record` to authenticate with a sanitation staff token.
- **Flutter tourism staff app real authentication** (`8aedacd`)
  - Wired `/api/auth/login/` into the tourism Flutter app with persistent token, username, and role storage in `SharedPreferences`.
  - Replaced mock delay and removed credential hints from `StaffAuthGateDialog` with real backend authentication, role gating (`admin` and `tourism` allowed; `sanitation` and `establishment` rejected), and persistent session restoration across `TouristQrCheckInScreen` and `TouristHistoryLogScreen`.
  - Added 401 (session expired, credential purge, re-auth prompt) and 403 (unauthorized role notification without wiping valid token) handling across lookup, check-in, and history calls.
- **Tourism staff endpoint authorization & PII data leak closure** (`8982fcf`)
  - Enforced `[IsAuthenticated]` and explicit `{"admin", "tourism"}` role verification on `mobile_tourist_record_check_in`, `mobile_tourist_record_lookup`, and `mobile_tourist_record_history` (returning 401 for unauthenticated and 403 for unauthorized roles like `establishment` or `sanitation`, with clear `{"detail": "..."}` payloads and missing profile safety handling).
  - Confirmed the critical tourist PII data leak is closed via `MobileTourismAuthTests`: specifically asserts that unauthenticated requests return 401 and that the response body does NOT contain any of the tourist's sensitive PII (name, email, phone number) as substrings, directly verifying data privacy rather than relying on HTTP status code alone. Also asserts zero DB record mutation on rejected requests.
  - Incidental bug fix: `mobile_tourist_record_history` was previously crashing with `AttributeError` when a record had a real region or province set (code referenced `.region_name` / `.province_name`, but the actual model fields are `.name`) — now fixed with a safe `getattr` fallback and verified by the passing test suite.
- **USE_SEED_DATA structural fix & seeding bypass prevention** (`7861c27`)
  - Closed a critical bug where `build_sanitation_reports_payload` in `backend/api/services/sanitation.py` bypassed the `USE_SEED_DATA` setting entirely (`if not SanitaryEstablishment.objects.exists(): ensure_initial_sanitation_data()`), silently re-seeding demo data when rows were deleted and the reports endpoint was queried.
  - Moved the `USE_SEED_DATA` check directly inside every seeding function (`ensure_initial_reference_data`, `ensure_initial_tourism_data`, `ensure_initial_sanitation_data`, `ensure_initial_household_data` in `backend/api/seeders.py`, and `ensure_mobile_reference_data` in `backend/api/views/mobile.py`) as the first line of defense, making silent sample data re-seeding structurally impossible regardless of how or where callers invoke them.
  - Hardened fallback default for `USE_SEED_DATA` in `backend/settings.py` to `False`.
- **Permanent data backup location gitignored** (`8706231`)
  - Added `backend/data_backups/` to `.gitignore` to allow persistent, non-ephemeral local database snapshots to be saved in the repository without risk of committing sensitive dumps to git history.
- **Mobile real CSV export and QR digital pass sharing** (`450f3a6`)
  - **Export pass as image via RepaintBoundary (`TouristDigitalPassModal` in `mobile/lib/widgets/widgets.dart`)**:
    - Wrapped QR entry pass ticket visual in a `RepaintBoundary` with a `GlobalKey`.
    - Captured high-resolution PNG raster bytes via `RenderRepaintBoundary.toImage(pixelRatio: 3.0)` and encoded to PNG.
    - Added defensive frame delay and null/`hasSize` checks to guarantee layout completion before image rasterization.
    - Saved PNG to temp directory and opened native OS share sheet using `share_plus` (`Share.shareXFiles()`), providing a genuine modern "save to device / share" experience without legacy storage permission risks.
    - Updated UI button label to "Save / Share QR Pass" with dynamic loading spinner (`_saving`) and conditional result SnackBars.
  - **Export active arrivals to CSV/Share (`TouristQrCheckInScreen` in `mobile/lib/screens/tourist_qr_checkin_screens.dart`)**:
    - Replaced dummy SnackBar on Button 3 ("Export / Download Records") with real fetch via `widget.api.fetchTouristRecordHistory()`.
    - Built RFC 4180-compliant CSV containing essential staff-relevant fields (`survey_id`, `full_name`, `contact_number`, `resort_name`, `arrival_date`, `status`, `total_visitors`, `filipino_count`, `foreigner_count`).
    - Handled empty records, 401 unauthenticated session expiration, 403 forbidden role access, and dynamic loading indicator (`_exporting`).
    - Wrote CSV to system temp storage (`mauban_tourist_arrivals_<date>.csv`) and invoked OS share sheet.
  - **Export filtered check-in history to CSV/Share (`TouristHistoryLogScreen` in `mobile/lib/screens/tourist_qr_checkin_screens.dart`)**:
    - Replaced dummy SnackBar in AppBar action with real export of the currently active search-filtered records (`filtered`).
    - Used identical CSV structure and temp file sharing pattern, handling empty filtered lists and error states gracefully.
  - **Shared export utility (`mobile/lib/utils/export_helpers.dart`)**:
    - Created clean standalone helpers: `buildCsv` (RFC 4180 escaping), `buildTouristArrivalsCsv`, `saveStringToTempFile`, `saveBytesToTempFile`, and `shareFile`.
    - Declared and resolved dependencies `path_provider: ^2.1.5` and `share_plus: ^10.1.4` in `mobile/pubspec.yaml` with 0 analyzer issues.

## Database Cleaned for Deployment (Sept 2026)
- **All sample/demo transactional data deleted (Clean Slate)**:
  - Backed up all existing rows to `backend/data_backups/demo_data_backup_full.json` (gitignored, not tracked in git).
  - Deleted in foreign-key-safe order across all 8 transactional/sample data tables:
    - `SanitaryInspectionChecklistItem`: 0
    - `SanitaryInspection`: 0
    - `SanitaryPermitRenewal`: 0
    - `SanitaryComplaint`: 0
    - `SanitaryEstablishment`: 0
    - `HouseholdSanitationRecord`: 0
    - `TouristRecord`: 0
    - `FeedbackEntry`: 0
  - Verified live across 6 backend API endpoints (`/api/sanitation/reports/`, `/api/sanitation/dashboard/`, `/api/dashboard/`, `/api/reports/`, `/api/mobile/tourism/bootstrap/`, `/api/mobile/sanitation/bootstrap/`) that all endpoints handle the clean 0-row state gracefully without erroring and with zero auto-reseeding.
- **`VisitPurpose` reset to canonical 10 items**:
  - Backed up all 334 rows to `backend/data_backups/visit_purpose_backup_334.json`.
  - Deleted 324 extra rows resulting from historical one-time Google Sheets imports.
  - Retained exact 10 canonical seed items (`Leisure`, `Vacation`, `Business`, `Visit`, `Outing`, `Tour`, `Team Building`, `Travel`, `Swimming`, `Unwind`).
- **`Province` reset to 84 legitimate Philippine provinces & regions**:
  - Backed up all 517 rows to `backend/data_backups/province_backup_517.json`.
  - Deleted 433 junk import-artifact rows (`region IS NULL`, IDs 85–517) generated by dynamic resolver logic during the one-time Google Sheets import.
  - Retained all 84 legitimate Philippine provinces/territories (`region IS NOT NULL`, IDs 1–84) with their official administrative regions intact.
  - *Context on imports*: This Google Sheets import was a one-time historical data load for the previous semester's oral defense, not a recurring application feature, so no ongoing modification to the import resolver itself was required.
- **User accounts preserved**:
  - The 8 existing staff/test accounts (`tourism_admin`, `sanitation_admin`, `system_admin`, `inspector_juan`, `inspector_maria`, `establishment_owner`, `resort_owner`, `tourist_test_99`) were deliberately KEPT — the client will change passwords via Django `/admin/` before real production use, rather than deleting and recreating user accounts.
- **Consolidated Clean-Slate Database Counts**:
  - **Reference Tables**: `Country`: 6, `Region`: 17, `Province`: 84, `Resort`: 16, `Itinerary`: 12, `TravelMode`: 5, `BoatType`: 7, `VisitPurpose`: 10, `SanitaryBusinessType`: 15, `SanitaryRequirement`: 243, `Barangay`: 40.
  - **Transactional Tables**: `TouristRecord`: 0, `FeedbackEntry`: 0, `SanitaryComplaint`: 0, `SanitaryInspection`: 0, `SanitaryInspectionChecklistItem`: 0, `SanitaryPermitRenewal`: 0, `SanitaryEstablishment`: 0, `HouseholdSanitationRecord`: 0.
- **Full Test Suite Status**:
  - Ran `python manage.py test api --keepdb`: exactly 33 tests ran, 5 failures + 5 errors (identically matching the established baseline).

## Known Pre-Existing Test Failures (baseline, NOT caused by this work)
Exactly 5 errors + 5 failures across the 33-test suite (`manage.py test api --keepdb`), all pre-dating any notification/security work (with all 3 new tourism auth tests passing cleanly):
- **Seed-data dependency issues in `MobilePublicApiTests` (5 errors + 2 failures)**:
  - `ERROR: test_mobile_bootstrap_prioritizes_high_visitor_destinations` (Missing "Orlan Beach Resort" fixture in DB)
  - `ERROR: test_mobile_feedback_creates_feedback_entry` (`AttributeError: 'NoneType' object has no attribute 'resort_id'`)
  - `ERROR: test_mobile_sanitation_inspection_creates_establishment_inspection` (`AttributeError: 'NoneType' object has no attribute 'id'`)
  - `ERROR: test_mobile_sanitation_permit_verify_by_permit_number` (`StopIteration` finding permit number in bootstrap)
  - `ERROR: test_mobile_tourist_registration_accepts_full_web_record_fields` (`AttributeError: 'NoneType' object has no attribute 'id'`)
  - `FAIL: test_mobile_bootstrap_shows_ranked_mauban_destinations_only` (`AssertionError: 'Dona Choleng Camping Resort' not found in []`)
  - `FAIL: test_mobile_tourist_registration_creates_booking_record` (`AssertionError: 400 != 201`)
- **Booking Management issues in `BookingManagementApiTests` (3 failures)**:
  - `FAIL: test_booking_management_filters_by_search_and_status` (`AssertionError: 0 != 1`)
  - `FAIL: test_booking_management_returns_summary_and_rows` (`AssertionError: 0 != 12`)
  - `FAIL: test_booking_status_can_be_updated` (`AssertionError: 404 != 200` — looks like a real bug in the lookup/update logic worth investigating, not just missing data)

*Note: These pre-existing failures have not yet been triaged or fixed; they are queued for a separate task.*

## Pending / Not Started Yet
- **Daily scheduler mechanism for `evaluate_due_notifications`**: Wire automated execution (cron vs. host-specific scheduled worker/task depending on deployment host selection).
- **Mobile bootstrap public notices**: Swap mobile bootstrap's hardcoded notice items over to real calls against `/api/notifications/public/`.
- **Database configuration**: Staying on Supabase (confirmed working; Render does not require Aiven, so no database migration planned). Need to verify which Supabase connection string variant (pooler vs. direct) is configured prior to production deployment.
- **Deployment host selection**: Final hosting platform not yet finalized (Render currently under consideration).
- **Baseline test suite cleanup**: The 10 pre-existing test failures/errors documented above are queued for a dedicated cleanup pass.

