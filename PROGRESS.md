# Project Progress & Status Tracker

## Working Conventions
This project is being developed with Claude-based and ChatGPT-based planners/reviewers working alongside you (Claude Code) as implementer, following strict discipline: small scoped steps, real test output required (not just "tests should pass" claims), full file contents requested when reviewing critical logic (not truncated diffs), git discipline (explicit staging, review diffs before commit, no push without explicit review/approval), and an audit-before-fix approach for any broad review. If a different session or tool picks this up, maintain the same discipline: show real command output, don't claim something works without demonstrating it.

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

- **Test suite isolation & self-contained fixtures** (`386497b`)
  - Resolved all 10 baseline test failures/errors caused by clean-slate database state post-purge:
    - Added `ensure_test_reference_tables()` batch-seeding helper using `bulk_create(..., ignore_conflicts=True)` for `Country`, `Region`, `Province`, `Itinerary`, `TravelMode`, `BoatType`, `VisitPurpose`, and `Resort`.
    - Added `setUpTestData` to `BookingManagementApiTests` to instantiate required test reference tables and 12 initial `TouristRecord` fixtures in single batch queries, resolving `test_booking_management_returns_summary_and_rows` and `test_booking_management_filters_by_search_and_status`.
    - Investigated and resolved the 404 in `test_booking_status_can_be_updated`: confirmed routing and view logic (`tourist-records/<str:survey_id>/`) are correct; the 404 was due to missing `SURV-2026-002` row post-purge, now satisfied by test fixtures.
    - Added `setUpTestData` to `MobilePublicApiTests` with reference tables, mock `SanitaryEstablishment` (`LG-2026-001`), and sanitation test user credentials.
    - Updated `test_mobile_sanitation_inspection_creates_establishment_inspection` to authenticate with the sanitation test token per role-based security requirements.
    - All 33 tests across all 9 test classes in `backend/api/tests.py` now pass cleanly (`Ran 33 tests ... OK`) with zero reliance on seed data and zero modifications to production logic.

- **Dynamic public advisories in mobile bootstrap** (`ef0ba92`)
  - Replaced static notice dictionaries (`"welcome"`, `"sanitation-reporting"`, `"sanitation-dashboard"`) in `build_mobile_notifications` and `build_mobile_sanitation_notifications` with dynamic queries against the `Notification` model (`audience_type='public'`, `notification_type='public_advisory'`, `is_active=True`, not expired).
  - Maintained module partitioning: tourism bootstrap queries `["tourism", "general"]`; sanitation bootstrap queries `["sanitation", "general"]`.
  - Added clean empty-state UI handling in Flutter's `NotificationPage` (`mobile/lib/screens/common_screens.dart`) when no active advisories are present.
  - Added `MobileBootstrapNotificationTests` covering active, module-filtered, inactive, and expired advisory assertions.
  - Test suite passing cleanly at 35/35 tests (`Ran 35 tests ... OK`).

- **Production deployment readiness & WhiteNoise static serving** (`05748f9`)
  - Added production dependencies: `gunicorn>=23.0.0`, `whitenoise>=6.8.0`, and `dj-database-url>=2.3.0`.
  - Hardened `settings.py` decouple environment loader to safely fall back to `os.environ` when `.env` is absent on container hosts.
  - Added `DATABASE_URL` parsing with connection pooling (`conn_max_age=600`, `ssl_require=True`) and fallback to discrete `DB_*` settings.
  - Configured WhiteNoise middleware, `STATIC_ROOT = BASE_DIR / "staticfiles"`, and `CompressedManifestStaticFilesStorage`.
  - Created executable build script `backend/build.sh` (`collectstatic` + `migrate`).

- **Authenticated webhook endpoint for scheduled due notifications** (`2cb400b`)
  - Created secure webhook endpoint `/api/notifications/evaluate-due/` (`POST`) to enable free automated daily cron triggering (via GitHub Actions or external cron) without requiring a paid Render Cron worker.
  - Gated by shared secret `CRON_SECRET_KEY` validated via `X-Cron-Key` header or `Authorization: Bearer <key>` using timing-safe `hmac.compare_digest`.
  - Returns 503 if unconfigured, 403 on invalid/missing key, and 200 on successful scan trigger.
  - Added `NotificationWebhookCronTests` covering all authorization branches (unauthorized, invalid key, valid header/bearer, unconfigured).
  - All 39 tests passing cleanly (`Ran 39 tests ... OK`).

- **Mobile Bootstrap Query Optimizations & In-Memory Performance Caching** (`0786741`, `479e251`, `49a3e7b`)
  - **Tourism Bootstrap Optimization** (`0786741`, `479e251`):
    - Added `CONN_MAX_AGE: 600` to the local discrete database configuration in `settings.py` to enable persistent TCP/SSL connection reuse.
    - Deduplicated destination queries: evaluated all resorts once in `mobile_tourism_bootstrap`, passing pre-fetched resorts into `build_reference_tables_payload(resorts=all_resorts)`, deriving the top-10 destinations in-memory, and passing `destinations[0]` into `build_mobile_notifications(..., top_destination=...)`.
    - Added 15-minute `LocMemCache` caching for the 7 static master tables (`Country`, `Region`, `Province`, `Itinerary`, `TravelMode`, `BoatType`, `VisitPurpose`) under `"mobile_reference_tables_v1"` and active barangays under `"mobile_active_barangays_v1"`, keeping dynamic visitor arrivals and advisories uncached.
    - Dropped tourism bootstrap queries from 13 down to 3 on warm cache, reducing endpoint latency from ~14.7s down to ~3.3s–3.5s.
  - **Sanitation Bootstrap Optimization** (`49a3e7b`):
    - Converted 13 sequential `COUNT(*)` database queries (10 establishment compliance/permit counts + 3 complaint status counts) into in-memory Python calculations over pre-loaded querysets, executing in $< 0.05\text{ ms}$.
    - Deduplicated open complaints (query 18 & 22) and expiring permits (query 3 & 23), passing pre-sliced/filtered lists directly into `build_mobile_sanitation_notifications`.
    - Added 15-minute `LocMemCache` caching for sanitary business types & requirements (`"mobile_sanitation_business_types_v1"`) and reused active barangays cache (`"mobile_active_barangays_v1"`).
    - Reduced query count from 23 down to 5 on warm cache (8 on cold cache), database execution time from 9.04s to 2.01s, and total request time from 11.34s to 4.7s–5.5s.
    - Verified byte-for-byte and field-by-field response body equivalence against baseline with zero payload divergence.
  - All 39 automated tests continue to pass cleanly (`Ran 39 tests ... OK`).
- **Mobile UI Overflow Fixes & Sanitation Web Loader Modernization** (`a5f5d9d`)
  - Fixed horizontal RenderFlex overflow (28px) on itinerary duration row (`mobile/lib/screens/tourism_screens.dart`) using `Flexible` with `maxLines: 1` and `TextOverflow.ellipsis`, and added smooth scroll physics and vertical padding to filter chips.
  - Fixed packing checklist dialog keyboard overflow in `_showAddPackingItemDialog` by wrapping inner `Column` in `SingleChildScrollView`.
  - Replaced heavy sanitation loader with modern minimalist circular spinner and frosted overlay across `PageLoader.js`, `PageLoader.css`, `LoadingOverlay.css`, `Sanitation_index.css`, `SanitationDashboard.js`, and `EstablishmentRecords.js`.
  - Flutter analysis confirmed 0 issues; all 39 automated backend tests continue to pass cleanly (`39/39 passed, OK`).
- **Phase 1 Web UI Polish: Table Layouts & Card Overflow Safety** (`94842c7`)
  - Adjusted `.sanitation-stat-card` to dynamic height (`min-height: 118px; height: auto;`) with flex vertical distribution to eliminate text clipping on browser zoom and multi-line labels.
  - Wrapped Tourism Arrival Monitoring table in a responsive horizontal scroll container (`<div className="table-responsive overflow-x-auto">`) with `min-width: 850px` to prevent clipping on viewports narrower than 1200px.
  - Added touch-friendly scrolling wrappers and clean border/shadow styling for Sanitation Establishment Records (`.establishment-table-card`, `.establishment-table-wrap`).
  - Switched Inspection Management table from rigid `table-layout: fixed` to `table-layout: auto` with `min-width: 820px` and responsive column minimums, giving establishment names and notes ample breathing room.
  - Verified with zero syntax errors and zero backend test regressions.
