/**
 * ============================================================================
 * SWAP-IN INTEGRATION POINT
 * ============================================================================
 * This file is the ONLY place the dashboard talks to a "test runner". Right
 * now `runTests()` below is a MOCK — it simulates running each selected
 * module's testcases with random delays and randomized pass/fail/skip
 * results, so the UI (module selection -> progress -> report) works end to
 * end today.
 *
 * When your real automation suite is ready, replace the body of
 * `runTestCase()` (and/or `runTests()` itself) with a real call. This repo's
 * suite lives in automation/ (pytest, see automation/pytest.ini and
 * automation/tests/*.py) — module ids in testConfig.js are the pytest
 * markers, and testcase ids are the test function names, so:
 *
 *   - Simplest: a small backend endpoint that shells out to
 *     `pytest automation/tests -m <moduleId>` (or `-k <testCaseId>` per
 *     testcase) with `--json-report` (pytest-json-report plugin) or
 *     `--junitxml=report.xml`, parses the result file, and returns it in the
 *     Report shape below. The endpoint can run per-module and stream a
 *     `testcase-done` event back after each `pytest -k <id>` call, or run the
 *     whole selection once and report all results at the end.
 *   - Or trigger a CI job (GitHub Actions workflow_dispatch running the same
 *     pytest command) and poll it for status/results.
 *   - Or open a WebSocket/SSE connection to a long-running pytest process
 *     (e.g. via `pytest-jsonreport`'s per-test hooks) and forward events into
 *     `onProgress` as each test finishes.
 *
 * As long as `runTests()` keeps the same signature and return shape, the UI
 * in app.js does not need to change at all.
 *
 * Signature:
 *   runTests(selectedModules, { onProgress }) -> Promise<Report>
 *
 *   selectedModules: Array<Module>   (see testConfig.js for shape)
 *   onProgress(event): called as testcases start/finish, event is one of:
 *     { type: 'module-start',   moduleId }
 *     { type: 'testcase-start', moduleId, testCaseId }
 *     { type: 'testcase-done',  moduleId, testCaseId, status, durationMs }
 *     { type: 'module-done',    moduleId }
 *
 *   Report shape:
 *   {
 *     startedAt: ISOString,
 *     finishedAt: ISOString,
 *     durationMs: number,
 *     totals: { total, passed, failed, skipped },
 *     modules: [
 *       {
 *         id, name,
 *         totals: { total, passed, failed, skipped },
 *         testCases: [
 *           { id, name, status: 'passed'|'failed'|'skipped', durationMs, message? }
 *         ]
 *       }
 *     ]
 *   }
 * ============================================================================
 */

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * MOCK single-testcase execution. Replace this with a real call to your
 * runner (e.g. `await fetch('/api/run-testcase', { method: 'POST', body: ... })`).
 */
async function runTestCase(moduleId, testCase) {
  const durationMs = randomBetween(150, 650);
  await new Promise((resolve) => setTimeout(resolve, durationMs));

  const roll = Math.random();
  let status = "passed";
  let message = null;
  if (roll > 0.93) {
    status = "failed";
    message = "Assertion failed: expected response status 200, got 500";
  } else if (roll > 0.88) {
    status = "skipped";
    message = "Skipped: precondition not met";
  }

  return {
    id: testCase.id,
    name: testCase.name,
    status,
    durationMs,
    message,
  };
}

/**
 * Runs all testcases for the given modules and produces a report.
 * MOCK implementation — see file header for how to wire in a real runner.
 */
async function runTests(selectedModules, { onProgress } = {}) {
  const startedAt = new Date();
  const moduleReports = [];

  for (const mod of selectedModules) {
    onProgress?.({ type: "module-start", moduleId: mod.id });

    const testCaseReports = [];
    for (const tc of mod.testCases) {
      onProgress?.({ type: "testcase-start", moduleId: mod.id, testCaseId: tc.id });
      const result = await runTestCase(mod.id, tc);
      testCaseReports.push(result);
      onProgress?.({
        type: "testcase-done",
        moduleId: mod.id,
        testCaseId: tc.id,
        status: result.status,
        durationMs: result.durationMs,
      });
    }

    const totals = summarize(testCaseReports);
    moduleReports.push({ id: mod.id, name: mod.name, totals, testCases: testCaseReports });
    onProgress?.({ type: "module-done", moduleId: mod.id });
  }

  const finishedAt = new Date();
  const allTestCases = moduleReports.flatMap((m) => m.testCases);

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    totals: summarize(allTestCases),
    modules: moduleReports,
  };
}

function summarize(testCases) {
  return testCases.reduce(
    (acc, tc) => {
      acc.total += 1;
      acc[tc.status] += 1;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, skipped: 0 }
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { runTests };
}
