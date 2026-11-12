"""HTTP smoke check against a RUNNING preview backend (read-only except one photo re-read).

    backend\\venv\\Scripts\\python.exe tools\\flutter-preview\\smoke_check.py [--port 8770]
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
from seed import PREVIEW_PASSWORD, PREVIEW_USERNAME  # noqa: E402

results = []


def call(base, method, path, token=None, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(base + path, data=data, method=method)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", f"Token {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail != "" else ""))


def rows(body):
    data = json.loads(body)
    if isinstance(data, list):
        return data
    for key in ("rows", "results", "items"):
        if isinstance(data.get(key), list):
            return data[key]
    return []


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8770)
    base = f"http://127.0.0.1:{parser.parse_args().port}/api"

    s, _, body = call(base, "GET", "/__preview__/status/")
    status = json.loads(body) if s == 200 else {}
    check("preview status endpoint", s == 200 and status.get("preview") is True, s)
    check("effective database is SQLite", status.get("database_engine") == "django.db.backends.sqlite3",
          status.get("database_engine"))
    check("database file is in a capstone-flutter-preview temp folder",
          "capstone-flutter-preview-" in str(status.get("database_file")), status.get("database_file"))
    check("bound to 127.0.0.1", str(status.get("bind", "")).startswith("127.0.0.1:"), status.get("bind"))

    s, _, _ = call(base, "GET", "/mobile/sanitation/bootstrap/")
    check("public sanitation bootstrap", s == 200, s)

    for path in ("/households/records/", "/sanitation/complaints/", "/sanitation/establishments/"):
        s, _, _ = call(base, "GET", path)
        check(f"anonymous {path} refused", s in (401, 403), s)

    s, _, body = call(base, "POST", "/auth/login/",
                      payload={"username": PREVIEW_USERNAME, "password": PREVIEW_PASSWORD})
    token = json.loads(body).get("token") if s == 200 else None
    check("synthetic staff login via /auth/login/", bool(token), s)
    s, _, body = call(base, "POST", "/auth/login/",
                      payload={"username": PREVIEW_USERNAME, "password": "wrong-password"})
    check("wrong password refused", s == 401, s)

    s, _, body = call(base, "GET", "/sanitation/establishments/", token)
    names = [r.get("business_name") for r in rows(body)] if s == 200 else []
    check("staff establishments (4 synthetic)", s == 200 and len(names) == 4
          and all(str(n).startswith("Synthetic") for n in names), (s, len(names)))

    s, _, body = call(base, "GET", "/households/records/", token)
    households = rows(body) if s == 200 else []
    with_coords = [h for h in households if h.get("latitude") is not None]
    check("staff households (4, one without coordinates)",
          s == 200 and len(households) == 4 and len(with_coords) == 3, (s, len(households), len(with_coords)))

    s, _, body = call(base, "GET", "/sanitation/complaints/", token)
    reports = rows(body) if s == 200 else []
    sources = sorted(r.get("location_source") for r in reports)
    check("community reports with three location sources",
          sources == ["reporter_provided", "staff_provided", "unknown"], sources)
    eligible = sorted(r.get("complaint_id") for r in reports if r.get("map_location_eligible"))
    check("only reporter/staff-provided reports are map-eligible",
          eligible == ["SYN-RPT-001", "SYN-RPT-002"], eligible)

    ids = sorted(h["id"] for h in households)
    s, _, body = call(base, "GET", "/mobile/sanitation/bootstrap/")
    names = {b.get("name") for b in json.loads(body).get("barangays", [])} if s == 200 else set()
    check("seeded barangays are reference barangays",
          {h.get("barangay") for h in households} <= names and len(names) >= 4, sorted(names))
    if ids:
        s, headers, body = call(base, "GET", f"/households/records/{ids[0]}/front-photo/", token)
        check("household photo served from fake store",
              s == 200 and headers.get("Content-Type", "").startswith("image/jpeg") and len(body) > 1000,
              (s, headers.get("Content-Type")))
        check("photo response is private/no-store", "no-store" in headers.get("Cache-Control", ""),
              headers.get("Cache-Control"))
        s, _, _ = call(base, "GET", f"/households/records/{ids[0]}/front-photo/")
        check("anonymous photo request refused", s == 401, s)
        s, _, _ = call(base, "GET", f"/households/records/{ids[-1]}/front-photo/", token)
        check("household without photo returns 404", s == 404, s)

    s, _, body = call(base, "GET", "/__preview__/status/")
    status = json.loads(body)
    check("two fake private photos, zero real storage attempts",
          status.get("fake_private_photos") == 2 and status.get("real_private_storage_attempts") == 0,
          (status.get("fake_private_photos"), status.get("real_private_storage_attempts")))

    print(f"\n{sum(results)}/{len(results)} checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