- **Phase 2 & 3 UI Harmonization: Mobile Card Ellipsis & Web Sidebar Alignment** (`5c2e1e8`)
  - Harmonized `.sanitation-sidebar` width from 400px down to 280px standard width (`min-width: 280px; max-width: 280px; box-sizing: border-box;`) with proportional typography (`13.5px` title, `12px` subtitle, `44px` logo) and synchronized `.sanitation-main` offset to `margin-left: 280px; width: calc(100% - 280px);`.
  - Scaled navigation links with `min-height: 38px; height: auto; padding: 8px 14px; font-size: 13.5px; line-height: 1.3; white-space: normal;` to comfortably host long labels like "Community Concerns & Schedules" without horizontal clipping or awkward breaks.
  - Added `maxLines` and `TextOverflow.ellipsis` across mobile cards in Flutter:
    * Tourism: destination names, tourist names, and itinerary stop titles in `_VisitCard`, `_buildItinerarySection`, `DestinationDetailPage`, `HeroCard`, and `DestinationListCard`.
    * Sanitation: establishment names, draft titles, permit monitoring rows, alert cards, and portal header in `SanitationEstablishmentCard`, `SanitationDraftCard`, `PermitVerificationCard`, `SanitationAlertCard`, `SanitationPermitsPage`, and `SanitationEstablishmentPortalPage`.
  - Flutter analysis confirmed 0 issues across all modified files; all 39 automated backend tests continue to pass cleanly (`Ran 39 tests ... OK`).
- **Dynamic Browser Tab & Favicon Branding for Web and Mobile** (`7479c47`)
  - Updated React Web Portal with Mauban LGU title (`Mauban LGU | Tourism & Sanitary Compliance Portal`), official seal favicon (`favicon.ico`, `favicon.png`), and 192px PNG assets.
  - Implemented dynamic pre-render JS bridge and conditional Dart interop in Flutter web to dynamically serve distinct titles and favicons for Tourism ("Mauban Tourism & Travel Pass" with sailboat emblem) and Sanitation ("Mauban Sanitation & Health Portal" with municipal seal).
  - Verified with 0 Flutter analysis issues and 39/39 backend tests passing cleanly.
- **Sanitary Inspector Dashboard UI Polish** (`aa95e8e`)
  - Wrapped inspector top bar in `SafeArea(top: true, bottom: false)` across `SanitationTopBar`, `SanitationDashboardPage`, and `SanitationMobileShell` to eliminate device clock / notch / battery status bar collision.
  - Renamed bottom navigation bar tab label from "Establish" to "Records" to prevent awkward label truncation.
  - Extended dashboard `ListView` padding to 100px bottom clearance (`padding: const EdgeInsets.fromLTRB(16, 12, 16, 100)`) so the "Recent Activity" card and last action buttons remain fully visible and unobscured by the bottom navigation bar.
  - Added clean empty-state card for the Urgent Alerts section when no active violations or permit follow-ups exist.
  - Verified with 0 Flutter analysis issues.
- **Auth Resilience & Resort Staff Check-in Gateway Updates** (`2e186ab`)
  - Added `sanitary_admin` user provisioning in `backend/api/management/commands/create_default_users.py` and automatic alias fallback in `login_view` (`backend/api/auth_views.py`) with connection pooler reconnect retry handling for `OperationalError`.
  - Updated Tourism gateway wording from "I'm Tourism Staff" to "I'm Resort Staff" with descriptive subtitle and card context for front-desk check-in personnel (`mobile/lib/screens/common_screens.dart`).
  - Updated `StaffAuthGateDialog` in `mobile/lib/screens/tourist_qr_checkin_screens.dart` with debug auto-prefill for staff credentials (`tourism_admin / Tourism@123`) and a "Quick Demo Access" card with auto-fill and direct scanner preview bypass.
  - Verified 39/39 backend tests passing and 0 Flutter analyzer issues.
- **Sanitation Mobile UX Polish & Web Branding Persistence** (`0d4fd99`)
  - **Quick Actions Realigned**: Updated `SanitationDashboardPage` to prioritize direct operational field workflows instead of duplicating bottom navigation tabs:
    * Action 1: "Inspection" (`Icons.fact_check_outlined`) -> routes to `NewInspectionPage` (`SanitationInspectionPage`).
    * Action 2: "Verify QR" (`Icons.qr_code_scanner`) -> routes to `VerifyPermitPage` (`PermitVerificationPage`).
    * Action 3: "Household" (`Icons.assignment_outlined`) -> routes to `HouseholdSurveyPage`.
    * Action 4: "Track Report" (`Icons.manage_search_outlined`) -> routes to `TrackReportStatusPage` (`ReportTrackerPage`).
  - **Notifications Copy Sanitized**: Updated `NotificationPage` header subtitle from "Tourism and community updates" to "Sanitary advisories and compliance updates" to reflect sanitary compliance rather than tourism.
  - **Web Tooltip Artifacts Suppressed**: Configured `tooltip: ''` across back `IconButton` widgets in `NewInspectionPage`, `HouseholdSurveyPage`, `VerifyPermitPage`, `TrackReportStatusPage`, and `FormPageScaffold` to prevent dangling gray web tooltip popovers from hovering over form headers in browser environments.
  - **Web Branding Resilience**: Fixed module reversion in web simulator/responsive preview by guarding `MaubanMobileApp` against overwriting active sanitation branding, asserting sanitation branding in active screen trees, and persisting active module in the JS bridge.
  - Verified with 0 Flutter analysis issues and all unit/widget tests passing cleanly.
- **Security Audit & Unauthenticated Bypass Removal** (`d057bde`)
  - **Incident Summary**: An unauthenticated "Quick Demo Access" bypass-login pattern containing plain-text credentials, auto-fill shortcuts, and unauthenticated state bypass buttons was introduced across 3 mobile gateway screens:
    1. *Establishment Account Login* (`mobile/lib/screens/sanitation_screens.dart`): Caught during code review and entirely discarded before committing.
    2. *Sanitary Inspector / Staff Login* (`mobile/lib/screens/sanitation_screens.dart`): Introduced in commit `aa95e8e`; identified and completely removed in `d057bde`.
    3. *Resort Staff QR Gate Dialog* (`mobile/lib/screens/tourist_qr_checkin_screens.dart`): Introduced in commit `2e186ab`; identified and completely removed in `d057bde`.
  - **Remediation**:
    * Removed all "Quick Demo Access" containers, clear-text credential labels, and unauthenticated bypass buttons (`Direct Preview Inspector Shell (Bypass Login)` and `Direct Preview Scanner (Bypass Login)`).
    * Restored exact form spacing and layout to pre-incident state.
    * Removed all `kDebugMode` controller auto-prefills (`sanitary_admin / Sanitation@123` and `tourism_admin / Tourism@123`) from `initState`.
    * Conducted repository-wide audit confirming zero bypass buttons, zero credential reveals, and zero demo shortcuts remain in the app.
    * Re-verified database hygiene: deleted temporary preview establishment (`id=445`, `Mauban Seafood & Grill (Preview)`) created for UI verification, returning `SanitaryEstablishment` count back to clean 0.
  - **Policy Reaffirmed**: Real authentication only across all roles (Tourist, Resort Staff, Sanitary Inspector, Establishment Owner, Admin) with full server validation — no bypasses or shortcuts.
- **Rich Establishment Account Portal UI Enhancements** (`2156cbf`)
  - Enhanced `SanitationEstablishmentPortalPage` in `mobile/lib/screens/sanitation_screens.dart` with structured operational sections:
    * **Renewal Notice Banner**: Dynamic warning card with `Icons.warning_amber_rounded` displaying permit expiration dates and countdowns when expiring within 60 days or expired.
    * **Official Permit & QR Card**: Preserved official business name, permit details, and scannable `QrImageView` permit code with clean elevation and card styling.
    * **Permits & Deadlines**: Comprehensive overview of Sanitary Permit and Environmental & Health Clearance with status badges (`Active`, `Expiring Soon`, `Expired`) and days remaining.
    * **Requirements Checklist with Filter Tabs**: Categorized filter tabs (`[All (X)]`, `[Need Action (Y)]`, `[Completed (Z)]`) tracking compliance documents (Barangay Clearance, Health Cards, Water Potability, Waste & Grease Trap, Pest Abatement) with status badges (`SUBMITTED` / `PENDING`) and a completion progress bar (`LinearProgressIndicator`).
    * **Record Timeline**: Vertical timeline tracking recent inspection events, inspector remarks, and timestamps with color-coded status indicator dots (green = compliant/passed, amber = notice issued, red = violation).
  - Maintained strict account-based authentication with no unauthenticated bypasses, credential disclosures, or mock shortcuts.
  - Verified 0 issues via `flutter analyze` and all widget/unit tests passing cleanly.
- **Sanitary Inspector & Staff Management Module** (`074c4c1`)
  - Implemented full-stack Inspector / Staff Management module allowing LGU administrators to manage field inspector credentials and operational statuses without accessing Django `/admin`.
  - **Backend API**:
    * Implemented `/api/v1/sanitation/staff/` and `/api/sanitation/staff/` (`GET`, `POST`) with role checks, minimum password length enforcement (6 characters), unique username validation, secure password hashing via `set_password()`, `is_staff: True` provisioning, and `ROLE_SANITATION` profile metadata.
    * Implemented `/api/v1/sanitation/staff/<id>/` and `/api/sanitation/staff/<id>/` (`GET`, `PATCH`, `PUT`) supporting account activation/deactivation toggles, profile updates, and self-deactivation guards protecting administrators.
    * Integrated audit logging in `ActivityLog` for all account creations and status changes.
    * Added comprehensive automated test suite `SanitaryStaffApiTests` covering all CRUD and security access constraints (6/6 tests passing).
  - **Frontend Web Dashboard**:
    * Added `StaffManagement.js` with KPI metric cards (Total, Active, Inactive), search and status filters, responsive inspector directory table, "+ Add New Inspector" modal with validation, and confirmation dialogs for account status toggles.
    * Updated `SanitationSidebar.js` with dedicated `ADMINISTRATION` navigation group linking to `/sanitation/staff`.
    * Integrated modular route in `sanitationRoutes.js` guarded with `withErrorBoundary`.
    * Cleaned up dummy/sample test accounts from the database (`Deleted 7 sample user records`).
  - Production build verified with 0 errors and 0 warnings (`npm run build`).

