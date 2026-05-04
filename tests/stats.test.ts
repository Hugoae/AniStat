import { describe, it, expect } from "vitest";
import {
  dedupeEntriesByMedia,
  normalizeActivitiesWithDiagnostics,
  computePeriodDeltaFromActivities,
  computePeriodAnimeActivityTotals,
  computeDailyDeltasInMonth,
  getMediaIdsWithProgressInPeriod,
  normalizeListScoreToPoint10,
} from "../src/lib/stats";

describe("stats", () => {
  it("note update without progress delta", () => {
    const activities = [
      { id: 1, createdAt: 1735689600, progress: 10, media: { id: 100, duration: 24 } },
      { id: 2, createdAt: 1735776000, progress: 10, media: { id: 100, duration: 24 } },
    ];
    const ids = getMediaIdsWithProgressInPeriod(activities, 2025, 1, "anime");
    expect(ids.has(100)).toBe(true);
    const delta = computePeriodDeltaFromActivities(activities, 2025, 1, "anime");
    expect(delta).toBe(10);
  });

  it("filters future activities", () => {
    const now = Math.floor(Date.now() / 1000);
    const future = now + 86400 * 40;
    const { items, diagnostics } = normalizeActivitiesWithDiagnostics(
      [{ id: 1, createdAt: future, progress: 3, media: { id: 99, duration: 24 } }],
      now
    );
    expect(items.length).toBe(0);
    expect(diagnostics.futureActivitiesFiltered).toBe(1);
  });

  it("dedupe entries by media prefers higher status", () => {
    const entries = [
      { id: 1, status: "PLANNING", updatedAt: 100, progress: 0, score: 0, media: { id: 42 } },
      { id: 2, status: "CURRENT", updatedAt: 90, progress: 3, score: 0, media: { id: 42 } },
    ];
    const out = dedupeEntriesByMedia(entries);
    expect(out.items.length).toBe(1);
    expect(out.items[0].status).toBe("CURRENT");
    expect(out.diagnostics.duplicatesCollapsed).toBe(1);
  });

  it("delta crosses year boundary", () => {
    const activities = [
      { id: 1, createdAt: 1735603200, progress: 10, media: { id: 7, duration: 24 } },
      { id: 2, createdAt: 1735776000, progress: 13, media: { id: 7, duration: 24 } },
    ];
    const janDelta = computePeriodDeltaFromActivities(activities, 2025, 1, "anime");
    expect(janDelta).toBe(3);
  });

  it("normalize list score from /100 scale", () => {
    expect(normalizeListScoreToPoint10(0)).toBe(0);
    expect(normalizeListScoreToPoint10(80)).toBe(8);
    expect(normalizeListScoreToPoint10(72)).toBe(7.2);
    expect(normalizeListScoreToPoint10(100)).toBe(10);
    expect(normalizeListScoreToPoint10(11)).toBe(1.1);
  });

  it("normalize list score already point10", () => {
    expect(normalizeListScoreToPoint10(8.5)).toBe(8.5);
    expect(normalizeListScoreToPoint10(10)).toBe(10);
    expect(normalizeListScoreToPoint10(7)).toBe(7);
  });

  it("completed movie counts one episode", () => {
    const ts = 1735689600;
    const acts = [
      {
        id: 1,
        createdAt: ts,
        status: "COMPLETED",
        progress: 0,
        media: { id: 900, duration: 90, format: "MOVIE", episodes: 1 },
      },
    ];
    const daily = computeDailyDeltasInMonth(acts, 2025, 1, "anime");
    expect(daily[1]).toBe(1);
    const totals = computePeriodAnimeActivityTotals(acts, 2025, 1);
    expect(totals.episodes).toBe(1);
  });

  it("completed movie uses format when episodes missing", () => {
    const ts = 1735689600;
    const acts = [
      {
        id: 2,
        createdAt: ts,
        status: "COMPLETED",
        progress: null,
        media: { id: 901, duration: 60, format: "MOVIE", episodes: 0 },
      },
    ];
    const daily = computeDailyDeltasInMonth(acts, 2025, 1, "anime");
    expect(daily[1]).toBe(1);
  });

  it("dropped zero progress not counted", () => {
    const ts = 1735689600;
    const acts = [
      {
        id: 3,
        createdAt: ts,
        status: "DROPPED",
        progress: 0,
        media: { id: 902, duration: 24, format: "TV", episodes: 12 },
      },
    ];
    const daily = computeDailyDeltasInMonth(acts, 2025, 1, "anime");
    expect(daily[1] || 0).toBe(0);
  });

  it("manga completed one chapter", () => {
    const ts = 1735689600;
    const acts = [
      {
        id: 4,
        createdAt: ts,
        status: "COMPLETED",
        progress: 0,
        media: { id: 800, chapters: 1 },
      },
    ];
    const daily = computeDailyDeltasInMonth(acts, 2025, 1, "manga");
    expect(daily[1]).toBe(1);
  });

  it("manga progress slash uses current chapter not total (61 / 102)", () => {
    const tsMay3 = Math.floor(new Date(2026, 4, 3, 14, 0, 0).getTime() / 1000);
    const acts = [
      {
        id: 10,
        createdAt: tsMay3,
        status: "CURRENT",
        progress: "61 / 102",
        media: { id: 501, chapters: 102 },
      },
    ];
    expect(computePeriodDeltaFromActivities(acts, 2026, 5, "manga")).toBe(61);
    const daily = computeDailyDeltasInMonth(acts, 2026, 5, "manga");
    expect(daily[3]).toBe(61);
  });

  it("manga progress slash chain sums daily deltas without inflating totals", () => {
    const t1 = Math.floor(new Date(2026, 4, 2, 10, 0, 0).getTime() / 1000);
    const t2 = Math.floor(new Date(2026, 4, 3, 11, 0, 0).getTime() / 1000);
    const acts = [
      {
        id: 11,
        createdAt: t1,
        status: "CURRENT",
        progress: "10 / 100",
        media: { id: 502, chapters: 100 },
      },
      {
        id: 12,
        createdAt: t2,
        status: "CURRENT",
        progress: "61 / 102",
        media: { id: 502, chapters: 102 },
      },
    ];
    expect(computePeriodDeltaFromActivities(acts, 2026, 5, "manga")).toBe(61);
    const daily = computeDailyDeltasInMonth(acts, 2026, 5, "manga");
    expect(daily[2]).toBe(10);
    expect(daily[3]).toBe(51);
  });

  it("overlapping manga progress ranges only count newly reached chapters", () => {
    const tMay2 = Math.floor(new Date(2026, 4, 2, 19, 34, 8).getTime() / 1000);
    const tMay3a = Math.floor(new Date(2026, 4, 3, 22, 30, 5).getTime() / 1000);
    const tMay3b = Math.floor(new Date(2026, 4, 3, 23, 34, 37).getTime() / 1000);
    const acts = [
      {
        id: 20,
        createdAt: tMay2,
        status: "read chapter",
        progress: "424 - 479",
        media: { id: 30012, chapters: 706 },
      },
      {
        id: 21,
        createdAt: tMay3a,
        status: "read chapter",
        progress: "480 - 520",
        media: { id: 30012, chapters: 706 },
      },
      {
        id: 22,
        createdAt: tMay3b,
        status: "read chapter",
        progress: "480 - 540",
        media: { id: 30012, chapters: 706 },
      },
    ];

    const daily = computeDailyDeltasInMonth(acts, 2026, 5, "manga");
    expect(daily[2]).toBe(56);
    expect(daily[3]).toBe(61);
    expect(computePeriodDeltaFromActivities(acts, 2026, 5, "manga")).toBe(117);
  });
});
