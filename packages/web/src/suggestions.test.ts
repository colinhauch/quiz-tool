import type { EntitySummary } from "@geo/contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSuggestionCache,
  filterSuggestions,
  loadSuggestionEntities,
  MAX_SUGGESTIONS,
} from "./suggestions.js";

const entity = (id: string, label: string, aliases: string[] = []): EntitySummary => ({
  id,
  label,
  aliases,
});

const withDisplay = (id: string, label: string, autocomplete: string, aliases: string[] = []): EntitySummary => ({
  id,
  label,
  aliases,
  autocomplete,
});

const cities = [
  entity("Q1", "Cairo"),
  entity("Q2", "Canberra"),
  entity("Q3", "Caracas"),
  entity("Q4", "Brasília"),
  entity("Q5", "Bern"),
  entity("Q6", "São Paulo", ["Sampa"]),
];

describe("filterSuggestions", () => {
  it("shows nothing for an empty box", () => {
    expect(filterSuggestions("", cities)).toEqual([]);
  });

  it("matches on a normalized substring, ignoring case", () => {
    expect(filterSuggestions("cai", cities).map((e) => e.label)).toEqual(["Cairo"]);
    expect(filterSuggestions("CAI", cities).map((e) => e.label)).toEqual(["Cairo"]);
  });

  it("matches accented names when the input has no accents", () => {
    expect(filterSuggestions("brasi", cities).map((e) => e.label)).toEqual(["Brasília"]);
    expect(filterSuggestions("sao paulo", cities).map((e) => e.label)).toEqual(["São Paulo"]);
  });

  it("finds a name by a fragment from its middle", () => {
    expect(filterSuggestions("sili", cities).map((e) => e.label)).toEqual(["Brasília"]);
  });

  it("ranks names that start with the input above mid-string matches", () => {
    // "Bern" starts with "ber"; "Canberra" only contains it.
    expect(filterSuggestions("ber", cities).map((e) => e.label)).toEqual(["Bern", "Canberra"]);
  });

  it("matches an alias, not just the canonical label", () => {
    expect(filterSuggestions("sampa", cities).map((e) => e.label)).toEqual(["São Paulo"]);
  });

  it("respects a custom minimum-characters threshold", () => {
    expect(filterSuggestions("ca", cities, { minChars: 3 })).toEqual([]);
    expect(filterSuggestions("cai", cities, { minChars: 3 }).map((e) => e.label)).toEqual(["Cairo"]);
  });

  it("caps the number of suggestions returned", () => {
    const many = Array.from({ length: 20 }, (_, i) => entity(`M${i}`, `Match ${i}`));
    expect(filterSuggestions("match", many)).toHaveLength(MAX_SUGGESTIONS);
    expect(filterSuggestions("match", many, { limit: 2 })).toHaveLength(2);
  });

  // A verbose currency label carries a short `autocomplete` form; both the label
  // (the country adjective) and the short noun must find it.
  const currencies = [
    withDisplay("Q4595", "Seychellois rupee", "rupee", ["rupee", "rupees", "SCR"]),
    withDisplay("Q80524", "Indian rupee", "rupee", ["rupee", "rupees", "INR"]),
    withDisplay("Q4917", "United States dollar", "dollar", ["dollar", "dollars", "USD"]),
  ];

  it("matches an entity by its short autocomplete form", () => {
    expect(filterSuggestions("dollar", currencies).map((e) => e.id)).toEqual(["Q4917"]);
  });

  it("still matches on the verbose label the short form replaces", () => {
    // Typing the country adjective, not the noun, still surfaces it.
    expect(filterSuggestions("seych", currencies).map((e) => e.id)).toEqual(["Q4595"]);
  });

  it("de-duplicates suggestions that share a display string", () => {
    // Two rupees both display "rupee": one row, not two. First match wins.
    const result = filterSuggestions("rupee", currencies);
    expect(result.map((e) => e.autocomplete)).toEqual(["rupee"]);
    expect(result).toHaveLength(1);
  });
});

describe("loadSuggestionEntities", () => {
  afterEach(() => {
    clearSuggestionCache();
    vi.restoreAllMocks();
  });

  function stubEntities(byType: Record<string, EntitySummary[]>) {
    const fetchMock = vi.fn((url: string) => {
      const type = new URL(url, "http://x").searchParams.get("type") ?? "";
      return Promise.resolve({ json: async () => byType[type] ?? [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("fetches each type at most once per session", async () => {
    const fetchMock = stubEntities({ city: [entity("Q1", "Cairo")] });
    await loadSuggestionEntities(["city"]);
    await loadSuggestionEntities(["city"]);
    const cityCalls = fetchMock.mock.calls.filter(([url]) => (url as string).includes("type=city"));
    expect(cityCalls).toHaveLength(1);
  });

  it("unions multiple types and de-duplicates by id", async () => {
    stubEntities({
      city: [entity("Q1", "Cairo"), entity("Q9", "Shared")],
      country: [entity("Q9", "Shared"), entity("Q2", "Egypt")],
    });
    const result = await loadSuggestionEntities(["city", "country"]);
    expect(result.map((e) => e.id).sort()).toEqual(["Q1", "Q2", "Q9"]);
  });
});