- **Supabase S3 Cloud Storage Backend & Upload Security Hardening** (`f762692`, `a1543e9`)
  - Configured `django-storages` with `boto3` to use Supabase S3-compatible cloud object storage (`media` bucket) with automatic local `FileSystemStorage` fallback when credentials are not supplied.
  - Implemented secure upload handler in `backend/api/services/upload.py`:
    * Enforced random UUIDv4 filenames to prevent file overwrite collisions and directory traversal attacks.
    * Enforced 5MB file size limit (`MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024`).
    * Validated and normalized image MIME types and extensions (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif`).
    * Handled custom exceptions `UploadValidationError` (HTTP 400) and `StorageServiceError` (HTTP 503).
  - Added automated test class `SecureUploadTests` (4 tests) in `backend/api/tests.py` covering valid image uploads, oversized files (>5MB), non-image files, and missing upload payloads.

- **Dynamic Module-Aware Browser Tab Branding & Booking Wizard UX Validation** (`879404c`, `2b0303a`)
  - Implemented `useDocumentBranding.js` in the React Web Portal for dynamic document title and favicon switching:
    * Tourism Module: "Mauban LGU | Tourism & Travel Pass" with sailboat favicon.
    * Sanitation Module: "Mauban LGU | Sanitary & Health Compliance" with official municipal seal favicon.
  - Fixed Tourism Booking Management new booking wizard (`BookingManagement.js`): removed confusing pre-selected `Arrival Status` default and added explicit step validation preventing submission of incomplete tourist entries.

- **Automated Keep-Alive Ping & Scheduled Notifications Workflow** (`6c82dbf`)
  - Created automated GitHub Actions cron workflow `.github/workflows/keep-alive-and-notifications.yml`:
    * Periodically pings `/api/health/` every 14 minutes to prevent Render free-tier web dyno sleep / cold starts.
    * Triggers scheduled daily due-date scanning by posting to `/api/notifications/evaluate-due/` with the secret `CRON_SECRET_KEY` once daily at 00:00 UTC (08:00 AM PHT).

- **Cold-Start Resilience, API Timeouts, and Mobile Production Routing** (`36ef212`, `465a692`)
  - Integrated 30-second fetch timeout with `AbortController` in `frontend/src/shared/apiClient.js`.
  - Added friendly cold-start wake-up notices and retry guidance in `PageLoader.js` and `PageLoader.css` for when free-tier backend instances take >8s to respond.
  - Pointed default mobile fallback `apiBaseUrl` in `mobile/lib/utils/helpers.dart` to the live production Render backend (`https://capstone-backend-stzr.onrender.com/api`).

- **Web Download Fallback & Dual-Option Establishment Portal Access** (`9007bbf`, `b652f7a`)
  - Added browser-compatible blob download fallback (`mobile/lib/utils/web_download_web.dart`) for QR pass image exports and CSV arrival exports when running the Flutter app on web browsers.
  - Supported HEIC/JPEG uploads in mobile API client using `http_parser` MediaType mapping.
  - Added dual-option access mode in the Establishment Portal (`mobile/lib/screens/sanitation_screens.dart`): Option A allows traditional username/password authentication; Option B allows direct permit code entry or camera QR scanning.

- **Sanitation PWA Web Build Adaptations vs. Inspector Mobile Exclusivity** (`046b665`)
  - Enforced mobile exclusivity for Sanitary Inspector field workflows: hid the "Staff Sign In" button on web (`kIsWeb == true`) in `SanitationAccessGateway`, replacing it with a "Mobile App Only" badge to restrict field inspection and survey tools to native mobile devices.
  - Added graceful camera error fallback UI in `QrScannerScreen` for web browsers when camera/webcam hardware is unavailable, displaying a clean notice guiding users to manual permit code verification.

- **Absolute Photo URLs & Web Dashboard Media Routing** (`046b665`, `4d046e2`, `385f37c`)
  - Resolved relative `/media/` paths breaking photo evidence displays on the Web Complaints Management dashboard:
    * Added `SerializerMethodField` for `photo_documentation` in `SanitaryComplaintSerializer` that converts relative local paths or stored URLs into fully-qualified absolute URLs via `request.build_absolute_uri()`.
    * Propagated `context={"request": request}` across all complaint serializer instances in `sanitation.py` (list GET, detail GET, POST, PATCH), `mobile.py` (complaint submit), and `services/sanitation.py` (`build_sanitation_complaints_payload`).
  - Updated `ComplaintsManagement.js` with a responsive photo thumbnail grid, error fallbacks, and a full-size modal preview for inspecting sanitary violation photographic evidence.

- **Mobile Submission Image Compression & Extended API Timeouts** (`4d046e2`)
  - Added client-side image compression in Flutter mobile complaint submission (`sanitation_screens.dart`): configured `image_picker` with `maxWidth: 1280`, `maxHeight: 1280`, and `imageQuality: 80` to prevent network payload timeouts over cellular data.
  - Extended mobile HTTP timeouts in `TourismApi` (`mobile/lib/services/api.dart`): standard requests increased to 90 seconds (`_requestTimeout`), and multipart image uploads increased to 120 seconds (`_uploadTimeout`).

- **Supabase S3 Public Object CDN URL Fix & Writable Serializer Restore** (`385f37c`)
  - Fixed Supabase S3 custom domain resolution in `backend/backend/settings.py` via helper `_get_supabase_s3_custom_domain()`: correctly constructs the public storage CDN path `<ref>.supabase.co/storage/v1/object/public/<bucket>` when `USE_S3_STORAGE` is enabled.
  - Restored writable support for `photo_documentation` in `SanitaryComplaintSerializer`: overrode `to_internal_value()` and `validate()` to accept raw incoming string URLs or comma-separated upload lists during `POST` and `PATCH` requests while continuing to output serialized absolute URLs on `GET`.
  - Cleaned up redundant local media `re_path` from root `backend/urls.py` in favor of standard conditional debug media serving.

- **Comprehensive Project Code Audit (`PROJECT_AUDIT.md`)**
  - Conducted an exhaustive, read-only architectural and codebase audit across Backend, Frontend, and Mobile.
  - Produced 722-line standalone technical document `PROJECT_AUDIT.md` at repository root covering:
    1. Project Overview & Municipal Scope
    2. Complete Tech Stack & Installed vs. Actually Imported Packages
    3. 2–3 Level Project Directory Hierarchy
    4. 18 Data Models, Relationships, Constraints, and Automated Scorer Logic
    5. User Roles (`admin`, `tourism`, `sanitation`, `establishment`, public) & Token Auth Flows
    6. Detailed Feature Inventory across Web and Mobile modules
    7. Comprehensive Routing Table covering all 50+ REST endpoints
    8. Known Issues, Stubs, Hardcoded Paths, and Demo Credentials
    9. Environment Variables, Setup Instructions, and Management CLI Commands
    10. Security, Data Integrity, and Architectural Risk Observations

- **Backend Role-Isolation: Public Tourist Privilege Escalation Fix** (`60fdee3`)
  - Resolved critical privilege escalation where public tourist registration assigned administrative `ROLE_TOURISM` ("tourism"), granting registered tourists unauthorized access to Tourism staff and booking management endpoints.
  - Added discrete `ROLE_TOURIST = "tourist"` and `(ROLE_TOURIST, "Tourist")` to `USER_ROLE_CHOICES` in `backend/api/models.py`.
  - Kept `UserProfile.role` default (`default=ROLE_TOURISM`) and existing production profiles untouched to preserve production compatibility.
  - Updated `tourist_register_view` in `backend/api/auth_views.py` so newly registered public tourists explicitly receive `ROLE_TOURIST`.
  - Imported `ROLE_TOURIST` in `backend/api/permissions.py`; kept `MODULE_ROLES["tourism"] = {ROLE_ADMIN, ROLE_TOURISM}` strictly restricted to staff and administrators.
  - Generated Django migration `0032_alter_notification_target_role_and_more.py` (verified via `sqlmigrate` as pure zero-lock, schema-neutral `(no-op)`).
  - Added 3 automated regression security tests in `backend/api/tests.py` (`AuthApiTests`):
    * `test_public_tourist_registration_assigns_tourist_role`: Asserts 201 Created and profile role is `tourist`.
    * `test_tourist_cannot_access_staff_tourism_endpoints`: Asserts HTTP 403 on `/api/booking-management/` and `/api/mobile/tourism/records/lookup/`.
    * `test_tourism_staff_retains_access_to_staff_tourism_endpoints`: Asserts HTTP 200 on `/api/booking-management/` and access allowed to staff lookup for legitimate staff.
  - Verified 5/5 passed in `AuthApiTests` and full suite passed with 59/59 tests (`Ran 59 tests in 519.018s, OK`).
  - **Production Deployment & Live Verification (`60fdee3206d6218674ff65c9bb517b533095381b`)**:
    * Pushed commit `60fdee3` to `origin/main`; automatically deployed by Render continuous deployment.
    * Migration `0032` applied in production PostgreSQL database at 2026-09-18 02:28:01 UTC.
    * Verified live production backend health at `/api/health/` (HTTP 200 `{"status": "ok"}`).
    * Executed live security regression tests using an ephemeral test account:
      - Public tourist registration returned HTTP 201 with `role="tourist"` and `role_label="Tourist"`.
      - Tourist token received HTTP 403 Forbidden on `GET /api/booking-management/` (`"You do not have access to this module."`).
      - Tourist token received HTTP 403 Forbidden on `GET /api/mobile/tourism/records/lookup/?query=...` (`"Only tourism staff and administrators can look up visitor records."`).
      - Authorized Tourism staff (`tourism_admin`) retained access: HTTP 200 on `GET /api/booking-management/` and HTTP 404 on nonexistent lookup query (proving authorization boundary passed).
    * Ephemeral test user was cleaned up immediately after verification (3 records deleted; zero production business data modified).
    * Existing production user accounts holding the old `tourism` role were intentionally NOT bulk-converted.

- **Sanitary Establishment Records Phase 1: Registration/Edit Workflow Redesign** (`703533a` — `feat(sanitation): redesign establishment records workflow`)
  - **Scope of Phase 1**:
    * Redesigned the Sanitary Establishment Records registration/edit workflow.
    * New registrations start as **No Permit** instead of inventing permit data; registration focuses on establishment profile, business type, address/barangay, contact, and location.
    * Edit mode loads existing establishment values non-destructively.
    * Permit issuance/generation remains an explicit, separate action.
    * SP/Large is presented as internal **Permit Coverage**, not as physical establishment size.
    * Client-facing Business Type categories are exactly the 9 confirmed categories: (1) Commercial / NF, (2) Food Establishment, (3) Industrial Establishment, (4) Agro-Industrial Establishment, (5) Institutional Establishment, (6) Water Refilling Station, (7) Public Transport, (8) Ambulant Food Vendor, (9) Public Places.
    * Existing underlying business type IDs/names are preserved; known legacy/importer business types are mapped to the approved client-facing categories; unknown underlying types do not create additional Business Type filter categories.
    * Location wording no longer implies GPS verification; valid map references are distinguished from invalid/out-of-bounds coordinates.
    * Timeline precedence remains `updated_at || created_at || permit_issued_date`.
    * Included regression/characterization tests and frontend/backend test coverage.
  - **Post-Commit Test/Build Verification (all passed)**:
    * Establishment Records focused frontend tests: 101/101 passed.
    * Full frontend tests: 126/126 passed.
    * Backend tests: 69/69 passed using an isolated in-memory SQLite database. SQLite was used intentionally so the test run did not create or alter a test database on the production Postgres/Supabase environment. Backend tests were **not** run against production Postgres.
    * Frontend production build passed.
    * `git diff --check` passed.
  - **Git/Deployment**:
    * Pushed `703533a` to `origin/main` as a fast-forward from `2e14a30`.
    * `origin/main` pointed to `703533a` when the Phase 1 verification was performed. It has since advanced to `49bf302` through separate Tourism commits. Those commits do not modify the Phase 1 Sanitation source files.
    * No manual deployment was performed. No production database modification was performed as part of the Phase 1 release or its verification.
    * The later Tourism release includes migration `0033`; whether that migration has been applied in production was not verified from public read-only checks. This entry makes no claim that production data is unchanged overall.
  - **Initial Production Deployed-Build Verification (build from `703533a`)**:
    * Production frontend `https://capstone-frontend-ohuj.onrender.com/` returned HTTP 200 and loads the production backend API `https://capstone-backend-stzr.onrender.com/api`.
    * Backend `/api/health/` returned HTTP 200 with status ok.
    * Inspected the deployed frontend bundle: deployed `EstablishmentRecords.js` and `businessTypeLabels.js` matched the Phase 1 versions from `703533a` and differed from `2e14a30`; the CSS deployed at that time matched the Phase 1 local build byte-for-byte.
    * Phase 1 markers and all 9 approved Business Type categories were found in the deployed bundle; no `GPS` wording was present in the deployed Establishment Records build.
  - **Current Production Deployed-Build Re-Verification (after `origin/main` advanced to `49bf302`)**:
    * Verified through the production frontend's publicly accessible source maps (`main.*.js.map`, `main.*.css.map`), comparing their embedded sources against the repository source using only read-only requests.
    * The current production frontend is built from `49bf302`: every application JS and CSS source file in the source maps is byte-identical to `49bf302`. No commit SHA is exposed publicly; this conclusion comes from the source comparison.
    * Production frontend returns HTTP 200 and points to the production backend API `https://capstone-backend-stzr.onrender.com/api`. Backend `/api/health/` returns HTTP 200 with `status: ok`.
    * The deployed `EstablishmentRecords.js` and `businessTypeLabels.js` remain byte-identical to the Phase 1 versions from `703533a`.
    * The Phase 1 Sanitation strings (`Permit Coverage (internal SP / Large)`, `Location Coordinates`, `Map Reference`, `Issue & Generate Permit Now`, `No Permit`) and all 9 client-facing Business Type categories remain present. `GPS` wording remains absent from the deployed Establishment Records implementation.
    * The current production CSS is **not** byte-identical to the earlier Phase 1 build. The difference is attributable to the later Tourism changes in `Tourism_index.css` and `BookingManagement.wizard.css`; `Sanitation_index.css` and all other CSS sources remain unchanged.
    * Phase 1 remains strongly evidenced in the current deployed frontend.
  - **Limitation — Authenticated Production UI NOT Verified**:
    * The verifications above cover the deployed build only. Authenticated production Establishment Records UI behavior was **not** manually verified.
    * No staff credentials were used. No production establishment was created, edited, issued a permit, or otherwise modified during verification.
    * The authenticated production workflow must therefore not be treated as fully verified.
    * *Later update*: a limited read-only authenticated inspection of the Business Type categories and Register dropdown was performed (see **Ambulant Food Vendor Business Type** below). The full authenticated workflow remains unverified.


## Completed, Pushed & Deployed — Production Verified (read-only)
- **Ambulant Food Vendor Business Type** (migration `0034_add_ambulant_food_vendor_business_type`)
  - Implementation commit: `57f1f086547b4bac84aca5e51e5964ae4437322c`, documentation commit `e7015992a2f5a50d32c1ea6efb70c133441d6896`. Both pushed; `origin/main` is at `e701599` and the Render deployment is live.
  - **Authenticated Production UI Observation (read-only)**:
    * Sanitation → Establishment Records was inspected read-only with an authorized account.
    * The 9 approved client-facing Business Type categories were visible, including Ambulant Food Vendor.
    * The Register New Establishment Business Type dropdown showed "Ambulant Food Vendor — No business type configured yet": the category existed in the UI but had no underlying selectable `SanitaryBusinessType`.
    * No production record was created or modified. No Save, Submit, Update, Issue, or Renew action was performed.
  - **Client Confirmation**:
    * Official business type name: Ambulant Food Vendor.
    * Inspection frequency: Monthly.
    * Standard requirements: not yet provided. Additional requirements: none yet provided. Legal basis: not yet provided.
  - **Implementation**:
    * Added data migration `backend/api/migrations/0034_add_ambulant_food_vendor_business_type.py`, which creates the underlying `SanitaryBusinessType` with `name = "Ambulant Food Vendor"`, `inspection_frequency = monthly`, and no requirements. It does nothing if a type with that name (any casing) already exists; its reverse is a no-op.
    * A data migration was used because seed data is disabled in production (`USE_SEED_DATA=False`), and adding the type to `SANITARY_BUSINESS_TYPES` would have auto-generated the standard requirements for both SP and Large.
    * The existing Phase 1 mapping in `businessTypeLabels.js` already maps this name to the client-facing Ambulant Food Vendor category, so the type becomes selectable in Register/Edit. No UI workaround was added.
    * Corrected the stale comment in `businessTypeLabels.js` that claimed the category was already represented by imported production data.
    * No sanitary requirements, legal basis, or SP/Large-specific requirements were invented or added.
  - **Verification (local)**:
    * New backend Ambulant tests: 7/7 passed. Full backend suite: 100/100 passed, run on isolated in-memory SQLite (not production Postgres).
    * Focused frontend tests (Establishment Records): 106/106 passed. Full frontend suite: 131/131 passed.
    * `makemigrations --check` passed (no model changes pending); `0034` is the only new migration.
    * `git diff --check` passed.
    * Frontend production build succeeded twice without errors: a default build and a build with the production API URL. The production-URL build's JS, CSS, `index.html`, and `asset-manifest.json` were byte-identical to the currently deployed production frontend, confirming the comment-only change does not alter shipped code.
    * No unrelated source, configuration, infrastructure, or mobile changes were found. Test-generated media files under `backend/media/` (gitignored) were local only.
  - **Production Deployment State**:
    * Migration `0034` **is applied in production**, based on the production `Ambulant Food Vendor` row created by the Render deployment (via `migrate` in `backend/build.sh`). This was the intended, intentional production data change.
    * No production database modification was performed during the implementation itself or during verification; the row was created by the deployment's `migrate` step.
  - **Production Verification (read-only, after deployment)**:
    * Verified through the public unauthenticated sanitation bootstrap endpoint and the deployed frontend bundle. No write requests were made, and no production records were created or edited.
    * Production has exactly one case-insensitive `Ambulant Food Vendor` type: production ID `24`, frequency `monthly`, requirement count `0`.
    * Production now has 16 business types, up from the previously recorded 15. All 15 previously known business type names remain present and unchanged.
    * Total configured requirements remain `243`; no requirements were deleted during this work.
    * No production establishment currently uses the Ambulant type.
    * The deployed frontend's 51 application source files are byte-identical to commit `e701599`.
  - **Verification Limitations**:
    * Production verification could not directly confirm the authenticated production UI: no staff session was used, so the logged-in Register/Inspection/Renewal screens were not visually verified.
    * Production verification could not directly read `django_migrations`; applied status is based on the production `Ambulant Food Vendor` row, which only migration `0034` creates.
    * Production verification could not perform a complete before/after comparison of establishment records, so this entry does not claim that establishment records definitely did not change.
    * Production verification could not directly confirm the backend commit SHA; the backend exposes no version or commit information.
  - **Requirements Status**:
    * Ambulant Food Vendor has zero sanitary requirements by design, because the Sanitation Section has not yet provided the official requirements or legal basis. The requirement list is **not** complete.
- **Web Zero-Requirement Safety Fix** (Inspection Management and Permit Renewal; web only)
  - Implementation commit: `57f1f086547b4bac84aca5e51e5964ae4437322c`, documentation commit `e7015992a2f5a50d32c1ea6efb70c133441d6896`. Both pushed; `origin/main` is at `e701599` and the Render deployment is live.
  - **Root Cause**:
    * The existing web Inspection Management and Permit Renewal workflows substituted hard-coded generic requirements when a business type had no configured requirements.
    * Inspection Management's fallback contained 10 generic items and could save them as inspection checklist items.
    * Permit Renewal's fallback (`getEstablishmentRequirements`) contained 7 generic items and could save selected items as `submitted_requirements`.
    * This affected any zero-requirement business type, not Ambulant specifically. Ambulant would have exposed it, because migration `0034` intentionally creates that type with zero requirements.
  - **Web Fix** (`frontend/src/sanitation/pages/InspectionManagement.js`, `frontend/src/sanitation/pages/PermitRenewal.js`):
    * Inspection Management no longer substitutes the 10 generic requirements; Permit Renewal no longer substitutes the 7 generic requirements.
    * Zero-requirement types now show an honest "No requirements configured yet." state.
    * Inspections submit an empty checklist and renewals submit an empty `submitted_requirements` list instead of fabricated requirements.
    * Existing configured requirements continue to behave as before. Permit Renewal's cross-size behavior (using a type's own configured requirements from the other SP/Large coverage when none match) was intentionally preserved.
  - **Verification (local)**:
    * New tests: `InspectionManagement.test.js` (5) and `PermitRenewal.test.js` (9); 14/14 passed.
    * Against the pre-fix implementation, 8/14 intentionally failed, demonstrating that the tests catch the old fallback behavior.
    * Full frontend suite: 145/145 passed across 5 suites.
    * Production-URL frontend build compiled successfully. `git diff --check` passed.
    * Backend tests were not rerun because no backend code changed; the previous 100/100 result remains valid for the unchanged backend.
    * No production database or API was modified.
  - **Scope**:
    * Web-only safety fix. Backend, migration `0034`, seed data, mobile code, requirements architecture, and production data were not changed.
  - **Mobile Limitation (not fixed)**:
    * The mobile Flutter app still contains a generic fallback checklist for zero-requirement business types, and those items can be submitted and saved as inspection checklist items.
    * Mobile is **not** yet safe for zero-requirement types. Fixing it is a separate pending Flutter change that will require a source change and a new APK/build verification if approved.
  - **Existing Production Impact (inference at the time; since confirmed in production)**:
    * *Stated before production verification*: which existing production business types had zero configured requirements was not verified at that point. The inference was that the 13 seeded types produce exactly 243 requirement rows, matching the `SanitaryRequirement: 243` recorded at the clean-slate cleanup, which suggested the two non-seeded production types (likely "Food Establishment" and "Commercial Non Food") had zero requirements and were already receiving the generic fallback.
    * *Confirmed afterwards by the read-only production verification*: the three zero-requirement production types are `Ambulant Food Vendor`, `Commercial Non Food`, and `Food Establishment`, and the deployed web code no longer contains the old generic fallbacks. This confirmation rests on the public bootstrap data and the deployed frontend bundle; the authenticated UI was not visually checked.
  - **Production Verification (read-only, after deployment)**:
    * The deployed frontend's 51 application source files are byte-identical to commit `e701599`. The old 10-item Inspection fallback and 7-item Renewal fallback are absent from the deployed frontend, and the new honest zero-requirement state is present.
    * Production currently has three zero-requirement business types (`Ambulant Food Vendor`, `Commercial Non Food`, `Food Establishment`), which confirms the earlier inference about the two non-seeded types.
    * Production verification could not directly confirm the authenticated production UI: the logged-in Inspection and Renewal screens were not visually verified.
  - **Ambulant Status**:
    * Migration `0034` is applied in production. Ambulant Food Vendor still intentionally has zero configured requirements; no requirements or legal basis were invented.


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
  - Ran `python manage.py test api --keepdb`: all 39 tests passed (`39/39 passed, 0 failures, 0 errors, OK`).

