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

- **Backend Role-Isolation: Public Tourist Privilege Escalation Fix**
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

## Pending Tasks & Next Testing Steps
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


