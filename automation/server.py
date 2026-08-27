#!/usr/bin/env python3
"""
Dashboard backend: serves the static dashboard and runs the real pytest
automation suite on demand.

Usage:
    cd automation
    pip install -r requirements.txt
    cp .env.example .env   # fill in real BASE_URL/AUTH_URL/credentials
    python3 server.py [port]   # default port 5050

Then open http://localhost:<port>/ — the dashboard's "Run Selected Tests"
button executes real `pytest -m <module>` runs against automation/tests via
POST /api/run (streamed as Server-Sent Events), instead of the built-in
mock. If this server isn't running, the dashboard falls back to the mock
runner automatically (see dashboard/testRunner.js).
"""

import json
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

AUTOMATION_DIR = Path(__file__).resolve().parent
REPO_ROOT = AUTOMATION_DIR.parent
DASHBOARD_DIR = REPO_ROOT / "dashboard"

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}

TEST_TIMEOUT_SECONDS = 180
VALID_ID = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def run_module(module_id, expected_test_ids):
    """Run `pytest -m <module_id>` for real and return a list of
    {testCaseId, status, durationMs, message} for each expected testcase."""

    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
        junit_path = Path(tmp.name)

    stderr_tail = ""
    try:
        proc = subprocess.run(
            [
                sys.executable, "-m", "pytest",
                "tests",
                "-m", module_id,
                f"--junitxml={junit_path}",
                "-q",
            ],
            cwd=AUTOMATION_DIR,
            capture_output=True,
            text=True,
            timeout=TEST_TIMEOUT_SECONDS,
        )
        if proc.returncode not in (0, 1):
            stderr_tail = proc.stderr[-2000:]
        results = _parse_junit(junit_path) if junit_path.exists() else {}
    except subprocess.TimeoutExpired:
        return [
            {
                "testCaseId": tid,
                "status": "failed",
                "durationMs": TEST_TIMEOUT_SECONDS * 1000,
                "message": f"pytest run for module '{module_id}' timed out after {TEST_TIMEOUT_SECONDS}s",
            }
            for tid in expected_test_ids
        ]
    finally:
        junit_path.unlink(missing_ok=True)

    output = []
    for tid in expected_test_ids:
        if tid in results:
            output.append(results[tid])
        else:
            output.append({
                "testCaseId": tid,
                "status": "failed",
                "durationMs": 0,
                "message": stderr_tail or f"No result reported for '{tid}' (pytest may have failed to collect it)",
            })
    return output


def _parse_junit(junit_path):
    tree = ET.parse(junit_path)
    results = {}
    for testcase in tree.getroot().iter("testcase"):
        name = testcase.get("name")
        duration_ms = round(float(testcase.get("time", "0")) * 1000)
        failure = testcase.find("failure")
        error = testcase.find("error")
        skipped = testcase.find("skipped")
        if failure is not None or error is not None:
            node = failure if failure is not None else error
            status = "failed"
            message = (node.get("message") or "").strip() or None
        elif skipped is not None:
            status = "skipped"
            message = (skipped.get("message") or "").strip() or None
        else:
            status = "passed"
            message = None
        results[name] = {
            "testCaseId": name,
            "status": status,
            "durationMs": duration_ms,
            "message": message,
        }
    return results


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        if self.path == "/api/health":
            self._send_json(200, {"status": "ok"})
            return
        self._serve_static()

    def do_POST(self):
        if self.path == "/api/run":
            self._handle_run()
            return
        self.send_error(404)

    def _serve_static(self):
        rel_path = self.path.split("?", 1)[0].lstrip("/") or "index.html"
        file_path = (DASHBOARD_DIR / rel_path).resolve()

        if DASHBOARD_DIR not in file_path.parents and file_path != DASHBOARD_DIR:
            self.send_error(403)
            return
        if not file_path.is_file():
            self.send_error(404)
            return

        content_type = MIME_TYPES.get(file_path.suffix, "application/octet-stream")
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _handle_run(self):
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            modules = payload["modules"]
            for module in modules:
                if not VALID_ID.match(module["id"]):
                    raise ValueError(f"invalid module id: {module['id']!r}")
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            self.send_error(400, f"Bad request: {exc}")
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

        for module in modules:
            self._emit({"type": "module-start", "moduleId": module["id"]})
            results = run_module(module["id"], module["testCaseIds"])
            for result in results:
                self._emit({"type": "testcase-done", "moduleId": module["id"], **result})
            self._emit({"type": "module-done", "moduleId": module["id"]})

    def _emit(self, event):
        try:
            self.wfile.write(f"data: {json.dumps(event)}\n\n".encode("utf-8"))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_json(self, status, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Dashboard + live pytest backend running at http://localhost:{port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