## Pre-Existing Test Failures (RESOLVED)
~~All 5 errors + 5 failures previously documented here are now fully resolved via self-contained test fixtures in `backend/api/tests.py` (`386497b`). All 33 tests pass cleanly.~~

## Completed & Merged to `main` — Mobile Not Rebuilt
*These entries were written before their branches were merged. Both are now fast-forwarded into `origin/main` (`65a687f`). Their "not merged" notes below are superseded by this heading. A new APK build is still required for either change to reach mobile users, and no real-device testing has been done.*

- **Explicit Inspection Status for Empty Checklists** (branch `sanitation/inspection-status-explicit`, branched from `65a687f`; NOT merged)
  - **Rule**: when an inspection's checklist is empty (a business type with zero configured requirements), the app no longer auto-defaults `status_after_inspection`. The inspector must choose one before submitting, on both web and mobile. Non-empty checklists keep their existing behaviour exactly, including the pre-existing web/mobile divergence in that path.
  - **Why**: an empty checklist gives the app nothing to infer a status from. The previous default of `good_standing` silently recorded a compliance judgement that no one had made.
  - **Backend finding (read-only; backend unchanged)**: `status_after_inspection` on `SanitaryInspection` is `models.CharField(max_length=30, choices=SANITARY_STATUS_CHOICES, default=SANITARY_STATUS_GOOD)` and is not `blank=True`. In `SanitaryInspectionCreateSerializer` it therefore resolves to a `ChoiceField` with `required=False` and `allow_blank=False`. Verified directly against the serializer: **omitting** the field is skipped during validation and the model default `good_standing` applies silently; sending **blank** `""` is rejected with `'"" is not a valid choice.'` Both the web and mobile clients therefore block before sending rather than sending an empty value.
  - **Web fix (commit `56276bc`, `frontend/src/sanitation/pages/InspectionManagement.js`)**: the initial status is `""` when the checklist is empty and no draft status exists; the select renders a disabled "Select status" placeholder; `handleSubmit` blocks with "Select the status after inspection." and sends nothing. A saved draft status is still restored first, as before.
  - **Mobile fix (commit `887e574`, `mobile/lib/screens/sanitation_screens.dart`)**: `_status` is nullable and `_statusForChecks` returns null for an empty checklist; the Inspection status dropdown shows a "Select status" hint via a new optional `hint` parameter on the shared `DropdownTile`; `_submit` blocks with the same message. The four statuses were extracted into a named `sanitationInspectionStatuses` constant.
  - **Tests**: 4 new web tests in `InspectionManagement.test.js` (2 failed against the pre-fix code) and 3 new/changed mobile tests in `sanitation_inspection_checklist_test.dart` (3 failed against the pre-fix code). Two existing web tests and one existing mobile test that submitted an Ambulant inspection without choosing a status were updated to pick one, since that is the intended behaviour change.
  - **Verification**: frontend suite 149/149 passing across 5 suites (145 before + 4 new); `npm run build` compiled successfully. `flutter test` 13/13 passing; `flutter analyze` reports the same 4 pre-existing info-level issues — no new issues.
  - **Not verified**: not merged to `main`, not deployed, **a new APK build is still required**, and no real-device or emulator end-to-end test was performed.

