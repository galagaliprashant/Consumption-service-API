/**
 * ============================================================================
 * TEST RUNNER — real pytest backend, with an offline mock fallback
 * ============================================================================
 * `runTests(selectedModules, { onProgress })` first tries the real backend
 * in automation/server.py: POST /api/run streams Server-Sent Events back as
 * each selected module's `pytest -m <moduleId>` run completes, and this file
 * turns those events into the Report shape below.
 *
 * If that backend isn't reachable (server.py isn't running, e.g. you just
 * opened index.html directly), runTests() automatically falls back to a
 * MOCK implementation (randomized pass/fail/skip, simulated delays) so the
 * UI still works for a quick look. An extra 'runner-mode' progress event
 * ({ type: 'runner-mode', mode: 'live' | 'mock' }) tells the UI which one is
 * active — see app.js's handling of the #mode-badge element.
 *
 * To run in live mode: `cd automation && python3 server.py`, then open
 * http://localhost:5050/ (serves this dashboard AND the API from the same
 * origin). See dashboard/README.md and automation/server.py for details.
 *
 * Signature:
 *   runTests(selectedModules, { onProgress }) -> Promise<Report>
 *
 *   selectedModules: Array<Module>   (see testConfig.js for shape)
 *   onProgress(event): called as testcases start/finish, event is one of:
 *     { type: 'runner-mode',     mode: 'live' | 'mock' }
 *     { type: 'module-start',   moduleId }
 *     { type: 'testcase-start', moduleId, testCaseId }   (mock only)
 *     { type: 'testcase-done',  moduleId, testCaseId, status, durationMs, message? }
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

const RUN_ENDPOINT = "/api/run";
const HEALTH_ENDPOINT = "/api/health";

async function runTests(selectedModules, { onProgress } = {}) {
  const startedAt = new Date();
  const live = await backendAvailable();
  onProgress?.({ type: "runner-mode", mode: live ? "live" : "mock" });

  let resultsByModule;
  if (live) {
    try {
      resultsByModule = await runViaBackend(selectedModules, onProgress);
    } catch (err) {
      console.warn("Live pytest backend failed mid-run, falling back to mock runner:", err);
      onProgress?.({ type: "runner-mode", mode: "mock" });
      resultsByModule = await runMock(selectedModules, onProgress);
    }
  } else {
    resultsByModule = await runMock(selectedModules, onProgress);
  }

  return buildReport(selectedModules, resultsByModule, startedAt, new Date());
}

async function backendAvailable() {
  try {
    const res = await fetch(HEALTH_ENDPOINT);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Streams POST /api/run (Server-Sent Events) and collects testcase-done
 * results per module. See automation/server.py for the producing side.
 */
async function runViaBackend(selectedModules, onProgress) {
  const body = JSON.stringify({
    modules: selectedModules.map((m) => ({ id: m.id, testCaseIds: m.testCases.map((tc) => tc.id) })),
  });

  const res = await fetch(RUN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Backend run request failed: HTTP ${res.status}`);
  }

  const resultsByModule = new Map(selectedModules.map((m) => [m.id, []]));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;

      const event = JSON.parse(dataLine.slice(5).trim());
      if (event.type === "testcase-done") {
        resultsByModule.get(event.moduleId)?.push(event);
      }
      onProgress?.(event);
    }
  }

  return resultsByModule;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** MOCK fallback — randomized pass/fail/skip with simulated delays. */
async function runMock(selectedModules, onProgress) {
  const resultsByModule = new Map();

  for (const mod of selectedModules) {
    onProgress?.({ type: "module-start", moduleId: mod.id });
    const results = [];

    for (const tc of mod.testCases) {
      onProgress?.({ type: "testcase-start", moduleId: mod.id, testCaseId: tc.id });

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

      const result = { testCaseId: tc.id, status, durationMs, message };
      results.push(result);
      onProgress?.({ type: "testcase-done", moduleId: mod.id, ...result });
    }

    resultsByModule.set(mod.id, results);
    onProgress?.({ type: "module-done", moduleId: mod.id });
  }

  return resultsByModule;
}

function buildReport(selectedModules, resultsByModule, startedAt, finishedAt) {
  const moduleReports = selectedModules.map((mod) => {
    const results = new Map((resultsByModule.get(mod.id) || []).map((r) => [r.testCaseId, r]));
    const testCases = mod.testCases.map((tc) => {
      const result = results.get(tc.id);
      return {
        id: tc.id,
        name: tc.name,
        status: result?.status ?? "failed",
        durationMs: result?.durationMs ?? 0,
        message: result?.message ?? (result ? null : "No result reported for this testcase"),
      };
    });
    return { id: mod.id, name: mod.name, totals: summarize(testCases), testCases };
  });

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
