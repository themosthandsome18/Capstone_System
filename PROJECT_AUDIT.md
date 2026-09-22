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
  - `703533a` was pushed to `origin/main` as a fast-forward from `2e14a30`; `origin/main` points to `703533a`.
  - No manual deployment was performed. No production database modification was performed.
- **Production Deployed-Build Verification**:
  - Production frontend `https://capstone-frontend-ohuj.onrender.com/` returned HTTP 200 and loads the production backend API `https://capstone-backend-stzr.onrender.com/api`.
  - Backend `/api/health/` returned HTTP 200 with status ok.
  - The deployed frontend bundle was inspected: deployed `EstablishmentRecords.js` and `businessTypeLabels.js` matched the Phase 1 versions from `703533a` and differed from `2e14a30`; deployed CSS matched the Phase 1 local build byte-for-byte.
  - Phase 1 markers and all 9 approved Business Type categories were found in the deployed bundle. No `GPS` wording was present in the deployed Establishment Records build.
  - This provides strong evidence that the Phase 1 frontend implementation from `703533a` is live.
- **Limitation — Authenticated UI Behavior Not Verified**:
  - The verification above establishes what build is deployed; it does not establish authenticated UI behavior in production.
  - Authenticated production Establishment Records UI behavior was **not** manually verified. No staff credentials were used.
  - No production establishment was created, edited, issued a permit, or otherwise modified during verification.
  - The authenticated production workflow is therefore **not** considered fully verified.
