"""Read-only local proxy to the live backend, for Flutter web development.

Chrome blocks the app (http://localhost:<port>) from calling the live backend
directly: the backend, rightly, does not allow localhost origins. This proxy
runs on this computer only, forwards GET requests to the backend and adds the
CORS headers on the way back. The backend and its CORS settings are not touched.

    python tools/dev-proxy/proxy.py            # listens on 127.0.0.1:8080

Read-only on purpose: only GET (and the OPTIONS preflight) is forwarded. POST,
PUT, PATCH, DELETE are refused here with 405, so nothing can be written to the
live data from a development machine. The Authorization header and cookies are
not forwarded either, so only the public endpoints answer.

Python standard library only.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_TARGET = "https://capstone-backend-stzr.onrender.com"
LOCAL_ORIGIN = re.compile(r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$")
ALLOWED_PATHS = ("/api/", "/media/")
# Render's free instance can take 50 s or more to wake; do not give up before it.
UPSTREAM_TIMEOUT = 120
# Sent upstream. Everything else, including credentials, is dropped.
FORWARDED_REQUEST_HEADERS = ("Accept", "Accept-Language", "If-None-Match")
# Copied back to the browser.
RETURNED_HEADERS = ("Content-Type", "Cache-Control", "ETag", "Last-Modified")


def make_handler(target):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "mauban-dev-proxy"

        # ---- helpers -------------------------------------------------------
        def _cors(self):
            origin = self.headers.get("Origin", "")
            if LOCAL_ORIGIN.match(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")

        def _send(self, status, body=b"", headers=(), content_type=None):
            self.send_response(status)
            if content_type:
                self.send_header("Content-Type", content_type)
            for name, value in headers:
                self.send_header(name, value)
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, status, message, extra=()):
            body = json.dumps({"detail": message}).encode()
            self._send(status, body, extra, "application/json")

        def _log(self, status, note=""):
            sys.stderr.write(
                "%s  %-7s %-3s %s %s\n"
                % (time.strftime("%H:%M:%S"), self.command, status, self.path, note)
            )

        # ---- methods -------------------------------------------------------
        def do_OPTIONS(self):
            requested = self.headers.get("Access-Control-Request-Headers", "")
            headers = [
                ("Access-Control-Allow-Methods", "GET, OPTIONS"),
                ("Access-Control-Max-Age", "600"),
            ]
            if requested:
                headers.append(("Access-Control-Allow-Headers", requested))
            self._send(204, b"", headers)
            self._log(204, "preflight")

        def do_GET(self):
            if not self.path.startswith(ALLOWED_PATHS):
                self._json(404, "This proxy only forwards /api/ and /media/.")
                self._log(404)
                return
            request = urllib.request.Request(target + self.path, method="GET")
            for name in FORWARDED_REQUEST_HEADERS:
                value = self.headers.get(name)
                if value:
                    request.add_header(name, value)
            request.add_header("Accept-Encoding", "identity")
            request.add_header("User-Agent", "mauban-dev-proxy")
            try:
                with urllib.request.urlopen(request, timeout=UPSTREAM_TIMEOUT) as r:
                    status, body, upstream = r.status, r.read(), r.headers
            except urllib.error.HTTPError as error:
                status, body, upstream = error.code, error.read(), error.headers
            except Exception as error:  # the backend could not be reached
                self._json(502, "Could not reach the backend: %s" % error)
                self._log(502, str(error))
                return
            headers = [(h, upstream[h]) for h in RETURNED_HEADERS if upstream.get(h)]
            self._send(status, body, headers)
            self._log(status, "%d bytes" % len(body))

        def _refuse(self):
            self._json(
                405,
                "Read-only development proxy: only GET is forwarded.",
                [("Allow", "GET, OPTIONS")],
            )
            self._log(405, "refused, nothing was sent to the backend")

        do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = _refuse

        def log_message(self, *args):  # we log ourselves
            pass

    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--target", default=DEFAULT_TARGET)
    args = parser.parse_args()
    target = args.target.rstrip("/")
    # 127.0.0.1 only: not reachable from other machines on the network.
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(target))
    print(
        "Read-only dev proxy: http://localhost:%d  ->  %s   (GET only; Ctrl+C stops)"
        % (args.port, target)
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
