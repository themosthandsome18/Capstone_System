"""Loopback-only synthetic Owner Portal API for manual browser CORS checks.

Run with ``py -3 fixture_server.py --mode allowed`` or ``--mode denied``.
Choose ``--port PORT`` explicitly if 8765 is occupied. No request bodies are
logged or persisted.
"""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import socket
from threading import Lock


HOST = "127.0.0.1"
DEFAULT_PORT = 8765
APP_ORIGIN = "http://127.0.0.1:8764"
PATH = "/api/mobile/sanitation/establishment-status/"
FIXTURE = Path(__file__).with_name("fixtures.json")
MAX_BODY_BYTES = 1024


class LoopbackServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


class FixtureHandler(BaseHTTPRequestHandler):
    server_version = "OwnerPortalFixture"
    sys_version = ""

    def log_message(self, _format, *_args):
        # BaseHTTPRequestHandler otherwise logs request paths and headers.
        pass

    def _answer(self, status, payload=None, *, cors=False, preflight=False):
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        if payload is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        if self.server.mode == "allowed":
            self.send_header("Vary", "Origin")
            if cors:
                self.send_header("Access-Control-Allow-Origin", APP_ORIGIN)
                if preflight:
                    self.send_header("Access-Control-Allow-Methods", "POST")
                    self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):
        with self.server.count_lock:
            self.server.options_count += 1
            count = self.server.options_count
        print(f"{self.server.mode} OPTIONS count={count}", flush=True)
        if self.path != PATH:
            self._answer(404)
            return
        allowed = (
            self.server.mode == "allowed"
            and self.headers.get("Origin") == APP_ORIGIN
            and self.headers.get("Access-Control-Request-Method") == "POST"
            and all(
                header.strip().lower() == "content-type"
                for header in self.headers.get("Access-Control-Request-Headers", "").split(",")
            )
        )
        self._answer(204 if allowed else 403, cors=allowed, preflight=allowed)

    def do_POST(self):
        with self.server.count_lock:
            self.server.post_count += 1
            count = self.server.post_count
        print(f"{self.server.mode} POST count={count}", flush=True)
        if self.path != PATH:
            self._answer(404)
            return
        origin = self.headers.get("Origin")
        if self.server.mode == "denied" or origin not in (None, APP_ORIGIN):
            self._answer(403)
            return
        length = self.headers.get("Content-Length", "")
        if not length.isdecimal() or not 0 < int(length) <= MAX_BODY_BYTES:
            self._answer(400, cors=origin == APP_ORIGIN)
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self._answer(415, cors=origin == APP_ORIGIN)
            return
        try:
            submitted = json.loads(self.rfile.read(int(length)))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._answer(400, cors=origin == APP_ORIGIN)
            return
        if not isinstance(submitted, dict) or submitted.get("code") != self.server.fixture["code"]:
            self._answer(404, cors=origin == APP_ORIGIN)
            return
        self._answer(200, self.server.fixture["response"], cors=origin == APP_ORIGIN)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("allowed", "denied"), required=True)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    if fixture.get("code") != "MBN-2222-2222":
        parser.error("fixture must use the synthetic code MBN-2222-2222")
    try:
        server = LoopbackServer((HOST, args.port), FixtureHandler)
    except OSError as exc:
        parser.error(f"cannot bind {HOST}:{args.port}: {exc}; select a free --port explicitly")
    server.mode = args.mode
    server.fixture = fixture
    server.count_lock = Lock()
    server.options_count = 0
    server.post_count = 0
    print(f"Synthetic Owner Portal fixture listening on {HOST}:{args.port} ({args.mode})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print(
            f"Request counts: OPTIONS={server.options_count} POST={server.post_count}",
            flush=True,
        )


if __name__ == "__main__":
    main()
