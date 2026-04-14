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
});
