import { describe, it, expect } from "vitest";
import {
  buildOverviewRecentActivities,
  mergeRecentActivities,
} from "../src/lib/overviewRecentActivities";

const akiraEntry = {
  media: {
    id: 47,
    title: { english: "Akira", romaji: "AKIRA" },
    coverImage: { medium: "https://example.com/akira.jpg" },
  },
};

describe("overview recent activities", () => {
  const rewatchTs = Math.floor(new Date(2026, 8, 4, 18, 21, 0).getTime() / 1000);

  it("includes a movie rewatch with no progress", () => {
    const rows = buildOverviewRecentActivities({
      animeActivities: [
        {
          id: 1150054371,
          createdAt: rewatchTs,
          status: "rewatched",
          progress: null,
          media: { id: 47 },
        },
      ],
      mangaActivities: [],
      allAnime: [akiraEntry],
      allManga: [],
      year: 2026,
      month: 0,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Akira");
    expect(rows[0].prefix).toBe("Revu ");
    expect(rows[0].isCompleted).toBe(true);
  });

  it("labels rewatched episodes and reread chapters", () => {
    const rows = buildOverviewRecentActivities({
      animeActivities: [
        {
          id: 1,
          createdAt: rewatchTs,
          status: "rewatched episode",
          progress: "1 - 3",
          media: { id: 20 },
        },
      ],
      mangaActivities: [
        {
          id: 2,
          createdAt: rewatchTs - 60,
          status: "reread chapter",
          progress: "4",
          media: { id: 30 },
        },
        {
          id: 3,
          createdAt: rewatchTs - 120,
          status: "reread",
          progress: null,
          media: { id: 31 },
        },
      ],
      allAnime: [
        {
          media: {
            id: 20,
            title: { english: "Series", romaji: "Series" },
            coverImage: { medium: null },
          },
        },
      ],
      allManga: [
        {
          media: {
            id: 30,
            title: { english: "Manga", romaji: "Manga" },
            coverImage: { medium: null },
          },
        },
        {
          media: {
            id: 31,
            title: { english: "Oneshot", romaji: "Oneshot" },
            coverImage: { medium: null },
          },
        },
      ],
      year: 2026,
      month: 0,
    });

    expect(rows.map((row) => row.prefix)).toEqual([
      "Revu Épisodes 1–3 de ",
      "Relu Chapitre 4 de ",
      "Relu ",
    ]);
  });

  it("keeps a whole-title rewatch distinct from earlier progress", () => {
    const merged = mergeRecentActivities(
      buildOverviewRecentActivities({
        animeActivities: [
          {
            id: 2,
            createdAt: rewatchTs,
            status: "rewatched",
            progress: null,
            media: { id: 47 },
          },
          {
            id: 1,
            createdAt: rewatchTs - 60,
            status: "watched episode",
            progress: "1",
            media: { id: 47 },
          },
        ],
        mangaActivities: [],
        allAnime: [akiraEntry],
        allManga: [],
        year: 2026,
        month: 0,
      })
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((row) => row.prefix)).toEqual(["Revu ", "Regardé Épisode 1 de "]);
  });

  it("includes dropped titles without counting them as progress", () => {
    const rows = buildOverviewRecentActivities({
      animeActivities: [
        {
          id: 90,
          createdAt: rewatchTs,
          status: "dropped",
          progress: null,
          media: { id: 47 },
        },
      ],
      mangaActivities: [
        {
          id: 91,
          createdAt: rewatchTs - 30,
          status: "dropped",
          progress: "12",
          media: { id: 30 },
        },
      ],
      allAnime: [akiraEntry],
      allManga: [
        {
          media: {
            id: 30,
            title: { english: "Manga", romaji: "Manga" },
            coverImage: { medium: null },
          },
        },
      ],
      year: 2026,
      month: 0,
    });

    expect(rows.map((row) => row.prefix)).toEqual(["Abandonné ", "Abandonné "]);
    expect(rows.every((row) => row.isCompleted)).toBe(true);
  });

  it("keeps a drop distinct from earlier progress on the same title", () => {
    const merged = mergeRecentActivities(
      buildOverviewRecentActivities({
        animeActivities: [
          {
            id: 92,
            createdAt: rewatchTs,
            status: "dropped",
            progress: null,
            media: { id: 47 },
          },
          {
            id: 91,
            createdAt: rewatchTs - 60,
            status: "watched episode",
            progress: "1 - 3",
            media: { id: 47 },
          },
        ],
        mangaActivities: [],
        allAnime: [akiraEntry],
        allManga: [],
        year: 2026,
        month: 0,
      })
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((row) => row.prefix)).toEqual(["Abandonné ", "Regardé Épisodes 1–3 de "]);
  });
});
