const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const statsPath = path.join(__dirname, "..", "utils", "stats.js");
const code = fs.readFileSync(statsPath, "utf8");

const sandbox = {
  window: {
    AppConfig: { MONTHS: ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"] },
  },
  Date,
  console,
  Math,
  Number,
  String,
  Set,
  Map,
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const S = sandbox.window.AppStats;

function testNoteUpdateNoProgress() {
  const activities = [
    { id: 1, createdAt: 1735689600, progress: 10, media: { id: 100, duration: 24 } }, // Jan 1, 2025
    { id: 2, createdAt: 1735776000, progress: 10, media: { id: 100, duration: 24 } }, // Jan 2, 2025 - no progress
  ];
  const ids = S.getMediaIdsWithProgressInPeriod(activities, 2025, 1);
  assert.strictEqual(ids.has(100), true);
  const delta = S.computePeriodDeltaFromActivities(activities, 2025, 1);
  assert.strictEqual(delta, 10);
}

function testFutureMonthFiltered() {
  const now = Math.floor(Date.now() / 1000);
  const future = now + 86400 * 40;
  const { items, diagnostics } = S.normalizeActivitiesWithDiagnostics([
    { id: 1, createdAt: future, progress: 3, media: { id: 99, duration: 24 } },
  ], now);
  assert.strictEqual(items.length, 0);
  assert.strictEqual(diagnostics.futureActivitiesFiltered, 1);
}

function testStatusDuplicateCollapse() {
  const entries = [
    { id: 1, status: "PLANNING", updatedAt: 100, progress: 0, score: 0, media: { id: 42 } },
    { id: 2, status: "CURRENT", updatedAt: 90, progress: 3, score: 0, media: { id: 42 } },
  ];
  const out = S.dedupeEntriesByMedia(entries);
  assert.strictEqual(out.items.length, 1);
  assert.strictEqual(out.items[0].status, "CURRENT");
  assert.strictEqual(out.diagnostics.duplicatesCollapsed, 1);
}

function testDeltaCrossYear() {
  const activities = [
    { id: 1, createdAt: 1735603200, progress: 10, media: { id: 7, duration: 24 } }, // 2024-12-31
    { id: 2, createdAt: 1735776000, progress: 13, media: { id: 7, duration: 24 } }, // 2025-01-02
  ];
  const janDelta = S.computePeriodDeltaFromActivities(activities, 2025, 1);
  assert.strictEqual(janDelta, 3);
}

testNoteUpdateNoProgress();
testFutureMonthFiltered();
testStatusDuplicateCollapse();
testDeltaCrossYear();

console.log("stats tests passed");
