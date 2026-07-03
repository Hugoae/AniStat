import { describe, it, expect } from "vitest";
import {
  parseRouteFromParts,
  buildProfilePath,
  buildHomePath,
  parseLegacyHash,
} from "../src/lib/routing";

const CURRENT_YEAR = new Date().getFullYear();

describe("routing — parseRouteFromParts", () => {
  it("home at root", () => {
    expect(parseRouteFromParts("/", "")).toEqual({ type: "home", lang: "fr" });
    expect(parseRouteFromParts("", "")).toEqual({ type: "home", lang: "fr" });
  });

  it("profile overview", () => {
    expect(parseRouteFromParts("/u/Kirikou", "")).toEqual({
      type: "user",
      name: "Kirikou",
      tab: null,
      year: null,
      month: null,
      lang: "fr",
    });
  });

  it("profile with tab in path and period in query", () => {
    const r = parseRouteFromParts("/u/Kirikou/anime", "?year=2024&month=3");
    expect(r).toMatchObject({ type: "user", name: "Kirikou", tab: "anime", year: 2024, month: 3 });
  });

  it("english lang prefix", () => {
    const r = parseRouteFromParts("/en/u/Bob/wrapped", "");
    expect(r).toMatchObject({ type: "user", name: "Bob", tab: "wrapped", lang: "en" });
  });

  it("all-time year 0 is kept", () => {
    expect(parseRouteFromParts("/u/Bob", "?year=0")).toMatchObject({ year: 0 });
  });

  it("invalid tab / month fall back to null", () => {
    expect(parseRouteFromParts("/u/Bob/foo", "")).toMatchObject({ tab: null });
    expect(parseRouteFromParts("/u/Bob", "?month=13")).toMatchObject({ month: null });
    expect(parseRouteFromParts("/u/Bob", "?year=1800")).toMatchObject({ year: null });
  });

  it("legacy `/user/` path segment still parses", () => {
    expect(parseRouteFromParts("/user/Bob", "")).toMatchObject({ type: "user", name: "Bob" });
  });

  it("decodes encoded names", () => {
    expect(parseRouteFromParts("/u/John%20Doe", "")).toMatchObject({ name: "John Doe" });
  });
});

describe("routing — buildProfilePath", () => {
  it("defaults are omitted", () => {
    expect(buildProfilePath("Kirikou")).toBe("/u/Kirikou");
    expect(buildProfilePath("Kirikou", { tab: "overview" })).toBe("/u/Kirikou");
    expect(buildProfilePath("Kirikou", { year: CURRENT_YEAR, month: 0 })).toBe("/u/Kirikou");
  });

  it("tab, year and month are serialized when non-default", () => {
    expect(buildProfilePath("Kirikou", { tab: "anime" })).toBe("/u/Kirikou/anime");
    expect(buildProfilePath("Kirikou", { year: 2020 })).toBe("/u/Kirikou?year=2020");
    expect(buildProfilePath("Kirikou", { month: 5 })).toBe("/u/Kirikou?month=5");
    expect(buildProfilePath("Kirikou", { tab: "manga", year: 2020, month: 5 })).toBe(
      "/u/Kirikou/manga?year=2020&month=5"
    );
  });

  it("all-time year 0 is serialized", () => {
    expect(buildProfilePath("Kirikou", { year: 0 })).toBe("/u/Kirikou?year=0");
  });

  it("english lang prefix", () => {
    expect(buildProfilePath("Kirikou", { lang: "en", tab: "anime" })).toBe("/en/u/Kirikou/anime");
    expect(buildHomePath("en")).toBe("/en");
    expect(buildHomePath("fr")).toBe("/");
  });

  it("round-trips through parseRouteFromParts", () => {
    const path = buildProfilePath("Kirikou", { tab: "manga", year: 2020, month: 5 });
    const [pathname, search] = path.split("?");
    const r = parseRouteFromParts(pathname, search ? `?${search}` : "");
    expect(r).toMatchObject({ type: "user", name: "Kirikou", tab: "manga", year: 2020, month: 5 });
  });
});

describe("routing — parseLegacyHash", () => {
  it("legacy user hash with query", () => {
    expect(parseLegacyHash("#/user/Kirikou?tab=anime&year=2024")).toMatchObject({
      type: "user",
      name: "Kirikou",
      tab: "anime",
      year: 2024,
    });
  });

  it("legacy wrapped suffix", () => {
    expect(parseLegacyHash("#/user/Kirikou/wrapped")).toMatchObject({ tab: "wrapped" });
  });

  it("legacy home hash", () => {
    expect(parseLegacyHash("#/")).toEqual({ type: "home", lang: "fr" });
  });

  it("returns null for non-AniStat hashes", () => {
    expect(parseLegacyHash("#section")).toBeNull();
    expect(parseLegacyHash("")).toBeNull();
  });
});
