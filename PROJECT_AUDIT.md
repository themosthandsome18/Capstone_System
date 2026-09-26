# PROJECT AUDIT: Mauban LGU Tourism & Sanitary Compliance Portal

Comprehensive standalone codebase audit generated on September 18, 2026.

---

## 1. Project Overview

- **Core Description**:
  - An integrated local government e-governance and operational information system built for the Local Government Unit (LGU) of the **Municipality of Mauban, Quezon Province, Philippines**.
  - Dual-core system addressing two municipal departments:
    1. **Municipal Tourism Office**: Visitor registration, digital tourist entry passes (with scannable QR codes), resort/destination directory, front-desk arrival verification, Excel booking imports, visitor demographics reporting, ratings/feedback moderation, and interactive GIS tourist maps.
    2. **Municipal Health Office / Sanitary Section**: Commercial establishment sanitary permit issuance and renewal monitoring, digital field inspection checklists, citizen sanitation complaints with GPS/photo documentation, household sanitation surveys (evaluating toilet types, water service levels, waste disposal), 40-barangay GIS spatial analysis, automated permit/inspection due-date scanning, and public health advisories.
- **Client Applications**:
  - **Backend REST API (`backend/`)**: Django / Django REST Framework API powering data persistence, business logic, background evaluation, role gating, and automated triggers.
  - **Administrative Web Portal (`frontend/`)**: Single-page desktop web application (React) featuring dedicated modules for Tourism Office staff and Sanitary Section staff, interactive dashboards, GIS maps, data tables, and CSV exports.
  - **Mobile Application (`mobile/`)**: Cross-platform Flutter application providing public tourist guides, digital entry pass sharing, front-desk QR ticket scanner, citizen sanitation reporting, public permit verification, and field inspector survey/inspection tools.
- **Target Users**:
  - **LGU System Administrators**: User provisioning, staff access control, audit log inspection, system-wide settings, data imports.
  - **Tourism Office Staff**: Visitor monitoring, online booking management, resort administration, feedback response, analytics generation.
  - **Resort Front-Desk / Tourism Check-in Staff**: Field personnel scanning tourist QR codes at entry ports and accommodations to record arrivals in real time.
  - **Sanitary Inspectors / Health Officers**: Field personnel conducting scheduled business inspections, evaluating sanitation checklists, investigating complaints, and surveying household sanitation facilities.
  - **Commercial Establishment / Resort Owners**: Business proprietors tracking sanitary permit statuses, compliance deadlines, inspection history, and renewal requirements.
  - **Tourists & General Public**: Visitors registering trips to Mauban, discovering resorts, checking in via QR passes, submitting reviews, filing community sanitation concerns, and viewing municipal advisories.

---

## 2. Tech Stack

### Backend
- **Language & Framework**: Python 3.x, **Django 6.0.4**, **Django REST Framework (DRF) 3.17.1**
- **WSGI / Production Server**: Gunicorn `>=23.0.0`, WhiteNoise `>=6.8.0` (static asset compression and delivery)
- **Database Connector**: `psycopg2-binary 2.9.12`, `dj-database-url >=2.3.0`
- **Environment & Configuration**: `python-decouple 3.8`
- **File & Spreadsheet Processing**: `openpyxl 3.1.5`, `et_xmlfile 2.0.0`
- **Cloud Storage**: `django-storages >=1.14.0`, `boto3 >=1.35.0` (Supabase S3-compatible object storage)
- **Utilities**: `asgiref 3.11.1`, `sqlparse 0.5.5`, `tzdata 2026.2`

### Frontend (Web Portal)
- **Framework & Runtime**: **React 19.2.4**, `react-dom 19.2.4`, Create React App (`react-scripts 5.0.1`)
- **Routing**: `react-router-dom 7.14.0`
- **Styling**: Tailwind CSS 3.x (`tailwindcss`, `postcss 8.4.49`, `autoprefixer 10.4.20`), custom scoped CSS files
- **Charts & Data Visualization**: `chart.js 4.5.1`, `react-chartjs-2 5.3.1`
- **GIS Mapping**: `leaflet 1.9.4`, `react-leaflet 5.0.0`, `leaflet.heat 0.2.0`
- **QR Code Generation**: `qrcode.react 4.2.0`
- **Icon Library**: `react-icons 5.6.0`
- **Performance**: `web-vitals 2.1.4`

### Mobile Application
- **Framework & SDK**: **Flutter 3.x**, **Dart SDK ^3.12.0**
- **Networking & API**: `http ^1.2.2`, `http_parser ^4.1.0`
- **GIS Mapping**: `flutter_map ^8.3.0`, `latlong2 ^0.9.1`
- **Device Hardware & Peripherals**:
  - `mobile_scanner ^7.2.0` (camera-based hardware QR code scanner)
  - `geolocator ^14.0.2` (GPS hardware location capture)
  - `image_picker ^1.2.2` (camera capture & device photo library selector)
- **Storage & State**: `shared_preferences ^2.5.5` (persistent local tokens and session metadata)
- **Export & Sharing**: `share_plus ^10.1.4`, `path_provider ^2.1.5` (native OS file share sheets for CSV reports and PNG QR tickets)
- **Typography & UI**: `google_fonts ^8.1.0`, `cupertino_icons ^1.0.8`, `qr_flutter ^4.1.0`

### Databases & Storage
- **Primary Database**: **PostgreSQL** hosted on **Supabase** (direct or pooled connection via `aws-1-ap-southeast-2.pooler.supabase.com:5432` with SSL enabled, `CONN_MAX_AGE=600`).
- **Development Fallback Database**: Local SQLite (`db.sqlite3` via `DB_ENGINE=sqlite`).
- **Cache Layer**: Django `LocMemCache` (15-minute TTL on master reference tables and active barangays).
- **Media Asset Storage**: Supabase S3-compatible Storage bucket (`media`) with fallback to local `FileSystemStorage` (`backend/media/`).

### Authentication Method
- **Token Authentication**: Django REST Framework `rest_framework.authtoken.models.Token`. Returned on `/api/auth/login/` and transmitted via HTTP header `Authorization: Token <token_key>`.
- **Session Authentication**: DRF `SessionAuthentication` enabled for Django browsable API and admin interface.
- **Webhook Authentication**: Shared secret key (`CRON_SECRET_KEY`) validated via timing-safe `hmac.compare_digest` in `X-Cron-Key` header or `Authorization: Bearer <key>`.

### Third-Party APIs & Services
| Service | Integration Purpose | Implementation Location |
| :--- | :--- | :--- |
| **Supabase PostgreSQL** | Cloud-hosted relational database | `backend/backend/settings.py` via `dj-database-url` / `psycopg2` |
| **Supabase S3 Storage** | Object storage for resort images, complaints, feedback, and inspection photos | `backend/backend/settings.py`, `backend/api/services/upload.py` via `boto3` / `storages` |
| **OpenStreetMap (OSM)** | Public tile server for tourism and sanitation GIS maps | `frontend/src/tourism/pages/GISMap.js`, `frontend/src/sanitation/pages/SanitaryGISMap.js`, `mobile/lib/screens/tourism_screens.dart` |
| **Render PaaS** | Cloud hosting environment | `backend/build.sh`, `mobile/lib/utils/helpers.dart` (default URL) |
| **External Cron / Webhook** | Automated daily permit/inspection due-date evaluation | `POST /api/notifications/evaluate-due/` via `backend/api/views/notifications.py` |

### Key Packages Actually Imported & In Use
- **Backend**: `django`, `rest_framework`, `rest_framework.authtoken`, `corsheaders`, `decouple`, `dj_database_url`, `whitenoise`, `openpyxl`, `psycopg2`, `storages`, `boto3`.
- **Frontend**: `react`, `react-dom`, `react-router-dom`, `react-icons`, `leaflet`, `react-leaflet`, `leaflet.heat`, `chart.js`, `react-chartjs-2`, `qrcode.react`.
- **Mobile**: `flutter`, `http`, `flutter_map`, `latlong2`, `mobile_scanner`, `image_picker`, `geolocator`, `shared_preferences`, `qr_flutter`, `share_plus`, `path_provider`, `google_fonts`, `http_parser`.

---

## 3. Project Structure

```text
Capstone_System/
├── PROGRESS.md                    # Historical engineering changelog & testing status
├── PROJECT_AUDIT.md               # This comprehensive codebase audit
├── backend/                       # Django backend application
│   ├── manage.py                  # Django CLI entrypoint
│   ├── requirements.txt           # Python package dependencies
│   ├── build.sh                   # Deployment script (collectstatic + migrate)
│   ├── .env                       # Local environment variables
│   ├── backend/                   # Django core project configuration
│   │   ├── settings.py            # Main application settings, DB config, storages
│   │   ├── urls.py                # Root URL dispatcher
│   │   ├── wsgi.py                # WSGI entrypoint
│   │   └── asgi.py                # ASGI entrypoint
│   ├── api/                       # Main API application package
│   │   ├── models.py              # ORM data models (18 models)
│   │   ├── serializers.py         # DRF serializers & validation logic
│   │   ├── urls.py                # API routing table (/api/...)
│   │   ├── auth_views.py          # Authentication & registration endpoints
│   │   ├── permissions.py         # Role-based access control decorators
│   │   ├── seeders.py             # Reference data & seed initializers
│   │   ├── seed_data.py           # Static datasets (barangays, requirements, resorts)
│   │   ├── tests.py               # Comprehensive unit & integration test suite (39 tests)
│   │   ├── views/                 # Modular API view controllers
│   │   │   ├── shared.py          # Health, activity logs, reference data
│   │   │   ├── tourism.py         # Tourism web endpoints (bookings, resorts, feedback)
│   │   │   ├── sanitation.py      # Sanitation web endpoints (establishments, inspections)
│   │   │   ├── mobile.py          # Mobile app endpoints (check-in, complaints, surveys)
│   │   │   └── notifications.py   # Staff & public notifications, cron webhook
│   │   ├── services/              # Business logic & domain computation layer
│   │   │   ├── activity.py        # Audit trail logger
│   │   │   ├── household.py       # Household statistics & scoring
│   │   │   ├── notifications.py   # Notification dispatch & trigger logic
│   │   │   ├── online_booking.py  # Excel parsing & resolution for bookings
│   │   │   ├── sanitation.py      # Sanitation KPI calculations & renewal pipelines
│   │   │   ├── tourism.py         # Tourism aggregations & reporting metrics
│   │   │   └── upload.py          # Image validation & S3 upload helpers
│   │   └── management/commands/   # Custom administrative Django commands
│   │       ├── create_default_users.py     # Provision standard demo user accounts
│   │       ├── evaluate_due_notifications.py# Scan expiring permits and inspections
│   │       ├── import_online_bookings.py   # CLI import for booking spreadsheets
│   │       ├── import_sanitary_permits.py  # CLI import for sanitary permit masterlists
│   │       ├── import_tourism_excel.py     # CLI import for historical arrivals
│   │       └── purge_demo_households.py    # Database cleanup utility
│   ├── mock_scripts/              # Legacy one-off utility scripts for manual data seeding
│   ├── data_backups/              # Gitignored persistent database snapshot JSON dumps
│   └── media/                     # Local fallback upload directory
├── frontend/                      # React SPA Web Portal
│   ├── package.json               # Node.js dependencies and run scripts
│   ├── tailwind.config.js         # Tailwind configuration
│   ├── postcss.config.js          # PostCSS processor configuration
│   ├── public/                    # Static assets, HTML shell, icons
│   └── src/                       # Application source code
│       ├── App.js                 # App root with providers, routing, role gating
│       ├── index.js               # React DOM render entrypoint
│       ├── auth/                  # Authentication & session components
│       │   ├── AuthContext.js     # React auth context provider & token restore
│       │   ├── LoginPage.js       # Split-pane credential login interface
│       │   ├── ModuleSelectionPage.js # Admin switcher between Tourism and Sanitation
│       │   ├── ProtectedRoute.js  # Role-gated route wrapper
│       │   └── authApi.js         # Auth HTTP client requests
│       ├── shared/                # Shared utilities & components
│       │   ├── apiClient.js       # Base Fetch API client with timeout and auth headers
│       │   ├── ErrorBoundary.js   # Component-level React error boundary
│       │   ├── csvExport.js       # Browser-side CSV file download utility
│       │   ├── LocationPicker.js  # Leaflet pin-drop coordinate selector
│       │   ├── PageLoader.js      # Minimalist loading spinner
│       │   └── pages/             # Shared pages (ActivityLogsPage)
│       ├── tourism/               # Tourism Office Web Module
│       │   ├── tourismRoutes.js   # Tourism routing table
│       │   ├── Tourism_index.css  # Tourism portal design system & styles
│       │   ├── context/           # TourismDataContext (centralized data caching)
│       │   ├── components/layout/ # AppShell, Sidebar, Header, NotificationBell
│       │   └── pages/             # Tourism pages
│       │       ├── Dashboard.js            # KPI metrics, monthly arrival charts
│       │       ├── BookingManagement.js    # Visitor records, status actions, import
│       │       ├── ArrivalMonitoring.js    # Live arrivals monitoring table
│       │       ├── DestinationManagement.js# Resort CRUD, photo gallery, ratings
│       │       ├── FeedbackMonitoring.js   # Tourist reviews & replies
│       │       ├── AnalyticsAndReport.js   # Statistical breakdowns, CSV exports
│       │       └── GISMap.js               # Leaflet map with resort markers & heatmap
│       └── sanitation/            # Sanitary Section Web Module
│           ├── sanitationRoutes.js# Sanitation routing table
│           ├── Sanitation_index.css# Sanitation portal design system & styles
│           ├── context/           # SanitationDataContext (centralized data caching)
│           ├── components/layout/ # SanitationAppShell, SanitationSidebar
│           └── pages/             # Sanitation pages
│               ├── SanitationDashboard.js     # Health compliance KPIs, alerts
│               ├── TypesAndRequirements.js    # Business classifications & rules
│               ├── EstablishmentRecords.js    # Commercial establishment directory
│               ├── InspectionManagement.js    # Inspection checklists, findings
│               ├── ComplaintsManagement.js    # Citizen concerns & dispatch schedules
│               ├── PermitMonitoring.js        # Active/expiring permit monitoring
│               ├── PermitRenewal.js           # 8-stage renewal tracking pipeline
│               ├── SubmissionTracking.js      # Document verification tracking
│               ├── SanitaryReportAnalytics.js # Compliance analytics & graphs
│               ├── HouseholdRecords.js        # Barangay household sanitary surveys
│               ├── HouseholdReportAnalytics.js# Water & toilet facility demographics
│               ├── SanitaryGISMap.js          # Spatial map of establishments & issues
│               ├── StaffManagement.js         # Sanitary inspector account management
│               └── VerifyPermit.js            # Public web permit lookup verification
└── mobile/                        # Cross-Platform Flutter Mobile Application
    ├── pubspec.yaml               # Flutter package configuration & assets
    ├── lib/                       # Mobile application source
    │   ├── main.dart              # Main entrypoint (Tourism default or auto-switch)
    │   ├── main_sanitation.dart   # Dedicated Sanitation entrypoint
    │   ├── constants/colors.dart  # AppColors color palette
    │   ├── models/models.dart     # Dart domain models with JSON deserializers
    │   ├── services/api.dart      # HTTP API client for all mobile endpoints
    │   ├── utils/                 # Mobile utilities
    │   │   ├── helpers.dart       # General formatters, parsing, storage keys
    │   │   ├── export_helpers.dart# RFC 4180 CSV builder, file saver, share handler
    │   │   ├── web_branding.dart  # Browser tab title/favicon bridge for web preview
    │   │   └── web_download.dart  # Browser blob download helper
    │   ├── widgets/               # UI components
    │   │   ├── widgets.dart       # Common buttons, cards, headers, digital pass
    │   │   ├── striped_polygon_layer.dart # Custom OSM polygon painter
    │   │   └── tourism_loading_screen.dart# Custom animated tourism loading view
    │   └── screens/               # Mobile views
    │       ├── common_screens.dart           # Onboarding, notification page, profile
    │       ├── tourism_screens.dart          # Public tourist guide, registration form
    │       ├── tourist_qr_checkin_screens.dart# Staff QR scanner, check-in, history
    │       ├── sanitation_screens.dart       # Citizen report form, inspector tools
    │       └── qr_scanner_screen.dart        # Hardware camera barcode reader screen
    └── test/widget_test.dart      # Flutter smoke test
```

