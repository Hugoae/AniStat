import { describe, it, expect } from "vitest";
import {
  dedupeEntriesByMedia,
  normalizeActivitiesWithDiagnostics,
  computePeriodDeltaFromActivities,
  computePeriodAnimeActivityTotals,
  computeDailyDeltasInMonth,
  getMediaIdsWithProgressInPeriod,
  computePeriodProgressByMedia,
  normalizeListScoreToPoint10,
  buildPeriodDeltaAudit,
  collectPeriodWorksStartedEntries,
  collectPeriodWorksCompletedEntries,
  pickSpotlightEntriesFromWorks,
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

  it("aggregates period progress by media including ranges", () => {
    const tMay2 = Math.floor(new Date(2026, 4, 2, 19, 34, 8).getTime() / 1000);
    const tMay3 = Math.floor(new Date(2026, 4, 3, 22, 30, 5).getTime() / 1000);
    const tJune = Math.floor(new Date(2026, 5, 1, 10, 0, 0).getTime() / 1000);
    const acts = [
      { id: 50, createdAt: tMay2, status: "read chapter", progress: "10 - 15", media: { id: 30012, chapters: 706 } },
      { id: 51, createdAt: tMay3, status: "read chapter", progress: "16", media: { id: 30012, chapters: 706 } },
      { id: 52, createdAt: tMay3, status: "read chapter", progress: "1 - 3", media: { id: 400, chapters: 12 } },
      { id: 53, createdAt: tJune, status: "read chapter", progress: "17", media: { id: 30012, chapters: 706 } },
    ];

    const byMedia = computePeriodProgressByMedia(acts, 2026, 5, "manga");

    expect(byMedia.get(30012)).toBe(7);
    expect(byMedia.get(400)).toBe(3);
  });

  it("distant reread range still counts as read chapters", () => {
    const tOld = Math.floor(new Date(2025, 6, 15, 19, 26, 48).getTime() / 1000);
    const tReread = Math.floor(new Date(2026, 3, 15, 12, 16, 41).getTime() / 1000);
    const acts = [
      { id: 30, createdAt: tOld, status: "read chapter", progress: "1 - 43", media: { id: 30012, chapters: 706 } },
      { id: 31, createdAt: tReread, status: "read chapter", progress: "1 - 16", media: { id: 30012, chapters: 706 } },
    ];
    expect(computePeriodDeltaFromActivities(acts, 2026, 4, "manga")).toBe(16);
  });

  it("buildPeriodDeltaAudit returns rows and recomposed total", () => {
    const ts = Math.floor(new Date(2026, 4, 3, 14, 0, 0).getTime() / 1000);
    const acts = [
      { id: 40, createdAt: ts, status: "CURRENT", progress: "61 / 102", media: { id: 501, chapters: 102 } },
    ];
    const audit = buildPeriodDeltaAudit(acts, 2026, 5, "manga");
    expect(audit.totalDelta).toBe(61);
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].rule).toBe("progress");
  });

  it("collectPeriodWorksStartedEntries dedupes by media and respects period", () => {
    const entries = [
      { media: { id: 1, averageScore: 80 }, score: 7, startedAt: { year: 2026, month: 5, day: 1 }, status: "CURRENT" },
      { media: { id: 1, averageScore: 80 }, score: 7, startedAt: { year: 2026, month: 5, day: 2 }, status: "CURRENT" },
      { media: { id: 2, averageScore: 90 }, score: 8, startedAt: { year: 2026, month: 4, day: 1 }, status: "CURRENT" },
    ];
    const started = collectPeriodWorksStartedEntries(entries, 2026, 5);
    expect(started.length).toBe(1);
    expect(started[0].media.id).toBe(1);
  });

  it("pickSpotlightEntriesFromWorks prefers user score then averageScore", () => {
    const entries = [
      { media: { id: 1, averageScore: 99 }, score: 7, startedAt: { year: 2026, month: 5, day: 1 }, status: "CURRENT" },
      { media: { id: 2, averageScore: 70 }, score: 9, startedAt: { year: 2026, month: 5, day: 2 }, status: "CURRENT" },
      { media: { id: 3, averageScore: 95 }, score: 7, startedAt: { year: 2026, month: 5, day: 3 }, status: "CURRENT" },
    ];
    const spot = pickSpotlightEntriesFromWorks(collectPeriodWorksStartedEntries(entries, 2026, 5), 3);
    expect(spot.map((e) => e.media.id)).toEqual([2, 1, 3]);
  });

  it("pickSpotlightEntriesFromWorks uses AniList average when no user scores", () => {
    const entries = [
      { media: { id: 1, averageScore: 70 }, score: 0, startedAt: { year: 2026, month: 3, day: 1 }, status: "CURRENT" },
      { media: { id: 2, averageScore: 92 }, score: 0, startedAt: { year: 2026, month: 3, day: 2 }, status: "CURRENT" },
    ];
    const spot = pickSpotlightEntriesFromWorks(collectPeriodWorksStartedEntries(entries, 2026, 3), 3);
    expect(spot.map((e) => e.media.id)).toEqual([2, 1]);
  });

  it("collectPeriodWorksCompletedEntries only completed in period", () => {
    const entries = [
      { media: { id: 1 }, status: "COMPLETED", completedAt: { year: 2026, month: 4, day: 1 }, score: 8 },
      { media: { id: 2 }, status: "CURRENT", completedAt: { year: 2026, month: 4, day: 1 }, score: 8 },
      { media: { id: 3 }, status: "COMPLETED", completedAt: { year: 2025, month: 4, day: 1 }, score: 8 },
    ];
    const done = collectPeriodWorksCompletedEntries(entries, 2026, 4);
    expect(done.length).toBe(1);
    expect(done[0].media.id).toBe(1);
  });
});
