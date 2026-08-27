import { describe, expect, it } from "vitest";
import { adminHealthSchema, adminPackDetailSchema, adminPackListSchema } from "./admin.js";

describe("adminHealthSchema", () => {
  it("accepts the read-only ok payload", () => {
    expect(adminHealthSchema.parse({ status: "ok", readOnly: true })).toEqual({
      status: "ok",
      readOnly: true,
    });
  });

  it("rejects a payload that claims it can write", () => {
    // readOnly is pinned to `true`: the admin seam cannot describe a writable app.
    expect(() => adminHealthSchema.parse({ status: "ok", readOnly: false })).toThrow();
  });

  it("rejects unknown keys (strict)", () => {
    expect(() => adminHealthSchema.parse({ status: "ok", readOnly: true, extra: 1 })).toThrow();
  });
});

describe("adminPackListSchema", () => {
  it("accepts a list of pack summaries, including packs with no statements", () => {
    const payload = [
      {
        id: "core-geo",
        label: "Core Geography",
        version: "1.0.0",
        license: "CC0-1.0",
        credits: [{ source: "Wikidata", retrieved: "2026-07-25" }],
        statementCount: 0,
        cardCount: 0,
      },
    ];
    expect(adminPackListSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a summary missing counts", () => {
    expect(() =>
      adminPackListSchema.parse([{ id: "x", label: "X", version: "0.0.1" }]),
    ).toThrow();
  });
});

describe("adminPackDetailSchema", () => {
  it("accepts entities and relation groups split defined-here vs asserted", () => {
    const payload = {
      id: "capital-cities",
      label: "Capital Cities",
      version: "0.0.1",
      entities: [],
      relations: [
        {
          relation: "capital",
          definedHere: true,
          statements: [
            {
              id: "cap:japan",
              relation: "capital",
              subject: { id: "Q17", label: "Japan" },
              object: { kind: "entity", entity: { id: "Q1490", label: "Tokyo" } },
              packId: "capital-cities",
            },
          ],
        },
      ],
    };
    expect(adminPackDetailSchema.parse(payload)).toEqual(payload);
  });

  it("accepts a literal object slot", () => {
    const payload = {
      id: "p",
      label: "P",
      version: "0.0.1",
      entities: [],
      relations: [
        {
          relation: "r",
          definedHere: false,
          definedBy: "other-pack",
          statements: [
            {
              id: "s1",
              relation: "r",
              subject: { id: "Q1", label: "One" },
              object: { kind: "literal", literal: "42" },
              packId: "p",
            },
          ],
        },
      ],
    };
    expect(adminPackDetailSchema.parse(payload)).toEqual(payload);
  });
});

