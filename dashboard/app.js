(() => {
  "use strict";

  const modeBadgeEl = document.getElementById("mode-badge");
  const moduleListEl = document.getElementById("module-list");
  const selectAllEl = document.getElementById("select-all");
  const runBtn = document.getElementById("run-btn");
  const selectionSummaryEl = document.getElementById("selection-summary");

  const progressPanel = document.getElementById("progress-panel");
  const progressStatusEl = document.getElementById("progress-status");
  const overallFillEl = document.getElementById("overall-fill");
  const overallLabelEl = document.getElementById("overall-progress-label");
  const moduleProgressListEl = document.getElementById("module-progress-list");

  const reportPanel = document.getElementById("report-panel");
  const summaryCardsEl = document.getElementById("summary-cards");
  const reportMetaEl = document.getElementById("report-meta");
  const reportModulesEl = document.getElementById("report-modules");
  const exportJsonBtn = document.getElementById("export-json-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");

  let lastReport = null;
  let moduleProgressState = {}; // moduleId -> { total, done }
  let overallState = { total: 0, done: 0 };

  function testCaseCount(mod) {
    return mod.testCases.length;
  }

  function renderModuleList() {
    moduleListEl.innerHTML = "";
    for (const mod of TEST_MODULES) {
      const li = document.createElement("li");
      li.className = "module-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = mod.id;
      checkbox.id = `module-${mod.id}`;
      checkbox.addEventListener("change", updateSelectionSummary);

      const body = document.createElement("div");
      body.className = "module-item__body";
      body.innerHTML = `
        <label for="module-${mod.id}" class="module-item__title">
          ${escapeHtml(mod.name)}
          <span class="module-item__count">${testCaseCount(mod)} testcase${testCaseCount(mod) === 1 ? "" : "s"}</span>
        </label>
        <p class="module-item__desc">${escapeHtml(mod.description)}</p>
      `;

      li.appendChild(checkbox);
      li.appendChild(body);
      moduleListEl.appendChild(li);
    }
  }

  function getSelectedModules() {
    const checked = [...moduleListEl.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.value);
    return TEST_MODULES.filter((m) => checked.includes(m.id));
  }

  function updateSelectionSummary() {
    const selected = getSelectedModules();
    const testCaseTotal = selected.reduce((sum, m) => sum + testCaseCount(m), 0);
    selectionSummaryEl.textContent = `${selected.length} module${selected.length === 1 ? "" : "s"} · ${testCaseTotal} testcase${testCaseTotal === 1 ? "" : "s"} selected`;
    runBtn.disabled = selected.length === 0;

    const allBoxes = [...moduleListEl.querySelectorAll("input[type=checkbox]")];
    selectAllEl.checked = allBoxes.length > 0 && allBoxes.every((cb) => cb.checked);
  }

  selectAllEl.addEventListener("change", () => {
    const boxes = [...moduleListEl.querySelectorAll("input[type=checkbox]")];
    boxes.forEach((cb) => (cb.checked = selectAllEl.checked));
    updateSelectionSummary();
  });

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function buildProgressPanel(selectedModules) {
    moduleProgressState = {};
    overallState = { total: 0, done: 0 };
    moduleProgressListEl.innerHTML = "";

    for (const mod of selectedModules) {
      const total = testCaseCount(mod);
      moduleProgressState[mod.id] = { total, done: 0, name: mod.name };
      overallState.total += total;

      const li = document.createElement("li");
      li.className = "module-progress-item";
      li.id = `progress-${mod.id}`;
      li.innerHTML = `
        <div class="module-progress-item__head">
          <span>${escapeHtml(mod.name)}</span>
          <span class="module-progress-item__count" id="progress-count-${mod.id}">0 / ${total}</span>
        </div>
        <div class="module-progress-item__bar">
          <div class="module-progress-item__fill" id="progress-fill-${mod.id}"></div>
        </div>
      `;
      moduleProgressListEl.appendChild(li);
    }

    updateOverallProgress();
  }

  function updateOverallProgress() {
    const pct = overallState.total === 0 ? 0 : Math.round((overallState.done / overallState.total) * 100);
    overallFillEl.style.width = `${pct}%`;
    overallLabelEl.textContent = `${overallState.done} / ${overallState.total}`;
  }

  function setRunnerMode(mode) {
    if (mode === "live") {
      modeBadgeEl.textContent = "Live pytest runner";
      modeBadgeEl.title = "Results come from a real pytest run via automation/server.py";
      modeBadgeEl.classList.remove("badge--mock");
      modeBadgeEl.classList.add("badge--live");
    } else {
      modeBadgeEl.textContent = "Mock runner";
      modeBadgeEl.title = "automation/server.py isn't reachable — showing simulated results";
      modeBadgeEl.classList.remove("badge--live");
      modeBadgeEl.classList.add("badge--mock");
    }
  }

  function handleProgressEvent(event) {
    if (event.type === "runner-mode") {
      setRunnerMode(event.mode);
      return;
    }
    if (event.type === "testcase-done") {
      const state = moduleProgressState[event.moduleId];
      state.done += 1;
      overallState.done += 1;

      const pct = Math.round((state.done / state.total) * 100);
      document.getElementById(`progress-fill-${event.moduleId}`).style.width = `${pct}%`;
      document.getElementById(`progress-count-${event.moduleId}`).textContent = `${state.done} / ${state.total}`;
      updateOverallProgress();
    }
  }

  function renderReport(report) {
    lastReport = report;

    summaryCardsEl.innerHTML = `
      ${statCard(report.totals.total, "Total", "")}
      ${statCard(report.totals.passed, "Passed", "passed")}
      ${statCard(report.totals.failed, "Failed", "failed")}
      ${statCard(report.totals.skipped, "Skipped", "skipped")}
    `;

    const started = new Date(report.startedAt).toLocaleString();
    reportMetaEl.textContent = `Started ${started} · Duration ${(report.durationMs / 1000).toFixed(1)}s`;

    reportModulesEl.innerHTML = "";
    for (const mod of report.modules) {
      const section = document.createElement("div");
      section.className = "report-module";
      section.innerHTML = `
        <div class="report-module__head">
          <span>${escapeHtml(mod.name)}</span>
          <span class="report-module__counts">${mod.totals.passed} passed · ${mod.totals.failed} failed · ${mod.totals.skipped} skipped</span>
        </div>
        <table class="testcase-table">
          <thead>
            <tr><th>Testcase</th><th>Status</th><th>Duration</th></tr>
          </thead>
          <tbody>
            ${mod.testCases
              .map(
                (tc) => `
              <tr>
                <td>
                  ${escapeHtml(tc.name)}
                  ${tc.message ? `<div class="testcase-message">${escapeHtml(tc.message)}</div>` : ""}
                </td>
                <td><span class="status-pill status-pill--${tc.status}">${tc.status}</span></td>
                <td>${tc.durationMs} ms</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
      reportModulesEl.appendChild(section);
    }

    reportPanel.hidden = false;
  }

  function statCard(value, label, variant) {
    return `
      <div class="stat-card${variant ? ` stat-card--${variant}` : ""}">
        <div class="stat-card__value">${value}</div>
        <div class="stat-card__label">${label}</div>
      </div>
    `;
  }

  async function handleRun() {
    const selected = getSelectedModules();
    if (selected.length === 0) return;

    runBtn.disabled = true;
    reportPanel.hidden = true;
    progressPanel.hidden = false;
    progressStatusEl.textContent = "Running…";
    buildProgressPanel(selected);

    const report = await runTests(selected, { onProgress: handleProgressEvent });

    progressStatusEl.textContent = "Complete";
    runBtn.disabled = false;
    renderReport(report);
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    if (!lastReport) return;
    downloadFile(
      `test-report-${lastReport.startedAt}.json`,
      JSON.stringify(lastReport, null, 2),
      "application/json"
    );
  }

  function exportCsv() {
    if (!lastReport) return;
    const rows = [["Module", "Testcase ID", "Testcase Name", "Status", "Duration (ms)", "Message"]];
    for (const mod of lastReport.modules) {
      for (const tc of mod.testCases) {
        rows.push([mod.name, tc.id, tc.name, tc.status, tc.durationMs, tc.message || ""]);
      }
    }
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadFile(`test-report-${lastReport.startedAt}.csv`, csv, "text/csv");
  }

  function csvEscape(value) {
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  runBtn.addEventListener("click", handleRun);
  exportJsonBtn.addEventListener("click", exportJson);
  exportCsvBtn.addEventListener("click", exportCsv);

  renderModuleList();
  updateSelectionSummary();
})();
