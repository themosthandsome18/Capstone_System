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