- **Mobile Zero-Requirement Inspection Checklist** (branch `sanitation/mobile-zero-requirements`, branched from `f3bd653`; merged to `main`)
  - **Problem**: the Flutter inspection form fabricated a checklist whenever a business type had no configured requirements. `_defaultChecksFor()` in `mobile/lib/screens/sanitation_screens.dart` substituted five invented items ("Proper waste disposal system", "Clean water supply available", "Functional toilet facilities", "Food handling area is clean", "Valid sanitary permit displayed"), and those items could be ticked and submitted as real inspection results. An unknown business type produced the same fabricated list.
  - **Fix (commit `598e850`)**: the list logic was extracted into a pure top-level `buildInspectionChecks(businessTypes, businessTypeId)` and the hard-coded fallback removed. A type with no configured requirements, or an unrecognised type, now yields an empty checklist. Types that do have requirements are unchanged: same names, same configured order, same case-insensitive de-duplication, all starting unchecked.
  - **Fix (commit `97a6d4d`)**: the inspection form now handles an empty checklist honestly. `InspectionChecklistPanel` shows "No requirements configured yet." — the same wording as the web form — instead of a "0% Complete (Unchecked)" score. The `_checks.isEmpty` guard that rejected submission with "Inspection checklist is required." was removed, so the submission sends `checklist_items: []`. The starting status for an empty checklist is `good_standing`, mirroring the web form's `if (total === 0 || completed === total) return "good_standing";` rule in `frontend/src/sanitation/pages/InspectionManagement.js`; the inspector can still change it from the Inspection status dropdown. Non-empty checklists keep their existing status behaviour.
  - **Backend**: no change was needed. `SanitaryInspectionCreateSerializer` already declares `checklist_items` as `required=False` and defaults it to `[]`, and `sync_establishment_after_inspection` copies the submitted `status_after_inspection` without deriving any score from the checklist, so an empty list cannot cause a mis-score or a divide-by-zero.
  - **Tests**: `mobile/test/sanitation_inspection_checklist_test.dart` (new, 6 tests). Three of them failed against the pre-fix code, proving the fabrication existed. `flutter test` reports 7 passing tests across the suite and `flutter analyze` reports the same 4 pre-existing info-level issues as before the change — no new issues.
  - **Not verified**: this work has **not** been merged to `main` and **not** deployed. A new APK build is still required, and **no real-device or emulator end-to-end test was performed** — the submission path was exercised only through a fake API in widget tests, never against a running backend.
  - **Related item**: the Establishment Portal's `_buildRequirements()` fabrication was fixed separately, below.

