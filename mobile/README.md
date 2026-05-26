# Mauban Mobile App

Flutter app for the public Tourism Guide and Community Sanitation Report module.

## Run

From this folder:

```powershell
flutter pub get
flutter run -d chrome -t lib/main.dart
```

Tourism and sanitation can be demonstrated as separate mobile entry points from
the same Flutter codebase:

```powershell
# Tourism mobile app
flutter run -d chrome -t lib/main.dart

# Sanitation mobile app
flutter run -d chrome -t lib/main_sanitation.dart
```

When testing on a physical Android phone, use the laptop IP address for the API base URL:

```powershell
flutter run -d <DEVICE_ID> -t lib/main.dart --dart-define=API_BASE_URL=http://<LAPTOP-IP>:8000/api
flutter run -d <DEVICE_ID> -t lib/main_sanitation.dart --dart-define=API_BASE_URL=http://<LAPTOP-IP>:8000/api
```

When testing on an Android emulator, use:

```powershell
flutter run -d emulator --dart-define=API_BASE_URL=http://10.0.2.2:8000/api
```

For Chrome/web preview while the backend runs locally, the default API URL is:

```text
http://localhost:8000/api
```

## Mobile API Endpoints

Public mobile endpoints are handled by the Django backend:

- `GET /api/mobile/tourism/bootstrap/`
- `GET /api/mobile/tourism/destinations/`
- `GET /api/mobile/tourism/destinations/<resort_id>/`
- `POST /api/mobile/tourism/register-visit/`
- `POST /api/mobile/tourism/feedback/`
- `POST /api/mobile/sanitation/reports/`

Data flow:

```text
Flutter Mobile App -> Django API -> Supabase PostgreSQL -> React Web Admin
```

Tourist registrations appear in the web Booking Management and Arrival Monitoring pages.
Tourist feedback appears in Feedback Monitoring.
Community sanitation reports appear in Complaint Management.

## Current Screens

Tourism entry point:

- Onboarding
- Guest login
- Home dashboard
- Destination directory
- Destination detail
- Interactive OpenStreetMap guide with tappable destination pins
- Visit planner
- Tourist registration
- Tourism feedback
- Community sanitation report
- Notifications
- Profile

Sanitation entry point:

- Sanitary mobile report dashboard
- Community sanitation report form
- Submitted report receipts
