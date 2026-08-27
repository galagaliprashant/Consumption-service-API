# Test Automation Dashboard

A self-contained, dependency-free (plain HTML/CSS/JS) dashboard: select
test modules, run the suite, get a one-click report.

The module/testcase catalog in `testConfig.js` is seeded from the real
suite in `automation/` (pytest markers = modules, test function names =
testcases). Clicking **Run Selected Tests** executes the *real* pytest
suite via a small local backend (`automation/server.py`) — see "Run it
live" below. If that backend isn't running, the dashboard falls back
automatically to a mock runner (randomized pass/fail with simulated
delays) so the UI still works for a quick look; the badge in the header
shows which mode is active.

## Run it live (real pytest execution)

```
cd automation
pip install -r requirements.txt
cp .env.example .env   # fill in real BASE_URL / AUTH_URL / credentials
python3 server.py      # serves the dashboard + API on http://localhost:5050
```

Open `http://localhost:5050/`, select modules, click **Run Selected
Tests** — the badge reads "Live pytest runner" and each module's testcases
are the actual result of `pytest -m <moduleId>` run against
`automation/tests/`.

## Run it without the backend (mock/demo mode)

No build step, no Python needed. Just open `dashboard/index.html` in a
browser, or serve the folder statically:

```
cd dashboard
python3 -m http.server 8000
# open http://localhost:8000
```

The badge reads "Mock runner" and results are simulated.

## Files

- `testConfig.js` — data-driven catalog of modules and testcases
  (`TEST_MODULES`). Edit this array (or regenerate it from
  `automation/tests/`) to change what shows up in the dashboard.
- `testRunner.js` — calls `automation/server.py`'s `POST /api/run`
  (streamed as Server-Sent Events) for real results, falling back to a
  mock implementation when the backend isn't reachable. Exposes
  `runTests(selectedModules, { onProgress })`; its header comment
  documents the exact input/output contract the UI expects.
- `index.html` / `styles.css` / `app.js` — the UI: module selection with
  select-all, a "Run Selected Tests" button, a live per-module/overall
  progress view, and a final report view (summary counts, per-testcase
  pass/fail/skipped badges, durations) with JSON/CSV export.
- `../automation/server.py` — the backend: serves the dashboard's static
  files and, per selected module, runs `pytest -m <moduleId>
  --junitxml=...` as a subprocess, parses the JUnit XML, and streams
  `testcase-done` events back over SSE. No extra Python dependencies
  beyond what's already in `automation/requirements.txt` (JUnit XML output
  and its parsing are both stdlib/pytest-core).

## Notes on the live integration

- Module ids in `testConfig.js` are the pytest markers declared via
  `@pytest.mark.<id>` in `automation/tests/*.py` (see
  `automation/pytest.ini`), so the dashboard runs `pytest -m <moduleId>`
  directly — no separate mapping to maintain.
- `automation/conftest.py` logs in once per pytest process (session-scoped
  `auth_token` fixture) using `BASE_URL`/`AUTH_URL`/`TEST_USER_EMAIL`/
  `TEST_USER_PASSWORD` from `automation/.env`. Since the server runs one
  pytest process per selected module, each module authenticates
  independently — if credentials are missing/invalid, every testcase in
  that module reports "failed" with the real auth error as its message
  (this is intentionally not swallowed — it reflects a real broken run).
- Each module's subprocess has a 180s timeout
  (`TEST_TIMEOUT_SECONDS` in `server.py`); a timeout is reported as a
  failure for every testcase in that module rather than hanging the UI.
