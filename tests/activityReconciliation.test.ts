import { describe, expect, it } from "vitest";
import {
  findOrphanedActivityIds,
  replaceActivityYear,
} from "../src/lib/activityReconciliation";
import type { ActivityItem } from "../src/types/domain";

const activity = (id: number, year: number): ActivityItem => ({
  id,
  createdAt: Math.floor(new Date(year, 5, 15).getTime() / 1000),
  media: { id: id * 10 },
});

describe("activity reconciliation", () => {
  it("finds cached activities deleted from AniList", () => {
    expect(findOrphanedActivityIds([1, 2, 3], [activity(1, 2026), activity(3, 2026)])).toEqual([2]);
  });

  it("replaces only the reconciled year in an all-time cache", () => {
    const result = replaceActivityYear(
      [activity(3, 2026), activity(2, 2026), activity(1, 2025)],
      [activity(4, 2026), activity(3, 2026)],
      2026
    );

    expect(result.map((row) => row.id)).toEqual([4, 3, 1]);
  });

  it("keeps the authoritative year empty when every activity was deleted", () => {
    const result = replaceActivityYear([activity(2, 2026), activity(1, 2025)], [], 2026);

    expect(result.map((row) => row.id)).toEqual([1]);
  });
});