- **Establishment Portal Real Requirements** (branch `sanitation/portal-real-requirements`, branched from `87f8cd6`; merged to `main`)
  - **Problem**: `_buildRequirements()` in `mobile/lib/screens/sanitation_screens.dart` returned a hard-coded list of five compliance documents shown to business owners in the Establishment Portal — "Barangay Business Clearance", "Employee Health Certificates", "Water Potability Test Result", "Solid Waste & Grease Trap Maintenance" and "Pest & Vermin Abatement Plan" — each with an invented SUBMITTED/PENDING badge, an invented description and an invented timestamp such as "Verified on Jan 15, 2026", "Updated 12/12 staff records", "Tested on Jan 22, 2026 • Daungan Lab" and "Certified valid until Dec 2026". The list ignored the establishment's actual business type, and the badges and dates were derived from `complianceStatus`, which records nothing about document submission. A completion percentage and "N of 5 requirements met" counters were computed from those invented values.
  - **Fix (commit `5f916e7`)**: the card now lists the requirement names actually configured for the establishment's business type. The portal page takes a new `businessTypes` argument, supplied from the same `SanitationBootstrap` the gateway already holds, so no backend or API change was needed. Name de-duplication reuses `buildInspectionChecks`, so the portal and the inspection form behave identically. All five fabricated documents, their descriptions, badges and timestamps were deleted, along with the filter tabs, the counters and the completion progress bar that depended on them.
  - **Honest states**: a business type with no configured requirements shows "No requirements configured yet."; a business type that cannot be resolved from the loaded types shows "Requirements unavailable." Nothing is derived from `complianceStatus` any more.
  - **Tests**: `mobile/test/sanitation_portal_requirements_test.dart` (new, 4 tests), all four of which failed against the pre-fix code. They assert the real names appear, the two honest empty states appear, none of the five fabricated documents appear, and none of the invented evidence fragments ("Verified on", "Tested on", "Daungan Lab", "12/12", "Certified valid until") appear anywhere in the rendered page — including for an establishment with a recorded violation.
  - **Verification**: `flutter test` reports 11 passing tests across the suite; `flutter analyze` reports the same 4 pre-existing info-level issues — no new issues.
  - **Not verified**: not merged to `main` and not deployed. A new APK build is still required, and **no real-device or emulator end-to-end test was performed** — the portal was exercised only in widget tests.

## Establishment Records — Client Meeting Fixes (branch `sanitation/establishment-client-fixes`, NOT merged, NOT deployed)
- Branched from `2426b65`. Commits: `79098e8` (categories), `b966a9d` (frequencies), `7865f89` (permit number), `1aab64f` (table text).
- **Client meeting decisions (recorded as stated by the client, in person)**:
  - **Violation levels**: violations use three colour-coded levels. Not implemented yet.
  - **Barangay sanidad accounts**: barangay sanidad staff get individual per-person accounts, not a shared barangay account. Not implemented yet.
  - **Business type**: the business-type field itself stays as it is; only the category mapping and inspection frequencies below were corrected.
  - **Inspection frequencies**: set per the client's form (below).
  - **Sanitary permit number** is the most important field to capture when adding a record ("pinakamahalaga"); permits are valid for one year.
- **Business-type categories** (`79098e8`, `businessTypeLabels.js`): three mismatches with the client's classification were fixed — Drug Store `Institutional Establishment` → `Commercial / NF`; Private Laboratory & Clinic `Institutional Establishment` → `Public Places`; Massage / Physical Therapy `Commercial / NF` → `Public Places`. Funeral Parlor, Burial Ground, Resort / Picnic Ground, Karaoke / Video Bar / CSW (Public Places), Sub-contractor (Industrial) and Boatman (Public Transport) already matched. Institutional Establishment (schools) now has no real type and shows the existing "No business type configured yet" placeholder; none was invented. Display-only: stored business types are unchanged. Open: the legacy alias "Barbershop / Salon" still displays as Commercial / NF although the seeder aliases it to Massage / Physical Therapy (now Public Places); left alone as it was not in the client's list.
- **Inspection frequencies** (`b966a9d`, migration `0036_set_client_inspection_frequencies`): keyed by business-type name, touches only `inspection_frequency`, skips missing names, idempotent, no-op reverse. Against production (public bootstrap, read-only, before deploy) it changes **8** rows: Restaurant / Food Establishment, Public Market Stall, Food Establishment `monthly`→`quarterly`; Sub-contractor, Boatman `annual`→`quarterly`; Resort / Picnic Ground, Massage / Physical Therapy `quarterly`→`annual`; Karaoke / Video Bar / CSW `monthly`→`annual`. Drug Store and Commercial Non Food ("Depends") are untouched. `seed_data.py` was aligned too, because the optional seeder (`USE_SEED_DATA`) `update_or_create`s frequencies and would otherwise undo the migration.
- **Sanitary permit number at registration** (`7865f89`): the Register form has an optional "Sanitary Permit (optional)" section — Sanitary Permit Number, Date Issued, Expiry Date (defaults to Date Issued + 1 year, stays editable; 29 Feb → 28 Feb). With a number: `has_permit=true`, `permit_status=active` (or `renewal_due` when the expiry has already passed, matching the permit importer), `compliance_status=not_yet_inspected`. Without one the payload is exactly as before. A number requires a Date Issued; dates without a number, and an expiry on/before the issue date, are rejected in the form. The API (`SanitaryEstablishmentSerializer.validate_permit_number`) rejects a permit number already recorded on another establishment, case-insensitive and trimmed, with a 400; blanks may repeat.
- **Larger table text** (`1aab64f`): Establishment Records only, via `.establishment-records-table` — body 13.5px → 15px, headers 12px → 13px, status pill → 13px, a little more row padding. Staff Management reuses `.establishment-table-card` and is unchanged.
- **Verification (local only)**: backend `Ran 150 tests` / `OK`; frontend `217 passed, 217 total` (6 suites); `npm run build` → `Compiled successfully.`; `flutter test` 30/30; `flutter analyze` the same 4 pre-existing info issues.
- **Not verified / open**: not merged, not deployed; migration 0036 has not run on production; no browser or authenticated UI check (including the larger text at real screen widths). Permit-number uniqueness is enforced in the serializer, not by a database constraint, so two simultaneous saves could still race; the renewal release path and the permit importer also write `permit_number` without this check.

## "Not Yet Inspected" Compliance Status (merged to `main` and pushed as `2426b65`; deploy not verified)
Branched from `9a49d85`. Implements the proposal recorded in the earlier read-only investigation: an establishment nobody has inspected no longer claims Good Standing.

