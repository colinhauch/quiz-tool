import { describe, expect, it } from "vitest";
import { displayNoun } from "./noun.js";
import type { Entity } from "./types.js";

const japan: Entity = { id: "Q17", labels: { en: "Japan" }, types: ["country"] };

describe("displayNoun", () => {
  it("maps a known entity type to its question noun", () => {
    expect(displayNoun(japan)).toBe("country");
  });

  it("resolves from the first known type when an entity carries several", () => {
    expect(displayNoun({ id: "Q1", labels: { en: "X" }, types: ["mystery", "country"] })).toBe("country");
  });

  it("throws for a type with no registered noun", () => {
    expect(() => displayNoun({ id: "Q2", labels: { en: "Y" }, types: ["usState"] })).toThrow(/no display noun/);
  });
});
