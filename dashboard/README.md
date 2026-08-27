# Test Automation Dashboard

A self-contained, dependency-free (plain HTML/CSS/JS) dashboard: select
test modules, run the suite, get a one-click report.

**Status:** the module/testcase catalog in `testConfig.js` is seeded from the
real suite in `automation/` (pytest markers = modules, test function names =
testcases), but the test *execution* is currently mocked (random pass/fail
with simulated delays) — there is no real test runner wired in yet. See
"Wiring in your real test suite" below for the one file you need to change.

## Run it

No build step. Just open `dashboard/index.html` in a browser, or serve the
folder statically, e.g.:

```
cd dashboard
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

- `testConfig.js` — data-driven catalog of modules and testcases
  (`TEST_MODULES`). Edit this array (or generate it from your real suite) to
  change what shows up in the dashboard.
- `testRunner.js` — **the integration point.** Exposes `runTests(selectedModules, { onProgress })`.
  Currently a mock; replace its internals with a real call to your test
  automation suite once it exists. The file's header comment documents the
  exact input/output contract the UI expects.
- `index.html` / `styles.css` / `app.js` — the UI: module selection with
  select-all, a "Run Selected Tests" button, a live per-module/overall
  progress view, and a final report view (summary counts, per-testcase
  pass/fail/skipped badges, durations) with JSON/CSV export.

## Wiring in your real test suite

Everything else (checkbox list, progress bars, report rendering, exports)
already works against the shape `runTests()` returns — you only need to
touch `testRunner.js`. Since module ids in `testConfig.js` are the pytest
markers declared in `automation/tests/*.py` (see `automation/pytest.ini`)
and testcase ids are the test function names, the natural mapping is:

1. **Backend endpoint (simplest)**: a small server (Flask/FastAPI/Node)
   that, for a given module id, runs `pytest automation/tests -m <moduleId>
   --json-report` (via the `pytest-json-report` plugin) or
   `--junitxml=report.xml`, parses the output, and returns/streams results
   in the Report shape documented in `testRunner.js`. `fetch()` from
   `runTests()` to that endpoint per module (or once for the whole
   selection).
2. **CI trigger**: call your CI API (e.g. GitHub Actions
   `workflow_dispatch`, passing selected module ids as `-m` marker
   expressions) to kick off a run, then poll for its status/results and
   translate them into the same report shape.

As long as `runTests()` keeps its signature and return shape (documented in
`testRunner.js`), no changes are needed in `app.js` or the HTML/CSS.