- **Backend** (`a314f7e`). Added `SANITARY_STATUS_NOT_YET_INSPECTED = "not_yet_inspected"` ("Not Yet Inspected") as the **first** choice and made it the `SanitaryEstablishment.compliance_status` default in place of `good_standing`.
  - Migration `0035_add_not_yet_inspected_compliance_status` contains **one** `AlterField` on `sanitaryestablishment.compliance_status`. It has **zero** `RunPython`/`RunSQL` operations, so it cannot touch row data; a `TransactionTestCase` migrates 0034 → 0035 with one row of every existing status and asserts the full `{pk: status}` map is byte-identical before and after, then that a row created afterwards picks up the new default.
  - A second `AlterField` that `makemigrations` initially wanted, widening `SanitaryInspection.status_after_inspection`, was **deliberately avoided**: a new `SANITARY_INSPECTION_RESULT_CHOICES` list excludes `not_yet_inspected`, because by the time an inspection is recorded the visit has happened and "not yet inspected" can never be its result. The inspection field's choices are therefore unchanged and need no migration.
  - It is **not** in `PERMIT_STATUS_BY_COMPLIANCE`, so it never maps to a permit status.
  - Aggregates: `get_establishment_status_counts` and `get_business_type_counts` gained their own `not_yet_inspected` bucket, surfaced as `not_yet_inspected` in the dashboard business-type rows. `build_sanitation_question_answers` now divides by `inspected_total = total - not_yet_inspected`, so a never-inspected establishment counts as neither compliant nor non-compliant — counting it either way would be wrong.
  - Tests: `NotYetInspectedStatusTests` (8) and `NotYetInspectedMigrationTests` (1). 5 failures and 1 error before the change.
- **Web** (`7132faa`). The `no_permit → good_standing` promotion in `openEditModal` is gone, so "Issue & Generate Permit Now" no longer invents a compliance finding; the stale `good_standing` in the blank form object is now `not_yet_inspected`, as is `NEW_ESTABLISHMENT_PERMIT_STATE`, so registration records no finding either. Added the label and filter option to Establishment Records, Report Analytics and the GIS map, a neutral slate GIS marker (`#64748b`), and neutral `not-yet-inspected` styles covering `.status-pill`, `.establishment-status`, `.inspection-status`, `.permit-status`, `.permit-compliance`, `.activity-status` and the Report Analytics standing banner. Labels elsewhere already come from the server's `compliance_status_label`, so those screens needed no change. Tests: 4 new, 4 red before the change.
  - **Beyond the listed scope, and flagged deliberately**: the "Has Permit?" toggle also forced a compliance status — `no` set `no_permit` and `yes` set `good_standing`. Both forcings were removed, because leaving them would have re-introduced exactly the fabrication the task removes and would have bypassed the `openEditModal` fix. Four characterization tests that documented the old forcing were updated.
- **Mobile** (`eb57a77`). `sanitationStatusLabel` names the new status and `sanitationStatusColor` returns the neutral `AppColors.muted` for it explicitly. Tests: 9, 1 red before the change.
  - **Already-distributed APKs do not crash.** `sanitationStatusLabel` ends `default: return value.isEmpty ? 'Pending' : value;` and `sanitationStatusColor` ends `default: return AppColors.muted;`, so an unknown status renders as the raw string in a neutral colour. In practice it reads correctly anyway, because `SanitationEstablishment.fromJson` prefers the server's label (`statusLabel: '${json['compliance_status_label'] ?? 'Upcoming'}'`), and the API sends `compliance_status_label` from `get_compliance_status_display()` — so an old APK shows "Not Yet Inspected". Only code paths that call `sanitationStatusLabel(complianceStatus)` directly would show snake_case until the APK is rebuilt.
- **Verification**: backend `Ran 135 tests` / `OK`; frontend `197 passed, 197 total` across 6 suites; `npm run build` `Compiled successfully.`; `flutter test` 30/30; `flutter analyze` the same 4 pre-existing info issues.
- **Not verified / still open**: not merged, not deployed, **a new APK build is still required**, and no manual or authenticated UI check was performed. **Existing production rows are untouched**: establishments that already hold `good_standing` with zero inspections still read Good Standing. Reclassifying them needs a separate data migration and separate client approval, since it cannot distinguish "never inspected" from "inspected before this system existed".

## Inspection Management — Phase 2a Follow-ups (merged to `main` as `9a49d85`)
Branched from `4e30bf6`.

- **The inspector always chooses the status** (`ab57d7d`, backend + web + mobile). Client decision: no auto-status, ever.
  - A new inspection now starts with **no** status selected, whether the checklist is empty or not, on both clients. Ticking or unticking a requirement records an observation and no longer sets the status — the auto-status blocks in the web `handleCheck` and the mobile `_toggleCheck` are gone, along with the mobile `_statusForChecks` helper. This also ends the old web/mobile divergence, where web set `violation` when nothing was ticked and mobile set `for_completion`.
  - Submit is blocked on both clients with "Select the status after inspection." until one is picked. A saved draft still restores its own saved status.
  - The yellow box now reads simply "Choose the inspection status based on your findings."
  - **Backend**: `SanitaryInspectionCreateSerializer.validate` now **requires** `status_after_inspection` on a final (`is_draft=False`) inspection and returns 400 with a clear message instead of letting the model default silently record `good_standing`. Drafts may still omit it. The rule lives in the serializer, so it covers the web and mobile endpoints and both create and finalize-a-draft. The mobile view's `data["status_after_inspection"] = ... or "good_standing"` line was removed.
  - **Old APKs keep working**: `submitSanitationInspection` declares `required String statusAfterInspection` and always sends `'status_after_inspection': statusAfterInspection` (`mobile/lib/services/api.dart:344`) together with `'is_draft': false`. Dart cannot omit a required named argument, so every already-distributed build sends the field. A test mirrors that exact payload.
  - Tests: 7 backend (4 red), 6 web (5 red), 4 mobile (4 red). Three older tests that asserted the removed auto-status behaviour were updated, since that behaviour was deliberately changed.
- **Helper text layout** (`fe16670`, CSS). `.inspection-warning` was `display: flex; align-items: center`, which made every text node and inline element its own flex item and split the sentence into columns. It is now a normal text block with vertical padding and a line height. It has exactly one usage, the inspection form.
  - **Table horizontal scrollbar: left as is, intentionally.** `.inspection-table-wrap` is `overflow-x: auto` and `.inspection-table-card table` is `min-width: 820px` — the standard responsive-table pattern that lets columns scroll on a narrow screen instead of squashing. The 820px is the exact sum of the six per-column minimums (180+160+130+130+120+100). At 1440px the content area is about 1440 − 280 sidebar − 44 padding ≈ 1116px, comfortably more than 820px, so this rule cannot produce a scrollbar at that width.
  - Worth noting: Phase 2a added a fourth action button, so the Actions cell's natural width is now roughly 4×31px + 3×8px + padding ≈ 176px against its declared 100px minimum, which raises the table's real minimum to about 896px — still under 1116px. **This was not reproduced in a browser** (no browser tooling in this environment), so if a scrollbar really does appear at 1440px the cause is elsewhere and needs a look with devtools.
- **Verification**: backend `Ran 126 tests` / `OK`; frontend `193 passed, 193 total` across 6 suites; `npm run build` `Compiled successfully.`; `flutter test` 22/22; `flutter analyze` the same 4 pre-existing info issues.
- **Not verified**: not merged, not deployed, **a new APK build is still required**, and no manual or authenticated UI check was performed.

## Inspection Management — Phase 2a (merged to `main` as `4e30bf6`)
Branched from `cfb8524`. Four items, each with its own commit and its own red-then-green tests. Mobile was not touched.

- **Real inspector list in Complaints** (`dacbdb2`, backend + web).
  - *Investigation*: `GET /api/sanitation/staff/` already exists and a sanitation-role user may call it (`@module_required("sanitation")`), but it was **not** safe to reuse here. It returns `SanitaryStaffSerializer` — id, username, first_name, last_name, full_name, **email**, is_active, date_joined, role, role_label — so a dropdown would carry staff email addresses it has no need for. It also filters on `profile__role=ROLE_SANITATION` only, excluding admin accounts, and does not exclude inactive users.
  - *New endpoint*: `GET /api/sanitation/inspectors/`, `@module_required("sanitation")`, returning only `{id, name}` for **active** users whose role is sanitation or admin, with `name` = full name else username. Backend tests: 7, covering the 200 case, the exact field set (asserting no email and no `date_joined` anywhere in the body), the username fallback, exclusion of inactive accounts, 403 for tourism/tourist/establishment, 401 for anonymous, and 405 for POST.
  - *Web*: the four invented names are gone. Options come from the endpoint; a name already stored on an older record stays selectable so history is not rewritten; an unset value shows a "Select inspector" placeholder; an empty list says "No inspector accounts available." The stored value is still a plain string — **no schema change**. Web tests: 6, all red before the change.
