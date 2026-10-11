# Dev proxy (read-only)

A small proxy for running the Flutter app in Chrome on your own computer
against the **live** backend.

## Why it exists

Chrome will not let a page on `http://localhost:<port>` read answers from
`https://capstone-backend-stzr.onrender.com`: the backend does not list
localhost in its CORS origins, and it should not. We do not loosen CORS on the
LGU's system for the convenience of development. This proxy runs on your
computer only, forwards the request, and adds the CORS header to the answer.
Nothing on the backend changes.

(On a phone or an emulator there is no CORS check, so this is only for
`flutter run -d chrome`.)

## Run it

Python 3 only, no packages to install (the standard library does everything).
From the repository root:

```
python tools/dev-proxy/proxy.py
```

It listens on `127.0.0.1:8080`, so only this computer can reach it. Options:
`--port 8081`, `--target https://some-other-backend`.

Then, in a second terminal, run the app with the proxy as its API base:

```
cd mobile
flutter run --target lib/main.dart -d chrome --dart-define=API_BASE_URL=http://localhost:8080/api
```

`API_BASE_URL` is the name the app reads (`lib/utils/helpers.dart`), and it
**includes `/api`**; so does the default, `https://capstone-backend-stzr.onrender.com/api`.
The `--dart-define` only changes that one run: the default in the code, and
therefore a built APK, is untouched.

## Why it is read-only

Only `GET` (and the browser's `OPTIONS` preflight) is forwarded. `POST`, `PUT`,
`PATCH`, `DELETE` and `HEAD` are answered `405` by the proxy itself and never
reach the backend, so nothing can be written to the live data from a
development machine by accident (registering a visit, sending feedback, a
sanitation report). Each request is printed in the proxy's terminal, with
"refused, nothing was sent to the backend" on the blocked ones.

Because of that, anything in the app that submits a form will show an error
when run through the proxy. That is intended. To try writes, run the Django
backend locally and point `API_BASE_URL` at it instead.

## What else it does and does not do

- Forwards only paths starting with `/api/` and `/media/`; anything else is 404.
- Does **not** forward the `Authorization` header or cookies, so only the public
  endpoints answer (the tourism bootstrap, destinations). Staff screens will get
  401 here, on purpose: no real visitor or staff record is pulled onto a
  development machine through it.
- Adds `Access-Control-Allow-Origin` only for `localhost`, `127.0.0.1` and
  `[::1]` origins.
- Waits up to 120 s for the backend: the free Render instance can take 50
  seconds or more to wake after being idle.
- Not for production, not for sharing on a network, and not a place for
  business logic.
