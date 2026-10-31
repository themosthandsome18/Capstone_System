# Testing the Android app against your own computer (LAN), without touching live

Use this to try the whole circle on a real phone: **web admin → local database → local server → phone**. Nothing here reads or writes the live site or the
live database. It was used on 2026-10-28 to prove that an edit made in the web admin reaches the phone.

What you need: the laptop and the phone on the **same Wi-Fi**, and the repo on the branch you want to test.

## 1. A local server the phone can reach

`run-local.bat` listens on `127.0.0.1` only, so a phone cannot reach it. It forces a local SQLite file (`backend\data\local_dev.sqlite3`), clears
`DATABASE_URL`, and refuses to start unless Django resolved SQLite. Keep all of that.

1. Copy it, do not edit it: `run-local-lan.bat` = `run-local.bat` with **three** lines changed:
   - the comment on line 3 (say it is a temporary LAN copy);
   - the `echo  Address` line;
   - `runserver 127.0.0.1:%PORT%` → `runserver 0.0.0.0:%PORT%`.
   Check with a diff that nothing else differs. **Never commit it**; delete it afterwards.
2. Pick a free port (8000 may be taken by your usual `run-local.bat`; the test used **8011**).
3. Find the laptop's address on the Wi-Fi: `ipconfig` → "Wireless LAN adapter Wi-Fi" → IPv4 (the test used `192.168.1.6`). It can change (DHCP), so check it every time.
   The Windows Mobile Hotspot adapter is `192.168.137.1`: use that one only if the phone is joined to the laptop's own hotspot.
4. **`ALLOWED_HOSTS` is set in the terminal, not in a file.** Django answers a Host that is not listed with `400`, and `backend/.env` is not to be edited.
   An environment variable wins over `.env`, and it disappears when the terminal closes:

   ```
   set ALLOWED_HOSTS=127.0.0.1,localhost,192.168.1.6
   run-local-lan.bat 8011
   ```
5. Windows Firewall: the Wi-Fi was a **Public** network and an inbound *Allow* rule for `C:\python313\python.exe` already existed, so no new rule was needed.
   If the phone cannot open the address below, an inbound rule for the port is the next thing to try (and to **remove** afterwards):
   `New-NetFirewallRule -DisplayName "Mauban LAN test 8011" -Direction Inbound -Protocol TCP -LocalPort 8011 -Action Allow -Profile Public` (Administrator PowerShell),
   `Remove-NetFirewallRule -DisplayName "Mauban LAN test 8011"`.
6. First try the phone's **browser** (no app yet): `http://192.168.1.6:8011/api/mobile/tourism/bootstrap/`. If JSON (or the Django REST page) appears, the network is fine.

The Android manifest already has `usesCleartextTraffic="true"`, so plain `http://` is allowed in the release build.

## 2. Build the app against it

`apiBaseUrl` is one constant (`mobile/lib/utils/helpers.dart`, `String.fromEnvironment('API_BASE_URL', defaultValue: <live>)`) and `fetchBootstrapRaw` is the only reader of it for
the bootstrap, so `--dart-define` is enough:

```
cd mobile
flutter clean
flutter pub get
flutter build apk --release --flavor tourism --dart-define=API_BASE_URL=http://192.168.1.6:8011/api
```

**Always `flutter clean` first.** On 2026-10-28 a build said "Built" but the `libapp.so` inside the APK was an old one (Gradle reused a stale packaged copy). The build log cannot be
trusted; the check in step 3 can.

`flutter clean` also deletes the APKs in `mobile/build/`. Copy the ones you want to keep **out of `build/`** first.

## 3. Check inside the APK, in every ABI (do this for every APK)

An APK is a zip. `lib/<abi>/libapp.so` holds the compiled Dart and its string constants. Look for what must be there and what must not:

```python
import zipfile
z = zipfile.ZipFile(r"mobile/build/app/outputs/flutter-apk/app-tourism-release.apk")
need = [b"appContent", b"why_visit", b"tappable", b"192.168.1.6"]          # the reader, and the LAN address
bad  = [b"Curated Mauban", b"capstone-backend-stzr.onrender.com"]         # the removed itinerary, and the LIVE address
for name in z.namelist():
    if name.endswith("libapp.so"):
        data = z.read(name)
        print(name, {k.decode(): data.count(k) for k in need + bad})
```

For a **LAN** APK every `need` must be above 0 and every `bad` must be 0. For the normal (**live**) APK swap them: the live address present, `192.168.1.6` absent.
There are three ABIs (`arm64-v8a`, `armeabi-v7a`, `x86_64`); check all three.

Two APKs from the same source can have the **same size** (81,043,177 bytes here), so size says nothing: tell them apart by **SHA-256** and by name. Rename a copy so nobody confuses them
(`MAUBAN-LAN-TEST.apk`).

## 4. Put it on the phone

1. Copy the APK to the phone (USB cable in "File Transfer" mode into `Download`, or your own cloud drive).
2. **Uninstall** the app first (Settings → Apps → Mauban Tourism → Uninstall). The app keeps a copy of the last bootstrap for 7 days; installing over the old app would show that copy first.
3. Open the file from the Files app, allow "install unknown apps" for that app if asked, Install. If Play Protect warns (the release build is signed with the debug key), More details → Install anyway.
4. Open the app. The server window should print one `GET /api/mobile/tourism/bootstrap/ ... 200` for it. If it does not, the app on the phone is not the LAN APK (compare the SHA-256).
   The size in that line is the **gzip** size (about 4.7 KB), not the 25 KB JSON, because the app asks for `gzip`.

## 5. Put everything back

1. Stop the LAN server and close its terminal. Do not touch the usual one on 8000.
2. Delete `run-local-lan.bat`; `git status` must be clean.
3. Remove the firewall rule if you made one.
4. Rebuild the normal APK **without** `--dart-define` (same `flutter clean` first) and run the check of step 3 the other way round (live address present, `192.168.1.6` absent).
5. On the phone: uninstall the LAN app, then install the live APK (same reason as 4.2).
6. Anything written from the phone (registrations, feedback, photos) went to `backend\data\local_dev.sqlite3` and `backend\media\`. Both are ignored by git and are not live. Keep them or delete the SQLite file and run `migrate` again.