- **Working pagination** (`485f1b0`, web). 10 rows per page, prev/next disabled at the edges, "Showing N of M | Page X of Y", and any search or filter change resets to page 1. Paging is presentation only: the CSV export and the due/overdue alert counts still cover every filtered row. Tests: 4; 3 red before the change (the export test passed both before and after, pinning that behaviour).
- **Inspection history and read-only detail** (`013c954`, web).
  - *Investigation*: no backend change was needed. `GET /api/sanitation/inspections/` already returns **all** inspections with `checklist_items` prefetched, and the data context already holds them, so no filter parameter was required.
  - A History action per establishment lists every inspection for that establishment, newest first, with date, inspector, status, next due and a "Draft" label. Selecting one opens a read-only detail with all fields plus each checklist item marked Complied or Not complied. The detail renders no input, textarea, select, or save control at all. Tests: 7, all red before the change.
- **Completed inspections on the calendar** (`1891c4b`, web). Finalized inspections are now plotted on their `inspection_date` as a distinct "Inspected" event alongside the existing Upcoming Due and Overdue events; drafts are deliberately not plotted, since an unfinished draft is not a completed inspection. The dead `calendarStatusClass` helper and its eslint suppression were removed. Tests: 3; 1 red before the change.
- **Verification**: backend `Ran 119 tests` / `OK`; frontend `187 passed, 187 total` across 6 suites; `npm run build` `Compiled successfully.`; `flutter test` 18/18 and `flutter analyze` the same 4 pre-existing info issues — mobile is byte-identical to `main`.
- **Not verified**: not merged, not deployed, and the new screens were exercised only in tests — no manual or authenticated UI check was performed.

## Inspection Management — Phase 1 Data-Integrity Fixes (merged to `main` as `cfb8524`)
Branched from `0ff406b`. Five fixes, each with its own commit and its own red-then-green tests.

- **Drafts no longer change live records** (`353e922`, backend). `sync_establishment_after_inspection` returned early on `inspection.is_draft`, so saving a draft no longer rewrites the establishment's `compliance_status`, no longer maps a new `permit_status` (a draft marked Violation was suspending the permit), and no longer fires a violation notification. Finalizing the draft applies it exactly once. Gated at the single shared choke point, so it covers the web and mobile endpoints and both create and update. Tests: `InspectionDraftIsolationTests` (5); 4 failed before the fix.
- **No same-day overwrite** (`db24dd4`, web). `isDraftOrRecent` treated any inspection dated today as editable, so a second visit that day `PUT` over the first and its checklist was deleted and recreated. Only an actual unfinished draft is reopened now; a finalized inspection is never overwritten and a second visit creates a new record. Tests: 3; 1 failed before the fix.
- **Real inspector attribution** (`8e3830c`, web). The hard-coded `"Insp. Juan Dela Cruz"` / `"Insp. Maria Santos"` defaults were removed from `InspectionManagement.js` and `ComplaintsManagement.js`, along with the fabricated `"Insp. J. Cruz"` schedule default and the `"Insp. Juan Dela Cruz"` fallback printed on complaint reports. Inspections are attributed to the signed-in account: `display_name`, else first+last name, else username, never an invented person. The unverifiable "Logged-in Active Account • Verified Inspector" caption was replaced with "Signed-in account", since nothing in the system verifies inspector status. Tests: 5; all 5 failed before the fix.
- **Checklists start unchecked** (`24d8b99`, web). New inspections no longer pre-tick items based on the establishment's previous `compliance_status` (which auto-ticked everything except the last item for a `for_completion` establishment). A saved draft still restores its own ticks. The stale warning text now describes the rule the form actually applies. Tests: 4; 3 failed before the fix.
- **One next-due-date rule everywhere** (`dde5ef6`, backend + web + mobile). The rule is annual → +1 year, quarterly → +3 months, monthly → +1 month, and an **unrecognised frequency yields no suggestion** rather than a silent +1 month. The only frequency values that exist in code or production are `monthly`, `quarterly` and `annual` (production: 7 / 3 / 6 across 16 types) — there is no `annually` spelling anywhere. Mobile previously had no annual branch at all, so annual establishments got a one-month due date from the phone. Both clients also overflowed at month ends (mobile turned 31 Jan into **3 March**); all three layers now clamp to the last real day. The backend fills in `next_due_date` from `business_type.inspection_frequency` when a **final** inspection omits it; an explicit client value always wins and drafts are left alone. Tests: 7 backend (4 red), 6 web (6 red), 5 mobile (3 red).
- **Verification**: backend `Ran 112 tests` / `OK`; frontend `167 passed, 167 total` across 5 suites; `npm run build` `Compiled successfully.`; `flutter test` 18/18; `flutter analyze` the same 4 pre-existing info issues, none new.
- **Not verified**: not merged, not deployed, **a new APK build is still required**, and no real-device or emulator end-to-end test was performed.

## Pending Tasks & Next Testing Steps
- **Inspection Management Phase 2b — photo documentation (OPEN, blocked)**:
  - The web upload box in `InspectionManagement.js` is still a plain `div` with no file input, and the form still sends `photo_documentation: ""`. The server-side path exists but only on the mobile endpoint (`save_image_file(upload, "inspections")`), and the Flutter client never sends a photo, so nothing can attach one today.
  - **Blocked on upload validation**: before the web can accept uploads, `validate_image_file` needs magic-byte (content-sniffing) validation rather than trusting the declared extension or content type. Wiring an upload path to the web endpoint without that would widen the attack surface, so this was deliberately deferred out of Phase 2a.
  - Still missing regardless: photo captions (no field exists), and a delete action in the inspection UI despite a working `DELETE` endpoint.
- **Inspection Management Phase 3 (manuscript gaps)**:
  - No inspection result field (Passed / Failed / For Re-inspection), no recommendation field, and no distinct reinspection date.
  - `inspector_name` is free text with no foreign key to a user account.
  - No photo captions; no link between a violation/complaint and the inspection that raised it.
  - `SanitaryInspection.establishment` and `SanitaryInspectionChecklistItem.inspection` are `on_delete=CASCADE`, so deleting an establishment erases its entire inspection history. Consider `PROTECT`.
  - `assigned_inspector` on a complaint and `inspector_name` on an inspection are both still plain strings. Phase 2a made the Complaints picker offer real staff accounts, but the stored value is a name, not a foreign key, so it does not survive a rename and cannot be joined on.
- **Production Inspection Frequencies** — set per the client's form by migration `0036` on branch `sanitation/establishment-client-fixes`; see that section above. Still pending: merge, deploy, and a read-only check of the 16 production types afterwards.
- **Authenticated Production Verification of Establishment Records Phase 1 (`703533a`)**:
  - Deployed-build verification is complete, but authenticated production UI behavior (registration as No Permit, non-destructive edit, explicit permit issuance, Business Type filters, location wording) has not yet been manually verified with a staff account. Any such check that creates or edits records must be planned so it does not leave test data in production.
- **Deploy and Verify Ambulant Food Vendor (migration `0034`)**:
  - After `0034` is pushed and deployed, confirm read-only that production has exactly one Ambulant Food Vendor `SanitaryBusinessType` (monthly, zero requirements) and that it is selectable in the Register New Establishment dropdown.
- **Ambulant Food Vendor Requirements & Legal Basis**:
  - Obtain the official standard requirements, any additional requirements, and the legal basis from the Sanitation Section before adding requirements to this type. Do not infer them from other types or from SP/Large coverage.
- **Mobile Zero-Requirement Fallback** — fixed on branch `sanitation/mobile-zero-requirements`; see "Completed on Branch (not merged, not deployed)" below. Still pending: merge to `main`, a new APK build, and real-device end-to-end testing.
- **Establishment Portal Fabricated Requirements** — fixed on branch `sanitation/portal-real-requirements`; see "Completed on Branch (not merged, not deployed)" below. Still pending: merge to `main`, a new APK build, and real-device end-to-end testing.
- **Production Credentials & Demo Shortcut Cleanup**:
  - Remove plain-text demo credential disclosures and one-click quick access chips from `mobile/lib/screens/sanitation_screens.dart` (lines 5160-5185 and 5244) and `frontend/src/sanitation/pages/EstablishmentRecords.js` (line 894).
  - Update default staff passwords via Django `/admin/` or environment overrides prior to real-world LGU usage.
- **Supabase Production Connection String Verification**:
  - Verify that the production host uses the transaction pooler or session pooler URL variant with `sslmode=require` and connection pooling (`CONN_MAX_AGE=600`).
- **Management Command Hardcoded Path Cleanup**:
  - Update `backend/api/management/commands/import_sanitary_permits.py` to make file arguments mandatory or fall back to repository-relative fixtures instead of user-specific local paths (`C:\Users\This PC\Downloads\...`).
- **Mobile Production Release Signing**:
  - Configure release keystore signing in `mobile/android/app/build.gradle.kts` for final Android APK/AAB distribution.
- **End-to-End Field Device Validation**:
  - Test the mobile build on physical Android devices to verify hardware camera QR scanning (`mobile_scanner`), GPS geolocation accuracy (`geolocator`), and native OS file sharing (`share_plus`).
- **Frontend Automated Test Setup**:
  - Add basic component smoke tests and routing validation in `frontend/src/` to prevent regressions during future web updates.