---

## 4. Data Models / Schema

All models are defined in [backend/api/models.py](file:///c:/Users/THINKPAD%20T480S/Desktop/Capstone_Project/Capstone_System/backend/api/models.py).

### Core & Reference Tables
1. **`UserProfile`**
   - Extends Django's `auth.User` via a One-to-One relationship (`related_name="profile"`).
   - Key fields: `user` (OneToOneField), `role` (CharField: `admin`, `tourism`, `sanitation`, `establishment`).
2. **`ActivityLog`**
   - System-wide audit log for data mutations.
   - Key fields: `user` (FK User, nullable), `module` (`tourism`, `sanitation`), `action` (`create`, `update`, `delete`), `record_type`, `record_id`, `record_label`, `created_at`.
3. **`Barangay`**
   - The 40 administrative barangays of Mauban.
   - Key fields: `name` (unique), `municipality` (default: "Mauban"), `province` (default: "Quezon"), `display_order`, `is_active`.
4. **`NamedReference` (Abstract Base Model)**
   - Base model with `id` (PositiveIntegerField PK) and `name` (CharField).
   - Concrete derived models:
     - `Country`: `type` (`local`, `foreign`).
     - `Region`: `code`.
     - `Province`: `region` (FK `Region`, `on_delete=PROTECT`), `code`.
     - `Itinerary`: standard travel itinerary packages.
     - `TravelMode`: modes of travel (e.g., Private, Commute).
     - `BoatType`: passenger boat categories.
     - `VisitPurpose`: purpose categories (canonical: Leisure, Vacation, Business, etc.).

### Tourism Module Models
5. **`Resort`**
   - Tourism accommodations and destinations.
   - Key fields: `resort_id` (PK), `resort_name`, `with_mayors_permit` (bool), `type`, `location`, `short_description`, `tourism_rating` (float), `access`, `itinerary_ids` (JSONField), `latitude`, `longitude`, `images` (JSONField list of image URLs), `monthly_arrivals` (int), `user` (FK User, nullable).
6. **`FeedbackEntry`**
   - Tourist reviews and satisfaction scores.
   - Key fields: `destination` (FK `Resort`, `on_delete=CASCADE`), `reviewer`, `rating` (1-5), `status` (`positive`, `neutral`, `negative`), `date`, `title`, `message`, `reply` (staff response), `photos` (JSONField).
   - *Signal Trigger*: `post_save` and `post_delete` signals automatically recalculate the parent `Resort.tourism_rating` as the aggregate average.
7. **`TouristStat`**
   - Aggregated monthly tourism metrics cache (`total_arrivals`, `monthly_visits`, `top_destinations`, `satisfaction`).
8. **`TouristRecord`**
   - Primary visitor registration and arrival record.
   - Key fields: `survey_id` (PK, format: `SURV-YYYY-XXXXX`), `submitted_at`, `email`, `consent_confirmed`, `first_name`, `last_name`, `full_name`, `contact_number`, `country_of_origin`, `arrival_date`, `status` (`pending`, `arrived`, `no_show`), `boat_capacity_fare`, `parking_space`, `created_at`, `updated_at`.
   - Demographic count fields: `total_visitors`, `filipino_count`, `foreigner_count`, `maubanin_count`, `total_male`, `total_female`, `special_group_count`, `age_0_7`, `age_8_59`, `age_60_above`.
   - Foreign Keys (all `on_delete=PROTECT`): `country`, `region`, `province`, `itinerary`, `resort`, `travel_mode`, `boat_type`, `visit_purpose`.
   - *Validation*: `clean()` strictly enforces:
     - `total_visitors == foreigner_count + filipino_count`
     - `maubanin_count <= filipino_count`
     - `total_visitors == total_male + total_female`
     - `total_visitors == age_0_7 + age_8_59 + age_60_above`
     - `special_group_count <= total_visitors`
9. **`ResortMonthlyArrival`**
   - Historical monthly tourist arrival counts by destination.
   - Key fields: `resort` (FK `Resort`), `year`, `month`, `total_arrivals`. Unique together on (`resort`, `year`, `month`).

### Sanitation Module Models
10. **`SanitaryBusinessType`**
    - Commercial business categories (e.g., Food Establishment, Water Refilling Station).
    - Key fields: `name` (unique), `inspection_frequency` (`monthly`, `quarterly`, `annual`), `description`.
11. **`SanitaryRequirement`**
    - Mandatory compliance rules per business type.
    - Key fields: `business_type` (FK `SanitaryBusinessType`), `permit_size` (`sp`, `large`), `requirement_name`, `is_required`. Unique together on (`business_type`, `permit_size`, `requirement_name`).
12. **`SanitaryEstablishment`**
    - Physical business establishments monitored by the Health Office.
    - Key fields: `business_name`, `owner_name`, `business_type` (FK `SanitaryBusinessType`, `on_delete=PROTECT`), `permit_size` (`sp`, `large`), `barangay`, `address`, `contact_number`, `user` (FK User, nullable), `has_permit` (bool), `permit_number`, `permit_issued_date`, `permit_expiry_date`, `compliance_status` (`good_standing`, `upcoming`, `for_completion`, `violation`, `no_permit`), `permit_status` (`active`, `renewal_due`, `conditional`, `suspended`, `no_permit`), `latitude`, `longitude`, `remarks`.
    - *Auto Coordinates*: Automatically applies `resolve_barangay_coordinates()` if lat/long are missing.
13. **`SanitaryPermitRenewal`**
    - Multi-stage permit renewal application workflow.
    - Key fields: `renewal_id` (unique, format: `REN-YYYY-XXXXX`), `establishment` (FK `SanitaryEstablishment`, `on_delete=CASCADE`), `permit_number`, `permit_type`, `expiration_date`, `stage` (`notice_sent`, `application_filed`, `requirements_review`, `inspection_scheduled`, `payment_pending`, `approved`, `released`, `lapsed`), `progress` (int 0-100), `renewal_fee`, `payment_status` (`paid`, `unpaid`, `partial`), `submitted_requirements` (JSONField), `inspection_status`, `photo_documentation`, `remarks`, `released_at`.
14. **`SanitaryComplaint`**
    - Citizen-submitted community sanitary grievances.
    - Key fields: `complaint_id` (unique, format: `COMP-YYYY-XXXXX`), `establishment` (FK `SanitaryEstablishment`, nullable, `on_delete=SET_NULL`), `complainant_name`, `contact_number`, `category`, `barangay`, `reported_date`, `status` (`pending`, `investigating`, `resolved`, `rejected`), `priority` (`low`, `medium`, `high`), `description`, `photo_documentation` (URLs), `latitude`, `longitude`, `assigned_inspector`, `inspection_scheduled_date`, `inspection_scheduled_time`, `inspection_schedule_note`, `inspection_notify_reporter` (bool), `action_taken`, `resolved_date`.
15. **`SanitaryInspection`**
    - Scheduled or ad-hoc physical establishment inspection log.
    - Key fields: `establishment` (FK `SanitaryEstablishment`, `on_delete=CASCADE`), `inspector_name`, `inspection_date`, `next_due_date`, `findings`, `remarks`, `status_after_inspection` (`good_standing`, `upcoming`, `for_completion`, `violation`, `no_permit`), `photo_documentation`, `is_draft` (bool).
16. **`SanitaryInspectionChecklistItem`**
    - Specific checklist items evaluated during an inspection.
    - Key fields: `inspection` (FK `SanitaryInspection`, `on_delete=CASCADE`, `related_name="checklist_items"`), `requirement_name`, `is_complied` (bool), `notes`.
17. **`HouseholdSanitationRecord`**
    - Residential sanitary survey records across barangays.
    - Key fields: `household_code` (unique, format: `HH-BRGY-XXXXX`), `household_head`, `barangay`, `address`, `male_count`, `female_count`, `toilet_type` (`water_sealed`, `pour_flush`, `pit_latrine`, `none`), `water_level` (`level_1`, `level_2`, `level_3`), `water_source`, `waste_disposal` (`collected`, `composted`, `burned`, `dumped`), `status` (`good_standing`, `for_completion`, `violation`), `latitude`, `longitude`, `remarks`, `last_survey_date`.
    - *Auto Status Scoring*: Evaluates toilet score (0-3) + water score (0-3) + waste score (0-3). If toilet is `none`, water is `none`, or waste is `dumped`, status is forced to `violation`. 7-9 points = `good_standing`, 4-6 points = `for_completion`, <4 points = `violation`.

### Notification Module Models
18. **`Notification`**
    - Internal staff alerts and public advisories.
    - Key fields: `title`, `message`, `notification_type` (`permit_due`, `inspection_due`, `violation_alert`, `public_advisory`, `system`), `severity` (`info`, `warning`, `critical`), `module` (`sanitation`, `tourism`, `general`), `audience_type` (`user`, `role`, `public`), `recipient_user` (FK User, nullable, `on_delete=CASCADE`), `target_role` (`admin`, `tourism`, `sanitation`, `establishment`), `related_model`, `related_object_id`, `related_due_date`, `action_url`, `is_read` (bool), `read_at`, `is_active` (bool), `expires_at`, `created_at`.

---

## 5. User Roles & Auth Flow

### Defined Roles & Permission Matrix
Roles are defined in `UserProfile.role`:

| Role Code | Display Name | Permissions & Accessible Areas |
| :--- | :--- | :--- |
| **`admin`** | System Administrator | Unrestricted access across all Web modules (Tourism + Sanitation), Module Selection switcher (`/module-selection`), User & Inspector Management, Excel data imports, system activity audit logs, record deletion. |
| **`tourism`** | Tourism Office Staff | Web Tourism Portal (`/`), Booking Management, Arrival Monitoring, Destination Management, Feedback Moderation, Tourism Reports, Tourism GIS Map. Mobile: Staff QR Scanner and Check-In. |
| **`sanitation`** | Sanitary Section / Inspector | Web Sanitation Portal (`/sanitation`), Establishments, Inspections, Complaints, Permit Renewals, Household Records, Sanitation Reports, Sanitation GIS Map. Mobile: Field Inspections and Household Surveys. |
| **`establishment`** | Establishment Owner | Mobile Establishment Portal: Scannable permit QR, renewal notice banner, compliance checklist progress, inspection timeline history. |
| **`tourist`** | Registered Tourist | Mobile Tourism Guide, Digital Travel Pass Registration, Public Feedback. Strictly isolated from all staff administrative modules. |
| *(Unauthenticated)* | Tourist / Citizen / Guest | Mobile Tourism Guide, Digital Travel Pass Registration, Public Feedback, Public Sanitation Reporting, Report Status Tracking, Public Permit Verification, Public Advisories. |

### Authentication & Login Flow
1. **User Login (`POST /api/auth/login/`)**:
   - Accepts `username` and `password`.
   - Executes Django `authenticate()`.
   - Includes fallback retry for connection pooler timeouts (`OperationalError`).
   - Supports alias fallback between `sanitary_admin` and `sanitation_admin`.
   - Returns authentication token (`Token.key`) and serialized profile:
     ```json
     {
       "user": {
         "id": 1,
         "username": "tourism_admin",
         "role": "tourism",
         "is_staff": true,
         "is_superuser": false
       },
       "token": "4e7a8f90...",
       "establishment": null,
       "resort": null
     }
     ```
   - If user is linked to an establishment or resort, the corresponding metadata is included in the login payload.
2. **Registration Endpoints**:
   - **`POST /api/auth/register/`**: Registers tourist accounts from mobile; assigns `role="tourist"` (previously assigned staff `role="tourism"`, resolved in commit `60fdee3206d6218674ff65c9bb517b533095381b`).
   - **`POST /api/auth/register-establishment/`**: Registers business accounts; assigns `role="establishment"`. Automatically links the new user to any existing `SanitaryEstablishment` matching `permit_number` or `business_name`.
3. **Session Persistence**:
   - **Web**: Token stored in `localStorage` under `capstone_auth_token`. Restored on page reload via `GET /api/auth/me/`.
   - **Mobile**: Token stored in `SharedPreferences` under `staff_auth_token`, role in `staff_auth_role`, username in `staff_auth_username`.
4. **Post-Login Routing**:
   - Handled in `AuthContext.js` via `getDefaultRouteForRole()`:
     - `admin` $\rightarrow$ `/module-selection`
     - `sanitation` $\rightarrow$ `/sanitation`
     - `tourism` $\rightarrow$ `/` (Tourism Dashboard)
5. **Route Protection & Gating**:
   - **Web**: Handled by `ProtectedRoute.js`. Compares authenticated role against `allowedRoles`. Redirects unauthenticated users to `/login`.
   - **Backend**: Decorated with `@module_required("tourism")` or `@module_required("sanitation")` defined in `api/permissions.py`. Rejects unauthorized roles with HTTP 403 Forbidden.
   - **Session Expiration Handling**: Mobile API client catches HTTP 401, clears stored tokens, and prompts re-login; catches HTTP 403 and displays permission alerts without clearing valid credentials.

---

## 6. Key Features (as implemented)

### 1. Tourism Management & Operations (Web Portal)
- **Dashboard Overview (`Dashboard.js`)**: Real-time KPI summary (Total Arrivals, Monthly Visits, Active Destinations, Satisfaction Rating), monthly arrival bar charts, destination distribution doughnut, Philippine regions breakdown, and recent activity feed.
- **Booking & Record Management (`BookingManagement.js`)**: Searchable, filterable directory of visitor registrations. Supports manual status updates (`pending` $\rightarrow$ `arrived` / `no_show`), visitor demographic inspection, multi-step new registration wizard, and Excel file upload.
- **Online Booking Excel Importer (`online_booking.py`)**: Parses Google Form responses spreadsheets (`.xlsx`) via `openpyxl`. Validates destination names, provinces, and demographic counts. Offers dry-run validation preview and batch database commits.
- **Live Arrival Monitoring (`ArrivalMonitoring.js`)**: Operational table for port and resort staff tracking daily arrivals, boat capacity fees, and group counts. Automatically flags overdue pending bookings as `no_show`.
- **Destination & Accommodation Management (`DestinationManagement.js`)**: Full CRUD for resorts and tourist attractions. Manages GPS coordinates, Mayor's permit status, access modes, capacity, and multi-image uploads to Supabase S3.
- **Visitor Feedback Moderation (`FeedbackMonitoring.js`)**: Reviews submitted tourist ratings, categorizes sentiment (positive, neutral, negative), and allows staff to publish official responses.
- **Tourism Reports & Analytics (`AnalyticsAndReport.js`)**: Demographic visualizations (gender split, age brackets, domestic vs. foreign origin), monthly comparison charts, and CSV report export.
- **Tourism GIS Spatial Map (`GISMap.js`)**: Interactive Leaflet OpenStreetMap displaying resort locations with custom markers, popup details, and visitor density heatmaps (`leaflet.heat`).

### 2. Sanitation & Environmental Health (Web Portal)
- **Sanitary Dashboard (`SanitationDashboard.js`)**: Health compliance KPIs (total establishments, good standing %, pending inspections, active violations, expiring permits), urgent alerts banner, and recent inspection timeline.
- **Establishment Directory (`EstablishmentRecords.js`)**: Searchable masterlist across 40 barangays. Displays permit numbers, compliance statuses, inspection frequencies, and contact numbers. Supports adding/editing establishments and viewing complete compliance history.
  - *Post-audit update*: The registration/edit workflow was redesigned in Phase 1 (`703533a`). See [Section 11](#11-post-audit-updates).
- **Inspection Management (`InspectionManagement.js`)**: Digital inspection record logger. Evaluates requirement checklists (water potability, health cards, waste management, grease traps), computes next inspection due dates, records findings, and updates establishment status.
- **Complaints Management (`ComplaintsManagement.js`)**: Triages citizen community reports. Tracks statuses (`pending` $\rightarrow$ `investigating` $\rightarrow$ `resolved` / `rejected`), assigns inspectors, schedules field investigation dates/times, and stores investigation notes.
- **Permit Monitoring & Renewal Pipeline (`PermitRenewal.js`, `PermitMonitoring.js`)**: 8-stage progress pipeline (`notice_sent` $\rightarrow$ `application_filed` $\rightarrow$ `requirements_review` $\rightarrow$ `inspection_scheduled` $\rightarrow$ `payment_pending` $\rightarrow$ `approved` $\rightarrow$ `released` $\rightarrow$ `lapsed`). Tracks fees, Official Receipt (OR) numbers, payment methods, and automated permit validity extension upon release.
- **Household Sanitation Surveys (`HouseholdRecords.js`, `HouseholdReportAnalytics.js`)**: Records residential sanitary data across 40 barangays. Analyzes toilet types (Water-Sealed, Pour-Flush, Pit Latrine, None), water levels (Levels I, II, III), and waste disposal methods. Automatically calculates sanitary score and compliance status.
- **Sanitation GIS Map (`SanitaryGISMap.js`)**: OpenStreetMap displaying multi-layer spatial data: establishments (color-coded by compliance), community complaints (colored by status), and household surveys, with heatmap toggles and barangay boundary centering.
- **Inspector & Staff Management (`StaffManagement.js`)**: Admin interface for creating and managing field inspector accounts (`is_staff: True`, role `sanitation`). Supports password resets, profile edits, and account activation toggles with self-deactivation guards.

### 3. Mobile Client Application (Flutter)
- **Tourism Guide & Digital Pass (`tourism_screens.dart`)**:
  - Browse featured destinations, categories, and resort details with photo carousels.
  - Interactive OpenStreetMap with clickable destination pins.
  - Itinerary planner and packing checklist tool.
  - Public visit registration generating a scannable **QR Digital Travel Pass**.
  - **Export / Share Pass**: Rasterizes the QR entry ticket visual via Flutter `RepaintBoundary` into a high-resolution PNG and invokes the native OS share sheet (`share_plus`).
  - Public feedback submission with photo attachments.
- **Resort Staff QR Check-In Scanner (`tourist_qr_checkin_screens.dart`)**:
  - Hardware camera scanner (`mobile_scanner`) reading tourist QR codes.
  - Fuzzy/partial search fallback for damaged or manual ticket IDs.
  - Real-time visitor verification and one-tap Check-In updating backend status to `arrived`.
  - **CSV Export**: Exports filtered check-in history into RFC 4180-compliant CSV files shared via native OS share sheet.
- **Citizen Sanitation Portal (`sanitation_screens.dart`)**:
  - Submit sanitary complaints with GPS coordinates (`geolocator`) and camera photos (`image_picker`).
  - Status tracker: Look up submitted complaints by reference ID or phone number.
  - Public permit verification: Scan or enter a permit code to check authenticity and compliance status.
- **Inspector Field Tools (`sanitation_screens.dart`)**:
  - Mobile sanitary inspection form with dynamic requirement checklists and draft storage.
  - Mobile household sanitary survey form with automated scoring.
- **Establishment Owner Portal (`sanitation_screens.dart`)**:
  - Scannable digital sanitary permit QR code.
  - Expiration countdown banner (warns when permit is expiring within 60 days or expired).
  - Requirements checklist with progress indicator.
  - Vertical timeline of past inspections and inspector remarks.

### 4. Background & Cross-Cutting Systems
- **Notification Engine (`evaluate_due_notifications.py`, `backend/api/views/notifications.py`)**:
  - Daily scheduled evaluation identifying permits expiring within 30 days and inspections due within 7 days.
  - Splits severity into `warning` (due soon) and `critical` (overdue/expired).
  - Generates idempotent notifications for staff users.
  - Triggers write-time notifications when an inspection results in a `violation`.
  - Staff-authored public advisories broadcasted to mobile users.
- **Automated Webhook Endpoint (`/api/notifications/evaluate-due/`)**:
  - Allows GitHub Actions or external cron jobs to trigger daily due evaluations securely via a shared secret key without paid worker services.
- **System Activity Audit Trail (`ActivityLog`)**:
  - Records user identity, timestamp, module, action (`create`, `update`, `delete`), and target entity label for major administrative changes.

---

## 7. API Endpoints

All routes are prefixed with `/api/`.

### Shared & Authentication
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `health/` | `GET` | Health check probe | No | Anyone |
| `auth/login/` | `POST` | Authenticate user & return auth token | No | Anyone |
| `auth/register/` | `POST` | Register tourist account | No | Anyone |
| `auth/register-establishment/` | `POST` | Register/claim establishment owner account | No | Anyone |
| `auth/me/` | `GET` | Return current authenticated user profile | Yes | Any authenticated user |
| `auth/logout/` | `POST` | Invalidate/delete current auth token | Yes | Any authenticated user |
| `activity-logs/` | `GET` | List audit activity logs (module filtered) | Yes | Any authenticated user |
| `bootstrap/` | `GET` | Initial bundle for Tourism web portal | Yes | `admin`, `tourism` |
| `reference-tables/` | `GET` | Master tables (regions, provinces, purposes) | Yes | `admin`, `tourism` |

### Tourism Web Module
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `dashboard/` | `GET` | Tourism KPI cards and arrival trends | Yes | `admin`, `tourism` |
| `booking-management/` | `GET` | Filterable visitor registration records | Yes | `admin`, `tourism` |
| `arrival-monitoring/` | `GET` | Operational arrival tracking payload | Yes | `admin`, `tourism` |
| `reports/` | `GET` | Tourism analytics and demographics data | Yes | `admin`, `tourism` |
| `online-booking-import/` | `POST` | Preview or commit online booking Excel sheets | Yes | `admin` only |
| `resorts/` | `GET`, `POST` | List all resorts or create a new destination | Yes | `admin`, `tourism` |
| `resorts/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, edit, or delete a resort | Yes | `admin`, `tourism` |
| `resorts/upload-image/` | `POST` | Upload resort images to Supabase S3 | Yes | `admin`, `tourism` |
| `destinations/upload-image/` | `POST` | Alias for resort image upload | Yes | `admin`, `tourism` |
| `tourist-records/` | `GET`, `POST` | List tourist records or create registration | Yes | `admin`, `tourism` |
| `tourist-records/<survey_id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, update status, or delete record | Yes (`DELETE`: admin only) | `admin`, `tourism` |
| `feedback/` | `GET`, `POST` | List visitor reviews or submit review | Yes | `admin`, `tourism` |
| `feedback/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, reply to, or delete feedback | Yes | `admin`, `tourism` |

### Sanitation Web Module
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `sanitation/bootstrap/` | `GET` | Initial bundle for Sanitation web portal | Yes | `admin`, `sanitation` |
| `sanitation/dashboard/` | `GET` | Sanitation KPI metrics and summary | Yes | `admin`, `sanitation` |
| `sanitation/business-types/` | `GET` | List business categories & requirements | Yes | `admin`, `sanitation` |
| `sanitation/establishments/` | `GET`, `POST` | List establishments or register new | Yes | `admin`, `sanitation` |
| `sanitation/establishments/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, update, or delete establishment | Yes | `admin`, `sanitation` |
| `sanitation/inspections/` | `GET`, `POST` | List inspections or submit inspection | Yes | `admin`, `sanitation` |
| `sanitation/inspections/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, edit, or delete inspection | Yes | `admin`, `sanitation` |
| `sanitation/permits/` | `GET` | Permit monitoring data and statistics | Yes | `admin`, `sanitation` |
| `sanitation/renewals/` | `GET`, `POST` | List renewals or initiate renewal | Yes | `admin`, `sanitation` |
| `sanitation/renewals/<id>/` | `GET`, `PATCH`, `DELETE` | Update renewal stage, payment, release | Yes | `admin`, `sanitation` |
| `sanitation/complaints/` | `GET`, `POST` | List complaints or log citizen complaint | Yes | `admin`, `sanitation` |
| `sanitation/complaints/<id>/` | `GET`, `PATCH`, `DELETE` | Update status, assign inspector, resolve | Yes | `admin`, `sanitation` |
| `sanitation/submissions/` | `GET` | Document verification submissions | Yes | `admin`, `sanitation` |
| `sanitation/reports/` | `GET` | Business sanitation compliance analytics | Yes | `admin`, `sanitation` |
| `sanitation/staff/`, `v1/sanitation/staff/` | `GET`, `POST` | List staff or create sanitary inspector | Yes (`POST`: admin/staff) | `admin`, `sanitation` |
| `sanitation/staff/<id>/`, `v1/sanitation/staff/<id>/` | `GET`, `PATCH`, `PUT` | Edit inspector details or toggle status | Yes (`PATCH`: admin/staff) | `admin`, `sanitation` |

### Household Sanitation Module
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `households/bootstrap/` | `GET` | Barangay masterlist and initial survey data | Yes | `admin`, `sanitation` |
| `households/barangays/` | `GET` | List active barangays of Mauban | Yes | `admin`, `sanitation` |
| `households/dashboard/` | `GET` | Household sanitation statistics & metrics | Yes | `admin`, `sanitation` |
| `households/records/` | `GET`, `POST` | List household surveys or record survey | Yes | `admin`, `sanitation` |
| `households/records/<id>/` | `GET`, `PUT`, `PATCH`, `DELETE` | Retrieve, edit, or delete household record | Yes | `admin`, `sanitation` |

### Notifications & Webhooks
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `notifications/` | `GET` | List notifications for authenticated user | Yes | Any authenticated user |
| `notifications/mark-all-read/` | `POST` | Mark all user notifications as read | Yes | Any authenticated user |
| `notifications/<id>/read/` | `PATCH` | Mark single notification as read | Yes | Owner of notification |
| `notifications/public/` | `GET`, `POST` | View active advisories or create advisory | GET: No / POST: Yes | POST: `admin`, `tourism`, `sanitation` |
| `notifications/public/<id>/` | `PATCH` | Update advisory text or status | Yes | `admin`, `tourism`, `sanitation` |
| `notifications/evaluate-due/` | `POST` | Cron webhook to evaluate due dates | Secret Key (`X-Cron-Key`) | Webhook Caller |

### Public & Field Mobile API
| Route | Method | Purpose | Auth Required | Allowed Roles |
| :--- | :--- | :--- | :--- | :--- |
| `mobile/tourism/register/` | `POST` | Register new tourist account | No | Anyone |
| `mobile/tourism/bootstrap/` | `GET` | Bootstrap data for tourist mobile guide | No | Anyone |
| `mobile/tourism/destinations/` | `GET` | Search and filter resort destinations | No | Anyone |
| `mobile/tourism/destinations/<id>/` | `GET` | Destination details with recent reviews | No | Anyone |
| `mobile/tourism/register-visit/` | `POST` | Submit visit registration (creates pass) | No | Anyone |
| `mobile/tourism/records/lookup/` | `GET` | Front-desk lookup of tourist QR ticket | Yes | `admin`, `tourism` |
| `mobile/tourism/records/check-in/` | `POST` | Front-desk action to mark visitor arrived | Yes | `admin`, `tourism` |
| `mobile/tourism/records/history/` | `GET` | Check-in history log for staff export | Yes | `admin`, `tourism` |
| `mobile/tourism/feedback/` | `POST` | Submit visitor review with photo upload | No | Anyone |
| `mobile/sanitation/bootstrap/` | `GET` | Bootstrap data for mobile sanitation | No | Anyone |
| `mobile/sanitation/reports/` | `POST` | Submit citizen complaint with photos/GPS | No | Anyone |
| `mobile/sanitation/reports/history/` | `GET` | Query submitted reports by phone/ID | No | Anyone |
| `mobile/sanitation/permits/verify/` | `GET` | Verify commercial permit QR / code | No | Anyone |
| `mobile/sanitation/register-establishment/` | `POST` | Register/claim establishment owner account | No | Anyone |
| `mobile/sanitation/inspections/` | `POST` | Submit field inspection checklist | Yes | `admin`, `sanitation` |
| `mobile/sanitation/household-surveys/` | `POST` | Submit field household sanitary survey | Yes | `admin`, `sanitation` |

---

## 8. Known Issues / Incomplete Work

### Hardcoded Local File Paths
- **`backend/api/management/commands/import_sanitary_permits.py` (lines 24-27)**:
  Contains developer-machine hardcoded paths:
  ```python
  DEFAULT_FILES = [
      Path(r"C:\Users\This PC\Downloads\Sanitary Permit Large 2025.xlsx"),
      Path(r"C:\Users\This PC\Downloads\Sanitary Permit Sp 2025.xlsx"),
  ]
  ```
  If executed without explicit arguments on a different machine or server, it will throw a `FileNotFoundError`.

### Hardcoded Demo Credentials & Gateway Shortcuts
- **`mobile/lib/screens/sanitation_screens.dart` (lines 5244-5249)**:
  Plain-text credential disclosure banner in the Establishment portal login UI:
  ```dart
  'Default Demo Account:\nUsername: establishment_owner\nPassword: Establishment@123'
  ```
- **`mobile/lib/screens/sanitation_screens.dart` (lines 5160-5185)**:
  "Quick Demo Establishments" interactive chips that bypass password login by invoking `_accessEstablishmentByCode()` using the first 3 establishments returned in bootstrap data.
- **`frontend/src/sanitation/pages/EstablishmentRecords.js` (line 894)**:
  UI helper string hardcodes demo credentials:
  ```javascript
  "...or use demo account (establishment_owner / Establishment@123)."
  ```

### Hardcoded Production URL in Mobile Fallback
- **`mobile/lib/utils/helpers.dart` (lines 3-6)**:
  Defaults `apiBaseUrl` to a specific Render domain if `--dart-define=API_BASE_URL` is omitted:
  ```dart
  const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://capstone-backend-stzr.onrender.com/api',
  );
  ```
  Running `flutter run` locally without setting the dart-define will silently attempt to connect to the remote Render instance instead of the local server.

### Unfinished Code / Stubs / TODO Comments
- **`mobile/android/app/build.gradle.kts` (line 44)**:
  Standard Flutter signing stub:
  ```kotlin
  // TODO: Add your own signing config for the release build.
  ```
- **`frontend/src/sanitation/Sanitation_index.css` (lines 770, 841)**:
  CSS comments label chart wrappers as `/* DONUT MOCK */` and `/* ESTABLISHMENT BAR CHART MOCK */`.

### Testing Gaps
- **Frontend Test Suite Missing**: `frontend/src/` has **zero** test files. `npm test` runs into missing test suites despite testing dependencies existing in `package.json`.
- **Mobile Test Suite Minimal**: `mobile/test/widget_test.dart` contains only 1 basic widget test verifying that intro text renders.

### Standalone Migration/Mock Scripts
- **`backend/mock_scripts/`**: Contains 8 standalone Python scripts (`add_mock_data.py`, `add_more_mock_data.py`, `fix_barangay_coordinates.py`, etc.) that execute direct model manipulation outside of Django management commands or migrations.

---

## 9. Environment & Setup

### Environment Variables

#### Backend (`backend/.env`)
| Variable | Description | Example / Required Format |
| :--- | :--- | :--- |
| `SECRET_KEY` | Django cryptographic signing secret | `django-insecure-...` |
| `DEBUG` | Development debug mode toggle | `True` or `False` (defaults to `False`) |
| `USE_SEED_DATA` | Automatically populate seed data | `True` or `False` (defaults to `False`) |
| `DB_ENGINE` | Database engine | `postgresql` or `sqlite` |
| `DB_NAME` | PostgreSQL database name | `postgres` |
| `DB_USER` | PostgreSQL user | `postgres.your-project-id` |
| `DB_PASSWORD` | PostgreSQL password | Secret string |
| `DB_HOST` | Database host URL | `aws-1-ap-southeast-2.pooler.supabase.com` |
| `DB_PORT` | Database connection port | `5432` |
| `DB_SSLMODE` | PostgreSQL SSL mode | `require` |
| `DATABASE_URL` | Optional complete connection URI | `postgres://user:pass@host:5432/db` |
| `SQLITE_DB_PATH` | Optional custom SQLite file path | Defaults to `BASE_DIR / db.sqlite3` |
| `ALLOWED_HOSTS` | Comma-separated hostnames/IPs | `127.0.0.1,localhost,testserver` |
| `CORS_ALLOW_ALL_ORIGINS` | Allow all CORS origins | `False` (set `True` only in development) |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins | `http://localhost:3000,http://127.0.0.1:3000` |
| `CRON_SECRET_KEY` | Shared key for notification webhook | Secret string |
| `USE_S3_STORAGE` | Enable S3 cloud storage for uploads | `True` or `False` |
| `AWS_ACCESS_KEY_ID` | Supabase S3 Access Key ID | S3 API Access Key |
| `AWS_SECRET_ACCESS_KEY` | Supabase S3 Secret Access Key | S3 API Secret Key |
| `AWS_STORAGE_BUCKET_NAME`| Supabase Storage bucket name | `media` |
| `AWS_S3_ENDPOINT_URL` | Supabase S3 endpoint | `https://<ref>.supabase.co/storage/v1/s3` |
| `AWS_S3_REGION_NAME` | S3 region identifier | `ap-southeast-1` |
| `AWS_S3_CUSTOM_DOMAIN` | Optional custom CDN domain | `<ref>.supabase.co/storage/v1/object/public/media` |

#### Frontend (`frontend/.env` - optional)
| Variable | Description | Default |
| :--- | :--- | :--- |
| `REACT_APP_API_BASE_URL` | Base URL of Django REST API | `http://<window.location.hostname>:8000/api` |

#### Mobile (Passed via `--dart-define`)
| Variable | Description | Default |
| :--- | :--- | :--- |
| `API_BASE_URL` | API base endpoint | `https://capstone-backend-stzr.onrender.com/api` |
| `APP_MODULE` | Active mobile module (`tourism` or `sanitation`) | `tourism` |

---

### How to Run Locally

#### 1. Backend (Django)
```powershell
cd backend

# Create & activate virtual environment (Windows PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Create default demo user accounts
python manage.py create_default_users

# Run local development server (Port 8000)
python manage.py runserver 0.0.0.0:8000
```

#### 2. Frontend (React Web Portal)
```powershell
cd frontend

# Install dependencies
npm install

# Run local development server (Port 3000)
npm start
```

#### 3. Mobile (Flutter)
```powershell
cd mobile

# Install dependencies
flutter pub get

# Run Tourism Mobile App on Chrome (with local backend URL)
flutter run -d chrome -t lib/main.dart --dart-define=API_BASE_URL=http://localhost:8000/api

# Run Sanitation Mobile App on Chrome
flutter run -d chrome -t lib/main_sanitation.dart --dart-define=API_BASE_URL=http://localhost:8000/api

# Run on Android Emulator (uses 10.0.2.2 loopback)
flutter run -d emulator --dart-define=API_BASE_URL=http://10.0.2.2:8000/api
```

---

### Seed & Maintenance Commands
- `python manage.py create_default_users`: Provisions fixed system accounts:
  - `system_admin` / `Admin@123` (Admin)
  - `tourism_admin` / `Tourism@123` (Tourism Staff)
  - `sanitation_admin` / `Sanitation@123` (Sanitary Section)
  - `inspector_juan` / `Inspector@123` (Sanitary Inspector)
  - `inspector_maria` / `Inspector@123` (Sanitary Inspector)
  - `establishment_owner` / `Establishment@123` (Business Owner)
  - `resort_owner` / `Resort@123` (Resort Owner)
- `python manage.py evaluate_due_notifications`: Scans expiring permits ($\le 30$ days) and inspections ($\le 7$ days) and dispatches staff alerts.
- `python manage.py import_online_bookings <file.xlsx> [--dry-run]`: Imports tourism online booking spreadsheets.
- `python manage.py import_tourism_excel <file.xlsx> --year=2025`: Imports historical resort arrival monitoring sheets.
- `python manage.py import_sanitary_permits <file1.xlsx> <file2.xlsx>`: Imports Sanitary Permit Large & SP masterlists.
- `python manage.py purge_demo_households`: Deletes sample household records from database.

---

## 10. Observations & Risks

### Security Concerns
1. **Committed/Exposed Database Credentials in Local `.env`**:
   - `backend/.env` currently contains real active Supabase pooler credentials and passwords. Although `.env` is listed in `backend/.gitignore`, developers must ensure this file is never committed, staged, or exposed in public repositories.
2. **Hardcoded Passwords and Login Bypasses in Client Code**:
   - `mobile/lib/screens/sanitation_screens.dart` (line 5244) prints `establishment_owner / Establishment@123` on screen, and lines 5160-5185 render one-click "Quick Demo Establishments" chips that permit unauthenticated portal entry.
   - `frontend/src/sanitation/pages/EstablishmentRecords.js` (line 894) exposes the same demo credentials in a helper tooltip.
   - Default users created by `create_default_users.py` have predictable passwords.
3. **Public File Uploads Without Rate Limiting**:
   - `POST /api/mobile/sanitation/reports/` (`mobile_sanitation_report_submit`) and `POST /api/mobile/tourism/feedback/` (`mobile_feedback_submit`) are `AllowAny` endpoints accepting multipart file uploads up to 5MB. While MIME types and extensions are validated in `upload.py`, there is no rate limiting, CAPTCHA, or IP throttling, making these endpoints susceptible to storage exhaustion or denial of service.
4. **Development Flags in Configuration**:
   - In `backend/.env`, `DEBUG=True` and `CORS_ALLOW_ALL_ORIGINS=True`. In production, these must be disabled to prevent detailed error stack traces and cross-origin abuse.
5. **Public Tourist Registration Privilege Escalation (RESOLVED in `60fdee3206d6218674ff65c9bb517b533095381b`)**:
   - **Root Cause**: Public tourist registration (`POST /api/auth/register/` and `POST /api/mobile/tourism/register/`) previously assigned the staff `ROLE_TOURISM` (`"tourism"`). Because backend permissions (`MODULE_ROLES["tourism"] = {ROLE_ADMIN, ROLE_TOURISM}`) and mobile staff lookup checks grant administrative access to any user with the `tourism` role, registered public tourists were inadvertently granted access to Tourism staff endpoints.
   - **Remediation**:
     - Introduced a dedicated `ROLE_TOURIST = "tourist"` constant and choice in `backend/api/models.py`.
     - Updated `tourist_register_view` in `backend/api/auth_views.py` so newly registered public tourists explicitly receive `role = "tourist"`.
     - Preserved strict Tourism staff permissions in `backend/api/permissions.py` (`MODULE_ROLES["tourism"] = {ROLE_ADMIN, ROLE_TOURISM}`), keeping tourists excluded from all staff modules.
     - Generated safe metadata-only Django migration `0032_alter_notification_target_role_and_more.py` (verified SQL no-op).
   - **Verification & Production Deployment**:
     - Local API regression tests passed in `AuthApiTests` (5/5) and across the entire backend test suite (59/59 passed).
     - Deployed to the production Render environment and live security verification passed at verified production commit `60fdee3206d6218674ff65c9bb517b533095381b`.
     - Live production security verification confirmed:
       * Newly registered public tourist received `role="tourist"` (`HTTP 201 Created`).
       * Authenticated tourist received `HTTP 403 Forbidden` attempting protected staff web booking management (`GET /api/booking-management/`).
       * Authenticated tourist received `HTTP 403 Forbidden` attempting protected mobile staff lookup (`GET /api/mobile/tourism/records/lookup/?query=...`).
       * Authorized Tourism staff account (`tourism_admin`) retained full access to staff booking management (`HTTP 200 OK`) and mobile lookup (`HTTP 404 Not Found` for nonexistent record query, proving authorization boundary passed).
   - **Production Compatibility & Data Note**: Existing production user accounts registered prior to this fix that currently hold the old `tourism` role were intentionally NOT bulk-converted as part of this release to ensure zero unexpected disruptions to active users.

### Data Integrity & Edge Cases
6. **Non-Deterministic Geographic Coordinate Jitter**:
   - In `backend/api/models.py` (`resolve_barangay_coordinates`, lines 51-55), when an establishment, complaint, or household is saved without GPS coordinates, a random offset (`random.uniform(-0.004, 0.004)`) is applied:
     ```python
     offset_lat = random.uniform(-0.004, 0.004)
     offset_lng = random.uniform(-0.004, 0.004)
     return round(base[0] + offset_lat, 6), round(base[1] + offset_lng, 6)
     ```
     Because this executes inside `save()`, every time an entity without explicit coordinates is updated and re-saved, its pin coordinates can shift slightly on the GIS map.
7. **Dual Scoring Logic Replication**:
   - The compliance scoring rules for households (0-3 points for toilet, water, waste) are implemented both in Python (`HouseholdSanitationRecord.save()` in `backend/api/models.py:1015-1051`) and in Dart (`household_status_from_payload()` in `mobile/lib/utils/helpers.dart`). Any alteration to municipal health scoring thresholds must be manually synchronized in both places.
8. **Protected Delete Cascade on Destinations**:
   - Deleting a destination via `DELETE /api/resorts/<id>/` fails with HTTP 409 Conflict if tourist records are linked to it (`tourist_records.resort` has `on_delete=PROTECT`). The system does not support archiving/deactivating resorts without deleting or reassigning existing bookings.

### Technical Debt & Code Maintainability
9. **Monolithic Mobile Files**:
   - `mobile/lib/screens/sanitation_screens.dart` is **6,876 lines** (252 KB).
   - `mobile/lib/screens/tourism_screens.dart` is **4,375 lines** (160 KB).
   - `mobile/lib/screens/tourist_qr_checkin_screens.dart` is **2,197 lines** (78 KB).
   - The Flutter codebase relies heavily on `part` / `part of` directives linked back to `main.dart`, creating a single massive compilation unit rather than modular, self-contained Dart packages.
10. **No Frontend Automated Testing**:
    - The React frontend has no unit or integration tests (`0` test files in `frontend/src/`). Any regression in API response parsing or routing can only be detected via manual browser testing.
11. **Hardcoded Absolute File Paths in Management Commands**:
    - `import_sanitary_permits.py` contains hardcoded user directory paths (`C:\Users\This PC\Downloads\...`), rendering it unusable in automated CI/CD or production containers without providing explicit CLI arguments.

---

## 11. Post-Audit Updates

Sections 1–10 above describe the codebase as audited on September 18, 2026 and are preserved as a historical record. This section records later changes (documented September 22, 2026).

### Sanitary Establishment Records Phase 1 (`703533a`)
- **Commit**: `703533a` — `feat(sanitation): redesign establishment records workflow`.
- **Implemented Behavior**:
  - Redesigned the Sanitary Establishment Records registration/edit workflow.
  - New registrations start as **No Permit** rather than inventing permit data. Registration focuses on establishment profile, business type, address/barangay, contact, and location.
  - Existing establishment values are loaded non-destructively during edit.
  - Permit issuance/generation remains an explicit action.
  - SP/Large is presented as internal **Permit Coverage**, not physical establishment size.
  - Client-facing Business Type categories are exactly the 9 confirmed categories:
    1. Commercial / NF
    2. Food Establishment
    3. Industrial Establishment
    4. Agro-Industrial Establishment
    5. Institutional Establishment
    6. Water Refilling Station
    7. Public Transport
    8. Ambulant Food Vendor
    9. Public Places
  - Existing underlying business type IDs/names remain preserved. Known legacy/importer business types are mapped to the approved client-facing categories. Unknown underlying types do not create additional Business Type filter categories.
  - Location wording no longer implies GPS verification; valid map references are distinguished from invalid/out-of-bounds coordinates.
  - Timeline precedence remains `updated_at || created_at || permit_issued_date`.
  - Phase 1 included regression/characterization tests and frontend/backend test coverage.
- **Test/Build Verification (post-commit, all passed)**:
  - Establishment Records focused frontend tests: 101/101 passed.
  - Full frontend tests: 126/126 passed. (The "zero frontend test files" findings in Section 8 *Testing Gaps* and Section 10 item 10 reflect the original audit date and are left unchanged as historical record.)
  - Backend tests: 69/69 passed using isolated in-memory SQLite. SQLite was used intentionally so the run did not create or alter a test database on the production Postgres/Supabase environment; backend tests were not run against production Postgres.
  - Frontend production build passed.
  - `git diff --check` passed.
- **Git/Deployment**:
  - `703533a` was pushed to `origin/main` as a fast-forward from `2e14a30`.
  - `origin/main` pointed to `703533a` when the Phase 1 verification was performed. It has since advanced to `49bf302` through separate Tourism commits. Those commits do not modify the Phase 1 Sanitation source files.
  - No manual deployment was performed. No production database modification was performed as part of the Phase 1 release or its verification.
  - The later Tourism release includes migration `0033`; whether that migration has been applied in production was not verified from public read-only checks. This section makes no claim that production data is unchanged overall.
- **Initial Production Deployed-Build Verification (build from `703533a`)**:
  - Production frontend `https://capstone-frontend-ohuj.onrender.com/` returned HTTP 200 and loads the production backend API `https://capstone-backend-stzr.onrender.com/api`.
  - Backend `/api/health/` returned HTTP 200 with status ok.
  - The deployed frontend bundle was inspected: deployed `EstablishmentRecords.js` and `businessTypeLabels.js` matched the Phase 1 versions from `703533a` and differed from `2e14a30`; the CSS deployed at that time matched the Phase 1 local build byte-for-byte.
  - Phase 1 markers and all 9 approved Business Type categories were found in the deployed bundle. No `GPS` wording was present in the deployed Establishment Records build.
- **Current Production Deployed-Build Re-Verification (after `origin/main` advanced to `49bf302`)**:
  - Verified through the production frontend's publicly accessible source maps (`main.*.js.map`, `main.*.css.map`), comparing their embedded sources against the repository source using only read-only requests.
  - The current production frontend is built from `49bf302`: every application JS and CSS source file in the source maps is byte-identical to `49bf302`. No commit SHA is exposed publicly; this conclusion comes from the source comparison.
  - Production frontend returns HTTP 200 and points to the production backend API `https://capstone-backend-stzr.onrender.com/api`. Backend `/api/health/` returns HTTP 200 with `status: ok`.
  - The deployed `EstablishmentRecords.js` and `businessTypeLabels.js` remain byte-identical to the Phase 1 versions from `703533a`.
  - The Phase 1 Sanitation strings (`Permit Coverage (internal SP / Large)`, `Location Coordinates`, `Map Reference`, `Issue & Generate Permit Now`, `No Permit`) and all 9 client-facing Business Type categories remain present. `GPS` wording remains absent from the deployed Establishment Records implementation.
  - The current production CSS is **not** byte-identical to the earlier Phase 1 build. The difference is attributable to the later Tourism changes in `Tourism_index.css` and `BookingManagement.wizard.css`; `Sanitation_index.css` and all other CSS sources remain unchanged.
  - Phase 1 remains strongly evidenced in the current deployed frontend.
- **Limitation — Authenticated UI Behavior Not Verified**:
  - The verifications above establish what build is deployed; they do not establish authenticated UI behavior in production.
  - Authenticated production Establishment Records UI behavior was **not** manually verified. No staff credentials were used.
  - No production establishment was created, edited, issued a permit, or otherwise modified during verification.
  - The authenticated production workflow is therefore **not** considered fully verified.
  - *Later update*: a limited read-only authenticated inspection of the Business Type categories and Register dropdown was performed (see the Ambulant Food Vendor subsection below). The full authenticated workflow remains unverified.

### Ambulant Food Vendor Business Type (migration `0034`, deployed)
- Implementation commit: `57f1f086547b4bac84aca5e51e5964ae4437322c`, documentation commit `e7015992a2f5a50d32c1ea6efb70c133441d6896`. Both pushed; `origin/main` is at `e701599` and the Render deployment is live.
- **Authenticated Production UI Observation (read-only)**:
  - Sanitation → Establishment Records was inspected read-only with an authorized account.
  - The 9 approved client-facing Business Type categories were visible, including Ambulant Food Vendor.
  - The Register New Establishment Business Type dropdown showed "Ambulant Food Vendor — No business type configured yet": the category existed in the UI but had no underlying selectable `SanitaryBusinessType`.
  - No production record was created or modified. No Save, Submit, Update, Issue, or Renew action was performed.
- **Client Confirmation**:
  - Official business type name: Ambulant Food Vendor.
  - Inspection frequency: Monthly.
  - Standard requirements: not yet provided. Additional requirements: none yet provided. Legal basis: not yet provided.
- **Implementation**:
  - Added data migration `backend/api/migrations/0034_add_ambulant_food_vendor_business_type.py`. It creates the underlying `SanitaryBusinessType` with `name = "Ambulant Food Vendor"`, `inspection_frequency = monthly`, and no requirements; it does nothing if a type with that name (any casing) already exists, and its reverse is a no-op.
  - A data migration was used because seed data is disabled in production (`USE_SEED_DATA=False`), and adding the type to `SANITARY_BUSINESS_TYPES` would have auto-generated the standard requirements for both SP and Large.
  - The existing Phase 1 mapping in `frontend/src/sanitation/utils/businessTypeLabels.js` already maps this name to the client-facing Ambulant Food Vendor category. No UI workaround was added.
  - Corrected the stale comment in `businessTypeLabels.js` that claimed the category was already represented by imported production data.
  - No sanitary requirements, legal basis, or SP/Large-specific requirements were invented or added.
- **Verification (local)**:
  - New backend Ambulant tests: 7/7 passed. Full backend suite: 100/100 passed, run on isolated in-memory SQLite (not production Postgres).
  - Focused frontend tests (Establishment Records): 106/106 passed. Full frontend suite: 131/131 passed.
  - `makemigrations --check` passed; `0034` is the only new migration. `git diff --check` passed.
  - Frontend production build succeeded twice without errors (default build and production-API-URL build). The production-URL build's JS, CSS, `index.html`, and `asset-manifest.json` were byte-identical to the currently deployed production frontend.
  - No unrelated source, configuration, infrastructure, or mobile changes were found. Test-generated media files under `backend/media/` (gitignored) were local only.
- **Production Deployment State**:
  - Migration `0034` **is applied in production**, based on the production `Ambulant Food Vendor` row created by the Render deployment (via `migrate` in Render's build command, which does not run `backend/build.sh`). This was the intended, intentional production data change.
  - No production database modification was performed during the implementation itself or during verification; the row was created by the deployment's `migrate` step.
- **Production Verification (read-only, after deployment)**:
  - Verified through the public unauthenticated sanitation bootstrap endpoint and the deployed frontend bundle. No write requests were made, and no production records were created or edited.
  - Production has exactly one case-insensitive `Ambulant Food Vendor` type: production ID `24`, frequency `monthly`, requirement count `0`.
  - Production now has 16 business types, up from the previously recorded 15. All 15 previously known business type names remain present and unchanged.
  - Total configured requirements remain `243`; no requirements were deleted during this work.
  - No production establishment currently uses the Ambulant type.
  - The deployed frontend's 51 application source files are byte-identical to commit `e701599`.
- **Verification Limitations**:
  - Production verification could not directly confirm the authenticated production UI: no staff session was used, so the logged-in Register/Inspection/Renewal screens were not visually verified.
  - Production verification could not directly read `django_migrations`; applied status is based on the production `Ambulant Food Vendor` row, which only migration `0034` creates.
  - Production verification could not perform a complete before/after comparison of establishment records, so this section does not claim that establishment records definitely did not change.
  - Production verification could not directly confirm the backend commit SHA; the backend exposes no version or commit information.
- **Requirements Status**:
  - Ambulant Food Vendor has zero sanitary requirements by design, because the Sanitation Section has not yet provided the official requirements or legal basis. The requirement list is **not** complete.

### Web Zero-Requirement Safety Fix (Inspection Management & Permit Renewal, web only)
- Implementation commit: `57f1f086547b4bac84aca5e51e5964ae4437322c`, documentation commit `e7015992a2f5a50d32c1ea6efb70c133441d6896`. Both pushed; `origin/main` is at `e701599` and the Render deployment is live.
- **Root Cause**:
  - The existing web Inspection Management and Permit Renewal workflows substituted hard-coded generic requirements when a business type had no configured requirements.
  - Inspection Management's fallback contained 10 generic items and could save them as inspection checklist items.
  - Permit Renewal's fallback (`getEstablishmentRequirements`) contained 7 generic items and could save selected items as `submitted_requirements`.
  - This affected any zero-requirement business type, not Ambulant specifically. Ambulant would have exposed it, because migration `0034` intentionally creates that type with zero requirements.
- **Web Fix** (`frontend/src/sanitation/pages/InspectionManagement.js`, `frontend/src/sanitation/pages/PermitRenewal.js`):
  - Inspection Management no longer substitutes the 10 generic requirements; Permit Renewal no longer substitutes the 7 generic requirements.
  - Zero-requirement types now show an honest "No requirements configured yet." state.
  - Inspections submit an empty checklist and renewals submit an empty `submitted_requirements` list instead of fabricated requirements.
  - Existing configured requirements continue to behave as before. Permit Renewal's cross-size behavior (using a type's own configured requirements from the other SP/Large coverage when none match) was intentionally preserved.
- **Verification (local)**:
  - New tests: `InspectionManagement.test.js` (5) and `PermitRenewal.test.js` (9); 14/14 passed. Against the pre-fix implementation, 8/14 intentionally failed, demonstrating that the tests catch the old fallback behavior.
  - Full frontend suite: 145/145 passed across 5 suites. Production-URL frontend build compiled successfully. `git diff --check` passed.
  - Backend tests were not rerun because no backend code changed; the previous 100/100 result remains valid for the unchanged backend.
  - No production database or API was modified.
- **Scope**: Web-only safety fix. Backend, migration `0034`, seed data, mobile code, requirements architecture, and production data were not changed.
- **Mobile Limitation (addressed later, on a branch)**:
  - At the time of this web fix, the mobile Flutter app still contained a generic fallback checklist for zero-requirement business types, and those items could be submitted and saved as inspection checklist items.
  - This was subsequently fixed on branch `sanitation/mobile-zero-requirements`; see **Mobile Zero-Requirement Inspection Checklist Fix** below. It is not merged and not deployed.
- **Existing Production Impact (inference at the time; since confirmed in production)**:
  - *Stated before production verification*: which existing production business types had zero configured requirements was not verified at that point. The inference was that the 13 seeded types produce exactly 243 requirement rows, matching the `SanitaryRequirement: 243` recorded at the clean-slate cleanup, which suggested the two non-seeded production types (likely "Food Establishment" and "Commercial Non Food") had zero requirements and were already receiving the generic fallback.
  - *Confirmed afterwards by the read-only production verification*: the three zero-requirement production types are `Ambulant Food Vendor`, `Commercial Non Food`, and `Food Establishment`, and the deployed web code no longer contains the old generic fallbacks. This confirmation rests on the public bootstrap data and the deployed frontend bundle; the authenticated UI was not visually checked.
- **Production Verification (read-only, after deployment)**:
  - The deployed frontend's 51 application source files are byte-identical to commit `e701599`. The old 10-item Inspection fallback and 7-item Renewal fallback are absent from the deployed frontend, and the new honest zero-requirement state is present.
  - Production currently has three zero-requirement business types (`Ambulant Food Vendor`, `Commercial Non Food`, `Food Establishment`), which confirms the earlier inference about the two non-seeded types.
  - Production verification could not directly confirm the authenticated production UI: the logged-in Inspection and Renewal screens were not visually verified.
- **Ambulant Status**: Migration `0034` is applied in production. Ambulant Food Vendor still intentionally has zero configured requirements; no requirements or legal basis were invented.

### Mobile Zero-Requirement Inspection Checklist Fix (branch `sanitation/mobile-zero-requirements`, NOT merged, NOT deployed)
- Commits on branch: `598e850` (remove the fabrication) and `97a6d4d` (honest empty state and empty-checklist submit). Branched from `f3bd653`. `origin/main` is unchanged by this work.
- **Root Cause**:
  - `_defaultChecksFor()` in `mobile/lib/screens/sanitation_screens.dart` substituted a hard-coded five-item checklist ("Proper waste disposal system", "Clean water supply available", "Functional toilet facilities", "Food handling area is clean", "Valid sanitary permit displayed") whenever the establishment's business type had no configured requirements, or when its business type id matched none of the loaded types.
  - Those fabricated items were ticked by the inspector and submitted to `/mobile/sanitation/inspections/` as real checklist items.
  - Mobile parses only `requirement_name` from the bootstrap and carries no permit-size field, so unlike the web it performs no SP/Large filtering and needs no cross-size fallback. The fabricated list therefore appeared only for types with zero requirements in total.
- **Mobile Fix** (`mobile/lib/screens/sanitation_screens.dart`):
  - The list-building logic was extracted unchanged into a pure top-level `buildInspectionChecks(businessTypes, businessTypeId)`, and the hard-coded fallback branch was then deleted. Configured types keep their exact previous behaviour: same names, same configured order, same case-insensitive de-duplication, all starting unchecked.
  - `InspectionChecklistPanel` shows "No requirements configured yet." for an empty checklist — the same wording as the web — instead of a "0% Complete (Unchecked)" score badge and empty progress bar.
  - The `_checks.isEmpty` submit guard ("Inspection checklist is required.") was removed, so a zero-requirement establishment can be inspected and submits `checklist_items: []`.
  - The starting status for an empty checklist is `good_standing`, mirroring the web form's rule in `frontend/src/sanitation/pages/InspectionManagement.js` (`if (total === 0 || completed === total) return "good_standing";`). The inspector can still change it from the Inspection status dropdown. Non-empty checklists keep their existing status behaviour.
- **Backend**: unchanged, and no change was required. `SanitaryInspectionCreateSerializer` declares `checklist_items` as `required=False` and `create()` defaults it to `[]`; `sync_establishment_after_inspection` copies the submitted `status_after_inspection` and derives nothing from the checklist, so an empty list cannot mis-score an establishment or divide by zero.
- **Verification (local only)**:
  - New tests: `mobile/test/sanitation_inspection_checklist_test.dart` (6 tests). Three failed against the pre-fix code, demonstrating the fabrication; all pass after the fix.
  - `flutter test`: 7/7 passed across the suite. `flutter analyze`: 4 issues found, the same 4 pre-existing info-level issues as before the change — no new issues.
  - No production database, API, or production data was touched.
- **Not Verified**:
  - Not merged to `main` and not deployed. A new APK build is still required.
  - **No real-device or emulator end-to-end test was performed.** The submission path was exercised only through a fake `TourismApi` in widget tests, never against a running backend.
- **Related (fixed separately)**:
  - `_buildRequirements()` in `mobile/lib/screens/sanitation_screens.dart` was deliberately left out of this fix and addressed on its own branch. See **Establishment Portal Real Requirements** below.

### Establishment Portal Real Requirements (branch `sanitation/portal-real-requirements`, NOT merged, NOT deployed)
- Commit on branch: `5f916e7`. Branched from `87f8cd6`. `origin/main` is unchanged by this work.
- **Root Cause**:
  - `_buildRequirements()` in `mobile/lib/screens/sanitation_screens.dart` returned a hard-coded list of five compliance documents — "Barangay Business Clearance", "Employee Health Certificates", "Water Potability Test Result", "Solid Waste & Grease Trap Maintenance" and "Pest & Vermin Abatement Plan" — regardless of the establishment's business type.
  - Each carried an invented description, an invented SUBMITTED/PENDING badge and an invented timestamp, for example "Verified on Jan 15, 2026", "Updated 12/12 staff records", "Tested on Jan 22, 2026 • Daungan Lab" and "Certified valid until Dec 2026". The badges and timestamps were switched on `complianceStatus`, which records nothing about whether an owner submitted a document.
  - The card also derived filter tabs, "N of 5 requirements met" counters and a completion progress bar from those invented values, and presented the whole thing to business owners in the Establishment Portal.
- **Data Availability (investigated before changing anything)**:
  - `SanitationEstablishmentPortalPage` previously received only the establishment, so it had `businessTypeId` but no access to that type's requirements.
  - Its caller, `_SanitationAccessGatewayState`, already holds a `SanitationBootstrap` whose `businessTypes` include each type's `requirements`. The bootstrap endpoint `/mobile/sanitation/bootstrap/` is `AllowAny` and is fetched before the gateway renders, so it is populated for establishment-owner sessions as well as staff sessions.
  - The fix was therefore possible entirely client-side. **No backend, serializer, endpoint or payload change was made.**
- **Mobile Fix** (`mobile/lib/screens/sanitation_screens.dart`):
  - `SanitationEstablishmentPortalPage` takes a new required `businessTypes` argument, supplied by the gateway from `widget.bootstrap.businessTypes`.
  - `_buildRequirements()` now returns the requirement names configured for the establishment's business type, or `null` when that type cannot be resolved. Name de-duplication reuses `buildInspectionChecks`, so the portal and the inspection form treat duplicate and blank names identically rather than carrying a second copy of the logic.
  - The card renders a plain list of names: no icons implying status, no SUBMITTED/PENDING badges, no descriptions, no timestamps, no counts, no completion percentage, and nothing derived from `complianceStatus`. The filter tabs, the `_ChecklistFilter` enum, the `_RequirementItem` class and the progress bar were removed as dead code.
  - Zero configured requirements shows "No requirements configured yet."; an unresolvable business type shows "Requirements unavailable."
- **Verification (local only)**:
  - New tests: `mobile/test/sanitation_portal_requirements_test.dart` (4 tests). All four failed against the pre-fix code. They assert the configured names render, both honest empty states render, none of the five fabricated documents appear, and none of the invented evidence fragments ("Verified on", "Tested on", "Daungan Lab", "12/12", "Certified valid until") appear anywhere in the rendered page, including for an establishment with a recorded violation.
  - `flutter test`: 11/11 passed across the suite. `flutter analyze`: 4 issues found, the same 4 pre-existing info-level issues — no new issues.
  - No production database, API, or production data was touched.
- **Not Verified**:
  - Not merged to `main` and not deployed. A new APK build is still required.
  - **No real-device or emulator end-to-end test was performed.** The portal was exercised only in widget tests, never against a running backend with a real owner login.

### Explicit Inspection Status for Empty Checklists (branch `sanitation/inspection-status-explicit`, NOT merged, NOT deployed)
- Commits on branch: `56276bc` (web) and `887e574` (mobile). Branched from `65a687f`. `origin/main` is unchanged by this work.
- **Rule**: when an inspection's checklist is empty — a business type with zero configured requirements, such as Ambulant Food Vendor — neither client auto-defaults `status_after_inspection`. The inspector must choose one before submitting. Non-empty checklists behave exactly as before, including the pre-existing divergence where web sets `violation` when nothing is ticked while mobile sets `for_completion`; that divergence was deliberately left untouched.
- **Rationale**: with nothing to check there is no evidence to infer a status from. The previous default of `good_standing` recorded a compliance judgement that no inspector had actually made.
- **Backend Finding (read-only; the backend was NOT changed in this work)**:
  - `SanitaryInspection.status_after_inspection` is declared as `models.CharField(max_length=30, choices=SANITARY_STATUS_CHOICES, default=SANITARY_STATUS_GOOD)` in `backend/api/models.py`, without `blank=True`. `SANITARY_STATUS_GOOD` is `"good_standing"`.
  - `SanitaryInspectionCreateSerializer` lists the field in `Meta.fields` with no explicit override, so DRF builds a `ChoiceField` with `required=False` and `allow_blank=False`.
  - Verified directly against the serializer field: a **missing** value raises `SkipField`, so it never reaches `validated_data` and the model default `good_standing` is applied silently; a **blank** `""` is rejected with `'"" is not a valid choice.'`
  - Consequence: the backend cannot distinguish "the inspector chose Good Standing" from "the client omitted the field", and it will not accept an empty string. Both clients therefore block locally rather than sending a blank or omitted status. Tightening the backend (for example making the field explicitly required for non-draft submissions) would be a separate, independently reviewable change.
- **Web Fix** (`frontend/src/sanitation/pages/InspectionManagement.js`):
  - The initial status is `""` when the checklist is empty and no draft status exists. Previously the rule was `if (total === 0 || completed === total) return "good_standing";`; it is now split so that `total === 0` returns `""` while `completed === total` still returns `good_standing`.
  - The Status After Inspection select gains a disabled `"Select status"` placeholder option, rendered only while no status is chosen. It had no placeholder before.
  - `handleSubmit` blocks with "Select the status after inspection." and sends nothing when the status is empty. A saved draft's status is still restored ahead of this rule, unchanged.
- **Mobile Fix** (`mobile/lib/screens/sanitation_screens.dart`, `mobile/lib/widgets/widgets.dart`):
  - `_status` is now `String?` and `_statusForChecks` returns null for an empty checklist instead of `good_standing`.
  - The Inspection status dropdown becomes `DropdownTile<String?>` and shows a "Select status" hint, via a new optional `hint` parameter added to the shared `DropdownTile` widget. The parameter is optional and defaults to null, so every other `DropdownTile` in the app is unaffected.
  - `_submit` blocks with "Select the status after inspection." when no status is chosen. The existing "Update the status for unchecked items." guard is unchanged.
  - The four selectable statuses were extracted from an inline literal into a named `sanitationInspectionStatuses` constant so the tests and the dropdown share one list.
- **Verification (local only)**:
  - Web: 4 new tests in `InspectionManagement.test.js`, 2 of which failed against the pre-fix code. Full frontend suite 149/149 passed across 5 suites (145 before plus the 4 new). `npm run build` compiled successfully.
  - Mobile: 3 new or rewritten tests in `sanitation_inspection_checklist_test.dart`, all 3 of which failed against the pre-fix code. `flutter test` 13/13 passed; `flutter analyze` reported the same 4 pre-existing info-level issues — no new issues.
  - Two existing web tests and one existing mobile test submitted a zero-requirement inspection without choosing a status. They were updated to pick one, because blocking that submission is the intended behaviour change.
  - No production database, API, or production data was touched. The backend was not modified.
- **Not Verified**:
  - Not merged to `main` and not deployed. **A new APK build is still required** for the mobile half to reach users.
  - No real-device or emulator end-to-end test was performed; the mobile form was exercised only through a fake `TourismApi` in widget tests.

### Inspection Management — Phase 1 Data-Integrity Fixes (branch `sanitation/inspection-integrity`, NOT merged, NOT deployed)
- Commits: `353e922`, `db24dd4`, `8e3830c`, `24d8b99`, `dde5ef6`. Branched from `0ff406b`. `origin/main` is unchanged by this work. Each fix has its own commit and its own tests that failed against the pre-fix code.
- **1. Drafts no longer change live records** (`353e922`, `backend/api/services/sanitation.py`):
  - `sync_establishment_after_inspection` ran on every save and never checked `is_draft`. Saving a draft therefore rewrote the establishment's `compliance_status`, mapped a new `permit_status` (a draft marked Violation **suspended the permit**), and raised a violation notification — all before the inspection was finalized.
  - The function now returns early for a draft. The guard sits at the single shared choke point, so it covers the web endpoint, the mobile endpoint, and both create and update. Finalizing a draft (`is_draft` True → False) applies the result exactly once.
  - Tests: `InspectionDraftIsolationTests` (5 tests; 4 failed before the fix), covering web create, web update, mobile create, finalizing, and the unchanged non-draft path.
- **2. No same-day overwrite** (`db24dd4`, `frontend/src/sanitation/pages/InspectionManagement.js`):
  - `isDraftOrRecent` treated **any** inspection dated today as editable, so a second visit on the same day issued a `PUT` over the first inspection and the serializer deleted and recreated its checklist. The first visit's record was lost.
  - Only an unfinished draft is reopened now; a finalized inspection is never overwritten, and a second visit creates a new record. Tests: 3 (1 failed before the fix).
- **3. Real inspector attribution** (`8e3830c`, `InspectionManagement.js`, `ComplaintsManagement.js`):
  - Removed the hard-coded `"Insp. Juan Dela Cruz"` universal fallback and the `inspector_maria`/`inspector_juan` special cases from both pages, the fabricated `"Insp. J. Cruz"` default in the complaint scheduling form, and the `"Insp. Juan Dela Cruz"` fallback printed on complaint reports.
  - Inspections are attributed to the signed-in account: `display_name` (which the API computes as `get_full_name() or username`), else first+last name, else username. Never an invented person.
  - The caption "Logged-in Active Account • Verified Inspector" was replaced with "Signed-in account": nothing in the system verifies inspector status, so the original claim was not backed by data.
  - Remaining occurrences are test fixtures only (`EstablishmentRecords` owner names, the `InspectionManagement.test.js` auth mock) and a `StaffManagement` input placeholder.
  - Tests: 5, all of which failed before the fix.
- **4. Checklists start unchecked** (`24d8b99`, `InspectionManagement.js`):
  - New inspections pre-ticked items from the establishment's previous `compliance_status`: everything for `good_standing`/`upcoming`, and everything except the last item for `for_completion`. An inspector could submit a checklist they never looked at.
  - Every item now starts unchecked. A saved draft still restores the ticks and notes the inspector had already made. The stale warning text ("Status will be auto-set to For Completion…") now describes the rule the form actually applies.
  - Tests: 4 (3 failed before the fix).
- **5. One next-due-date rule everywhere** (`dde5ef6`, backend + web + mobile):
  - **Rule**: annual → +1 year, quarterly → +3 months, monthly → +1 month; an unrecognised frequency yields **no** suggestion rather than a silent +1 month, so a misconfigured business type is visible instead of quietly producing a wrong schedule.
  - **Frequency values that exist**: `monthly`, `quarterly`, `annual` — the three `SANITARY_FREQUENCY_CHOICES` in `backend/api/models.py`, and the only three values in production (7 monthly, 3 quarterly, 6 annual across 16 types, via a read-only bootstrap GET). There is no `annually` spelling anywhere in code or data.
  - **Mobile** had no annual branch at all (`frequency == 'quarterly' ? 3 : 1`), so all 6 annual types got a one-month due date from the phone. It also overflowed at month ends, turning 31 January into **3 March**; the web overflowed the same way. All three layers now clamp to the last real day of the target month.
  - **Backend**: `suggested_next_due_date` and `apply_default_next_due_date` were added to `services/sanitation.py` and wired into both endpoints. When a **final** inspection omits `next_due_date`, it is computed from `establishment.business_type.inspection_frequency`. An explicit value from the client always wins, and drafts are left without a due date. Previously the backend never computed one, so the schedule depended entirely on whichever client happened to submit.
  - Tests: 7 backend (4 red), 6 web (6 red), 5 mobile (3 red).
- **Verification (local only)**:
  - Backend: `Ran 112 tests in 103.650s` / `OK`.
  - Frontend: `Tests: 167 passed, 167 total`, `Test Suites: 5 passed, 5 total`; `npm run build` → `Compiled successfully.`
  - Mobile: `flutter test` 18/18 passed; `flutter analyze` → `4 issues found`, the same 4 pre-existing info-level issues, none new.
  - No production database, API, or production data was changed.
- **Not Verified**: not merged to `main`, not deployed, **a new APK build is still required**, and no real-device or emulator end-to-end test was performed.

### Inspection Management — Phase 2a (branch `sanitation/inspection-phase2a`, NOT merged, NOT deployed)
- Commits: `dacbdb2`, `485f1b0`, `013c954`, `1891c4b`. Branched from `cfb8524`. `origin/main` is unchanged. Mobile was not touched and is byte-identical to `main`.
- **1. Real inspector list in Complaints** (`dacbdb2`):
  - **Existing endpoint investigated and rejected**: `GET /api/sanitation/staff/` (`backend/api/urls.py`, `views/sanitation.py`) is guarded by `@module_required("sanitation")`, so a sanitation-role user may call it. It serializes `SanitaryStaffSerializer`: `id, username, first_name, last_name, full_name, email, is_active, date_joined, role, role_label`. Reusing it for a dropdown would ship staff **email addresses** and account metadata to a widget that needs neither. It also filters `profile__role=ROLE_SANITATION` only, so admin accounts are excluded, and it returns inactive accounts.
  - **New endpoint**: `GET /api/sanitation/inspectors/`, `@module_required("sanitation")`, read-only (`@api_view(["GET"])`). Returns `[{id, name}]` for `is_active=True` users whose `profile.role` is sanitation or admin, `name` being `get_full_name() or username`, ordered by name. Nothing else is exposed.
  - **Tests** (`SanitationInspectorListTests`, 7): the 200 case for a sanitation user; the exact key set `{id, name}` per row, plus assertions that neither `@test.local` nor `date_joined` appears anywhere in the response body; the username fallback for a nameless account; exclusion of an inactive account; 403 for tourism, tourist and establishment roles; 401 for anonymous (DRF's `IsAuthenticated` default runs before the decorator); 405 for POST. 6 failures and 3 errors before the endpoint existed.
  - **Web**: `ScheduleInspectionModal` takes an `inspectors` prop, supplied by the page from the new endpoint, and is exported for testing. The four invented names (`Insp. J. Cruz`, `Insp. M. Santos`, `Insp. R. Dela Pena`, `Insp. E. Alcantara`) are gone. A value already stored on an older record is prepended to the options so history stays readable; an unset value renders a disabled "Select inspector" placeholder; an empty list renders "No inspector accounts available." The stored value remains a plain string — **no migration, no schema change**. 6 web tests, all red before the change.
  - **Grep after the change**: the only remaining occurrences of `Insp. `, `R. Dela Pena` and `E. Alcantara` in `frontend/src` and `mobile/lib` are in the new `ComplaintsManagement.test.js`, where they are the regression assertions that those names are *not* offered, plus the historical-value case. No production code contains them.
- **2. Working pagination** (`485f1b0`, `InspectionManagement.js`): client-side, `ROWS_PER_PAGE = 10`, prev/next disabled at the first and last page, label "Showing N of M | Page X of Y". A `changeFilter` wrapper resets to page 1 whenever the search box or either filter changes, and `Math.min(page, pageCount)` keeps the view valid when the filtered set shrinks. Paging is presentation only: `handleExport` and the due/overdue alert counts still read `filteredRows` and `rows`, so the CSV covers every filtered row. 4 tests, 3 red before the change.
- **3. Inspection history and read-only detail** (`013c954`, `InspectionManagement.js`, `Sanitation_index.css`):
  - **No backend change was needed.** `GET /api/sanitation/inspections/` already returns every inspection, with `select_related` on the establishment and `prefetch_related("checklist_items")`, and `SanitationDataContext` already stores the full list. No filter parameter was added.
  - `InspectionHistoryModal` lists all inspections whose `establishment` matches the row, sorted by `inspection_date` descending, each showing date, inspector, status label, next due, and a "Draft" badge where `is_draft`. `InspectionDetailModal` renders the inspection read-only: inspector, status, next due, findings, remarks, and each checklist item marked "Complied" or "Not complied" with its notes. A test asserts the detail contains zero `input`, `textarea` or `select` elements and neither submit control.
  - 7 tests, all red before the change.
- **4. Completed inspections on the calendar** (`1891c4b`): `buildCalendarEventMap` now also plots finalized inspections on their `inspection_date` as an "Inspected" event (`.calendar-event.completed`), added to the legend. Drafts are skipped, as is any inspection whose establishment is not in the current filtered rows. The existing Upcoming Due and Overdue events are unchanged. The dead `calendarStatusClass` helper and its `eslint-disable no-unused-vars` suppression were deleted. 3 tests, 1 red before the change.
- **Verification (local only)**: backend `Ran 119 tests in 272.155s` / `OK`; frontend `Tests: 187 passed, 187 total`, `Test Suites: 6 passed, 6 total`; `npm run build` → `Compiled successfully.`; `flutter test` 18/18; `flutter analyze` → `4 issues found`, the same 4 pre-existing info-level issues. `git diff origin/main..HEAD -- mobile/` is empty. No production database, API, or production data was touched.
- **Not Verified**: not merged to `main`, not deployed, and the new screens were exercised only through tests — no manual or authenticated UI check was performed. A new APK build is still required for the Phase 1 mobile changes already on `main`.
- **Deliberately deferred (Phase 2b, blocked)**: web photo upload. `validate_image_file` needs magic-byte content sniffing before an upload path is opened on the web endpoint; wiring one up first would widen the attack surface. Photo captions and an inspection delete action in the UI remain missing as well.

### Never-Inspected Establishments Show "Good Standing" (READ-ONLY investigation, NOT fixed)
Investigated on branch `sanitation/inspection-followups`. No code, migration or data was changed.

- **Where the status comes from**, in order of how a record can acquire `good_standing` without ever being inspected:
  1. **Model default** — `SanitaryEstablishment.compliance_status = models.CharField(..., default=SANITARY_STATUS_GOOD)` (`backend/api/models.py:720-724`). Any row created without an explicit value, by a seeder, the permit importer, the Django admin, or a shell/script, starts as Good Standing.
  2. **The register form's base default** — `frontend/src/sanitation/pages/EstablishmentRecords.js:116` still has `compliance_status: "good_standing"` in the blank form object. It is normally overridden: `NEW_ESTABLISHMENT_PERMIT_STATE` (line ~149) sets `compliance_status: "no_permit"` for a newly registered establishment, which is the Establishment Records rule that a new record must not start with an unearned status. So registration through the current web UI is **not** the source.
  3. **"Issue & Generate Permit Now"** — `EstablishmentRecords.js:428-430`: `if (loaded.compliance_status === "no_permit") { loaded.compliance_status = "good_standing"; }`. Issuing a permit promotes the establishment straight to Good Standing even though no inspection has taken place. **This is the most likely path for a record such as "711"**, and it conflates "has a permit" with "found compliant".
  4. **Serializer** — `SanitaryEstablishmentSerializer` exposes `compliance_status` as writable and `compliance_status_label` as read-only; it applies no default of its own, so whatever the client sends, or the model default, wins.
- **What it should show**: the Establishment Records rule already adopted for permits — a new record starts with nothing fabricated. There is currently **no state meaning "never inspected"**. `SANITARY_STATUS_CHOICES` offers only `good_standing`, `upcoming`, `for_completion`, `violation`, `no_permit`; `upcoming` is the closest but means "inspection due soon", which is a schedule, not an absence of history.
- **Where it is displayed** (every one of these would show the new state):
  - Web: `EstablishmentRecords.js` (table column and detail modal), `InspectionManagement.js` (Status column and the history/detail views), `PermitMonitoring.js`, `SanitationDashboard.js`, `SanitaryReportAnalytics.js`, `SanitaryGISMap.js` (marker colour), `SubmissionTracking.js`, `VerifyPermit.js` (public permit verification).
  - Backend aggregates: `services/sanitation.py` — `get_establishment_status_counts`, `get_business_type_counts`, `build_dashboard_business_type_rows`, `build_sanitation_question_answers` (compliance rate, top violation type, barangay risk). A "never inspected" bucket must be excluded from the compliance-rate numerator and denominator rather than counted as compliant.
  - Mobile: `models.dart` (`complianceStatus`, `statusLabel`) and `sanitation_screens.dart` (status chips, the establishment portal's status card, `sanitationStatusColor` / `sanitationStatusLabel`).
- **Proposed minimal fix (NOT implemented, needs approval)**:
  1. Add one choice, `not_yet_inspected` ("Not Yet Inspected"), to `SANITARY_STATUS_CHOICES`, and change the model default from `SANITARY_STATUS_GOOD` to it. **A schema migration is required** (an `AlterField` for both `choices` and `default`); it alters no existing row.
  2. Remove the `no_permit → good_standing` promotion at `EstablishmentRecords.js:428-430` so issuing a permit no longer implies a compliance finding, and drop the stale `compliance_status: "good_standing"` from the blank form object at line 116.
  3. Map the new state in `PERMIT_STATUS_BY_COMPLIANCE`? **No** — leave it out, so a never-inspected establishment's permit status is untouched by it.
  4. Exclude it from the compliance-rate maths in `services/sanitation.py` and give it a neutral colour in the web status classes and `sanitationStatusColor`.
  5. **Existing production rows**: a data migration would be needed to reclassify establishments that have `compliance_status = good_standing` **and** zero related `SanitaryInspection` rows. This is a production data change and should be a separate, separately approved step — it cannot distinguish "never inspected" from "inspected on paper before the system existed", so the client should confirm the intent first.
- **Not investigated**: whether "711" specifically was created by the register form, the permit importer, or a seeder. That would need a production read, which was out of scope here.

### "Not Yet Inspected" Compliance Status (merged to `main` and pushed as `2426b65`; deploy not verified)
- Commits: `a314f7e` (backend), `7132faa` (web), `eb57a77` (mobile). Branched from `9a49d85`. `origin/main` is unchanged.
- Implements the proposal from the earlier read-only investigation. An establishment nobody has inspected previously defaulted to `good_standing`, so it displayed "Good Standing" it had not earned.
- **Model and migration**:
  - `SANITARY_STATUS_NOT_YET_INSPECTED = "not_yet_inspected"` ("Not Yet Inspected") is now the first entry of `SANITARY_STATUS_CHOICES` and the default for `SanitaryEstablishment.compliance_status`.
  - `backend/api/migrations/0035_add_not_yet_inspected_compliance_status.py` holds exactly one operation:
    `AlterField(model_name='sanitaryestablishment', name='compliance_status', field=models.CharField(choices=[...6 choices...], default='not_yet_inspected', max_length=30))`.
  - **Proof it changes no rows**, two ways. (1) Structural: the migration was inspected at runtime — `operations: 1`, `AlterField`, `reduces_to_sql: True`, and `data operations (RunPython/RunSQL): 0`. A field default is applied by Django when a row is created, never retroactively, and an `AlterField` on a `CharField`'s `choices`/`default` emits no `UPDATE`. (2) Empirical: `NotYetInspectedMigrationTests` is a `TransactionTestCase` that migrates to 0034, creates one establishment for each of the five pre-existing statuses, captures `{pk: compliance_status}`, migrates to 0035, and asserts the map is identical, then asserts a row created after the migration does get `not_yet_inspected`.
  - **A second AlterField was deliberately avoided.** `makemigrations` initially also widened `SanitaryInspection.status_after_inspection`, because both fields shared `SANITARY_STATUS_CHOICES` — which would have let an inspector record "Not Yet Inspected" as an inspection *result*. A separate `SANITARY_INSPECTION_RESULT_CHOICES` (the five original values) now backs that field, so its choices are unchanged and the migration touches only the establishment.
  - It is **not** added to `PERMIT_STATUS_BY_COMPLIANCE`, so it never derives a permit status.
- **Aggregates** (`services/sanitation.py`): `get_establishment_status_counts` and `get_business_type_counts` each gained a `not_yet_inspected` count, exposed as `not_yet_inspected` on the dashboard business-type rows, so it is its own bucket wherever counts are shown. `build_sanitation_question_answers` computes `inspected_total = total - not_yet_inspected` and divides the compliance rate by that, so never-inspected establishments sit on neither side of the rate.
- **Web** (`EstablishmentRecords.js`, `SanitaryGISMap.js`, `SanitaryReportAnalytics.js`, `Sanitation_index.css`):
  - Removed the `if (loaded.compliance_status === "no_permit") { loaded.compliance_status = "good_standing"; }` promotion from `openEditModal`, so "Issue & Generate Permit Now" performs an administrative act without inventing an inspection finding.
  - The blank form's `compliance_status: "good_standing"` and `NEW_ESTABLISHMENT_PERMIT_STATE`'s `"no_permit"` are both now `"not_yet_inspected"`, so a newly registered establishment records no finding.
  - **Also removed, beyond the listed scope**: the "Has Permit?" select forced `compliance_status` in both directions — `no` → `no_permit`, `yes` → `good_standing`. Both were deleted, because they are the same fabrication and would have bypassed the `openEditModal` fix entirely. Permit fields and `permit_status` still update as before. Four characterization tests documenting the old forcing were updated.
  - Label and filter option added to Establishment Records, Report Analytics and the GIS map; a neutral slate marker (`#64748b`) in `getMarkerColor`; neutral `not-yet-inspected` styles for `.status-pill`, `.establishment-status`, `.inspection-status`, `.permit-status`, `.permit-compliance`, `.activity-status` and the Report Analytics standing banner. Permit Monitoring, Dashboard, Submission Tracking and VerifyPermit render `compliance_status_label` from the API, so they display the new label without code changes.
- **Mobile** (`helpers.dart`): `sanitationStatusLabel` returns "Not Yet Inspected" and `sanitationStatusColor` returns `AppColors.muted` for it, stated explicitly rather than relying on the fallback.
- **Already-distributed APK behaviour with an unknown status: it does not crash.**
  - `String sanitationStatusLabel(String value) { switch (value) { ... default: return value.isEmpty ? 'Pending' : value; } }` — an unrecognised value is returned verbatim.
  - `Color sanitationStatusColor(String value) { switch (value) { ... default: return AppColors.muted; } }` — an unrecognised value already gets the neutral grey.
  - Better still, `SanitationEstablishment.fromJson` reads `statusLabel: '${json['compliance_status_label'] ?? 'Upcoming'}'`, and the API serializes that field from `get_compliance_status_display()`, so wherever the app shows `statusLabel` an old APK already displays "Not Yet Inspected" correctly. Only direct `sanitationStatusLabel(complianceStatus)` call sites would show `not_yet_inspected` in snake_case until a rebuild.
- **Verification (local only)**: backend `Ran 135 tests in 157.369s` / `OK`; frontend `Tests: 197 passed, 197 total`, `6 suites`; `npm run build` → `Compiled successfully.`; `flutter test` 30/30; `flutter analyze` → `4 issues found`, the same pre-existing info issues. No production database, API, or production data was touched.
- **Not Verified / open**: not merged, not deployed, **a new APK build is required**, and no manual or authenticated UI check was performed. **Existing production rows keep their stored status** — establishments already carrying `good_standing` with no inspections still read Good Standing. Reclassifying them requires a separate data migration and separate client approval, because it cannot distinguish "never inspected" from "inspected before this system existed".

### Establishment Records — Client Meeting Fixes (merged to `main` as `75c2309`; deployed, frequencies verified)
- Commits: `79098e8`, `b966a9d`, `7865f89`, `1aab64f`. Branched from `2426b65`.
- **Client meeting decisions (recorded as stated by the client, in person)**:
  - **Violation levels**: violations use three colour-coded levels. Not implemented yet.
  - **Barangay sanidad accounts**: barangay sanidad staff get individual per-person accounts, not a shared barangay account. Not implemented yet.
  - **Business type**: the business-type field itself stays as it is; only the category mapping and inspection frequencies below were corrected.
  - **Inspection frequencies**: set per the client's form (below).
  - **Sanitary permit number** is the most important field to capture when adding a record ("pinakamahalaga"); permits are valid for one year.
- **Categories**: `businessTypeLabels.js` previously mapped Drug Store and Private Laboratory & Clinic to Institutional Establishment and Massage / Physical Therapy to Commercial / NF. Corrected to Commercial / NF, Public Places and Public Places. Institutional Establishment is intentionally empty until a real schools type exists. Tests assert each client-stated mapping.
- **Frequencies (migration `0036`)**: production before → after (from the public bootstrap GET, read-only):

  | id | Business type | Before | After |
  |---|---|---|---|
  | 8 | Water Refilling Station | monthly | monthly |
  | 9 | Agro-industrial Establishment (Poultry / Piggery Farm) | quarterly | quarterly |
  | 10 | Sub-contractor | annual | **quarterly** |
  | 11 | Restaurant / Food Establishment | monthly | **quarterly** |
  | 12 | Massage / Physical Therapy | quarterly | **annual** |
  | 13 | Public Market Stall | monthly | **quarterly** |
  | 15 | Food Establishment | monthly | **quarterly** |
  | 16 | Commercial Non Food | monthly | monthly (Depends — unchanged) |
  | 17 | Drug Store | annual | annual (Depends — unchanged) |
  | 18 | Resort / Picnic Ground | quarterly | **annual** |
  | 19 | Boatman | annual | **quarterly** |
  | 20 | Funeral Parlor | annual | annual |
  | 21 | Burial Ground | annual | annual |
  | 22 | Private Laboratory & Clinic | annual | annual |
  | 23 | Karaoke / Video Bar / CSW | monthly | **annual** |
  | 24 | Ambulant Food Vendor | monthly | monthly |

  Ids are shown for reference only; the migration matches by name.
- **Permit number at registration**: optional; unique across establishments (case-insensitive, trimmed) at the serializer. The owner claim flow (`establishment_register_view`) is unchanged and still matches by `permit_number__iexact` under `select_for_update()` inside `transaction.atomic()`, returning 409 and writing nothing when any match is already linked; new tests cover a claim of a staff-recorded permit, a rejected second claim, and the row lock. Uniqueness makes the claim unambiguous (previously two records could share a number and the claim took the lowest id).
- **Security note (pre-existing, not changed)**: a claim needs only the permit number, which is printed on the permit displayed at the establishment. Recording real permit numbers therefore makes each unlinked establishment claimable by anyone who reads its permit. Consider a second factor (e.g. a staff-issued claim code) before real permit numbers are entered at scale.
- **Table text**: Establishment Records only (`.establishment-records-table`).
- **Verification**: backend 150 OK; frontend 217/217; build compiled; flutter 30/30; analyze 4 pre-existing infos. Not merged, not deployed, no browser check.

### Production Test-Data Cleanup (2026-09-26)
- Performed on **2026-09-26** by the planner in a direct Supabase SQL session, with explicit user approval, in **one transaction**, after a full JSON backup of every affected row (the backup is kept by the user, not in this repository). Not performed from this codebase or by an automated agent.
- **Deleted**:
  - Inspections 338, 339, 340, 341 and their 35 checklist items.
  - Complaints 96, 97, 104, 105.
  - Notifications 2, 3.
  - Permit renewal 423.
  - Household records 599, 600, 601, 602.
  - Establishment 447 "Moto Shop Ni Manong" (test data recorded under the wrong business type).
- **Updated**: establishments 448 "711" and 449 "Perly'S Sari-Sari Store" → `compliance_status = not_yet_inspected`.
- **Verified afterwards**: 2 establishments; 0 inspections, checklist items, complaints, permit renewals, notifications and household records; tourist records (11) and activity logs (110) untouched. Migration `0035` confirmed applied in production (`django_migrations`).
- **Still open**:
  - 6 complaint photo files remain in Supabase Storage under `media/complaints`; the user is deleting them via the Supabase dashboard.
  - Establishment 449 has `has_permit = false` but `permit_status = active`, and its stored name is "Perly'S" (title-casing artefact). To be fixed through the web UI.

### Security: Sanitation Public Data Exposure (branch `security/sanitation-public-data`, NOT merged, NOT deployed)
- Branch from `75c2309`. Sanitation only: no tourism file, tourism endpoint, tourism screen or shared login behaviour was changed. `backend/api/views/mobile.py` holds both modules; every hunk in it is inside a sanitation function (plus one import).
- Commits: `2a9e5d0` (permit verify), `1e3d4f0` (report history), `35b6749` (staff bootstrap endpoint), `b8f3446` (mobile staff merge), `79fb668` (public bootstrap reduced), `c502222` (claim rate limit). Each has an exploit test that failed against the previous code and passes after.
- **Permit verification** (`/api/mobile/sanitation/permits/verify/`): previously matched a business name or a numeric record id (so records could be enumerated) and returned owner name, contact number, address, coordinates and the permit number. Now matches the permit number only (trimmed, case-insensitive) and returns exactly: `verified`; `establishment` {business_name, business_type_name, barangay, permit_number}; `permit` {permit_number, permit_status, permit_status_label, permit_issued_date, permit_expiry_date}. Web `VerifyPermit.js` and the mobile verification card show only these (the web headline now follows the permit status). The web Establishment Records QR, "Open Verification Page" link and print view used `/verify-permit/<id>`; they now use the URL-encoded permit number, show no QR without a permit number, and printing no longer falls back to the third-party `api.qrserver.com` image service. **Any QR already printed from Establishment Records (id-based) no longer verifies.**
- **Report history** (`/api/mobile/sanitation/reports/history/`): previously either a contact number (partial `icontains`) or a reference returned up to 30 reports. Now both the complaint ID and the exact contact number (digits only, `+63` folded to `0`) are required, returning at most that one report; either missing → 400 with a clear message.
- **Staff bootstrap** (`GET /api/mobile/sanitation/staff-bootstrap/`, `IsAuthenticated` + sanitation module: admin/sanitation roles): establishments, inspections, complaintData, householdRecords and staff notifications in the existing shapes. 401 anonymous; 403 tourism, tourist and establishment roles.
- **Mobile staff app**: after sign-in and on every refresh it loads the staff bootstrap with the stored token and layers it over the public bootstrap (`mergeSanitationStaffRecords`). A 401 clears the stored token and ends the session; a 403 or other failure shows a message. Public screens still use the public bootstrap.
- **Public sanitation bootstrap** (`/api/mobile/sanitation/bootstrap/`): now `businessTypes`, `barangays`, advisory-only `notifications`, with `establishments`, `inspections`, `householdRecords` = `[]` and `complaintData` = `{"summary": {}, "rows": []}` so installed apps still parse it. `dashboardData`/`permitData` (never read by the app) removed.
- **Rate limit**: only `establishment_register_view` (both `/api/auth/register-establishment/` and `/api/mobile/sanitation/register-establishment/`), 5/hour per client, via a `ScopedRateThrottle` subclass with a fixed scope. Counts are kept in a `DatabaseCache` alias `throttle` (table `api_throttle_cache`) so all server processes share them. The table is created by migration `0037_create_throttle_cache_table` (`createcachetable` for that one table only; does nothing if it exists; no-op reverse; no rows touched), because **Render's build command is `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate` — it does not run `backend/build.sh`**. Without the table every claim request would have returned 500; a test drops the table, migrates, and checks claims return 4xx/429, never 500. The default `LocMemCache` used for bootstrap/reference caching is unchanged. `NUM_PROXIES = 1`. Login is not throttled (a test pins this).
- **What an OLD (already-installed) APK loses** after this deploys:
  - Staff app: it never calls the staff bootstrap, so the dashboard counts, establishment list, map pins (establishments and households), Sanitary Permits page, complaint/reports list and staff notifications are **empty**. The establishment inspection form has no establishment to choose, so **establishment inspections cannot be submitted from an old APK**. Household surveys, community reports and permit verification still work. Staff need the new APK.
  - Permit verification card: owner/address were never shown on mobile; the "Compliance Status" row now shows the fallback "Pending" because the server no longer sends a compliance status. Lookups by business name or record id now fail.
  - Report tracker: the old screen accepts either field, but the server now needs both; entering one shows the server's "Enter both the contact number and the complaint ID…" message.
  - Owner claim: more than 5 attempts per hour from one address get HTTP 429 (the app shows the server's throttle message).
  - Unchanged for old APKs: business types, barangays, public advisories, community reporting, the owner portal.
- **Tourism-side findings — reported to the tourism owner, not changed here**:
  - The public tourism bootstrap's notifications list the 4 most recently approved tourist registrations with full name, survey ID and resort; `?contact=` (partial match) or `?reference=` returns another visitor's name.
  - Destination detail `recentFeedback` returns the latest 5 reviews with reviewer name and photos. (Correction to the earlier audit: `FeedbackEntry.status` is a sentiment — positive/neutral/negative — not a moderation state, so there is no "approved" filter to apply; moderation would need a new field.)
  - `referenceTables.resorts` includes entries named "Private Property", "Residence" and "Others / Private Residence" with coordinates.
  - Login is not rate-limited.
- **Verification (local only)**: backend `Ran 172 tests` / `OK`; frontend `224 passed, 224 total` (7 suites); `npm run build` → `Compiled successfully.`; `flutter test` 38/38; `flutter analyze` the same 4 pre-existing info issues.
- **Not verified / open**: not merged, not deployed, **a new APK is required** for staff. `NUM_PROXIES = 1` assumes one proxy hop on Render; if Render adds another hop every client would share one bucket — check after deploy. No authenticated browser or device check was performed.

### Sanitation Public Landing & Community Report (branch `sanitation/public-landing-report`, NOT merged, NOT deployed)
- Branched from `459bce4`. Sanitation app only; no tourism file or shared login code changed. Commits: `b0f2898` (landing page), `d7067cd` (reports require identity), `cba0fde` (report form), `04f2a1f` (upload tests updated for the identity rule).
- **Client decision: no anonymous community reports.** The Sanitary Section will not act on a report it cannot follow up, so every report needs a name and a reachable number.
- **Landing page** (`_buildChooserScreen`): top bar with the logo, "Mauban Sanitary / Municipal Health Office" and a 44px "Staff Sign In" pill (hidden on the web build, as before, because field work runs on the mobile app); heading "Ano ang kailangan mo ngayon?"; two cards — "PARA SA RESIDENTE / Community Report" and "PARA SA MAY-ARI NG NEGOSYO / Establishment Portal" (unchanged destination); all feature chips and the "Municipal Inspector Portal" card removed; an "I-verify ang nakapaskil na permit" link to the existing permit verification screen; footer "Official Mauban LGU e-Service · Sanitary Section".
- **Server rule** (`/api/mobile/sanitation/reports/`): a blank `complainant_name` → 400 "Ilagay ang iyong pangalan. / Please enter your name."; a contact that is not a Philippine mobile number → 400 "Ilagay ang wastong contact number (hal. 09171234567). / Please enter a valid mobile number (e.g. 09171234567)." **Contact rule**: keep digits only, fold a `+63`/`63` prefix (12 digits) to a leading `0`, then it must match `^09\d{9}$`. The contact is stored in that normalised form. Any `is_anonymous`/`anonymous` flag is ignored.
- **Urgency** is unchanged: the app derives it from the category (`sanitationReportCategoryDefinitions`: Contaminated Water Source, Hazardous / Medical Waste, Severe Sewage Overflow → high/Urgent 24–48h; Food Establishment Hygiene, Public Market Sanitation, Public Restroom Maintenance, Pest & Rodents Infestation, Stagnant Water / Mosquito Breeding, Livestock / Poultry Odor, Open Burning of Waste, Improper Garbage Disposal → medium/Standard 3–5 days; Other Sanitation Concern → low 5–7 days) and the server stores the `priority` the app sends. The form no longer lets the reporter pick urgency. **Open**: the server does not derive urgency itself, so a direct API caller could still send any priority.
- **Daily limit** is unchanged: 5 submissions per day, counted on the device (SharedPreferences). There is no server-side limit on public reports.
- **Report form**: header with "Ano ang sakop?" link (the guide still also opens once on arrival); category chips; read-only urgency badge; required barangay; "Lokasyon / Address" with GPS and an optional map (raw latitude/longitude hidden); description max 1000 characters; camera/upload tiles and removable thumbnails; required name and contact; Filipino privacy consent; large submit button, remaining-today line, Save Draft as a text button.
- **Address storage (interim)**: `SanitaryComplaint` has no address field, so the typed location is sent as the first line of the description ("Lokasyon: …"). Drafts keep it in a separate `address` field. A proper `location_address` field on the model would be cleaner.
- **Photos**: the app allows up to 5. The server accepts any number of `photo` files (no cap), so 5 is enforced by the app only.
- **What an OLD APK sees**: an old build still offers "Submit without name". Submitting that way sends `complainant_name: ''`; the server answers 400 and the old app's `_submit` catch block runs `await SanitationDraftStore.upsertReport(_buildDraft());` then `showAppMessage(context, 'Submission failed: ${conciseError(error)}. Draft saved for pending sync.')`, and `conciseError` returns the server's `detail`. So the user sees "Submission failed: Ilagay ang iyong pangalan. / Please enter your name.. Draft saved for pending sync." — no crash. The same happens for a contact that is not 09XXXXXXXXX. Such drafts fail again on every retry until edited; the old app has no format check.
- **Verification (local only)**: backend `Ran 179 tests` / `OK`; frontend `224 passed` (7 suites); build `Compiled successfully.`; `flutter test` 51/51; `flutter analyze` the same 4 pre-existing infos.
- **Not verified**: not merged, not deployed, no new APK, no device test (camera, gallery, GPS and the map were not exercised in tests).
