import { describe, expect, it } from "vitest";
import {
  adminEntityDetailSchema,
  adminGeneratorPreviewSchema,
  adminGraphHealthReportSchema,
  adminHealthSchema,
  adminPackDetailSchema,
  adminPackListSchema,
} from "./admin.js";

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

describe("adminEntityDetailSchema", () => {
  it("accepts an entity with coordinate and statements it's subject/object of", () => {
    const payload = {
      id: "Q1490",
      label: "Tokyo",
      aliases: [],
      types: ["city"],
      ownerPackId: "core-geo",
      ownerPackLabel: "Core Geography",
      coordinate: { lat: 35.6, lon: 139.7 },
      statements: [
        {
          id: "cc:tokyo-japan",
          relation: "located_in",
          role: "subject",
          subject: { id: "Q1490", label: "Tokyo" },
          object: { kind: "entity", entity: { id: "Q17", label: "Japan" } },
          packId: "core-cities",
        },
      ],
    };
    expect(adminEntityDetailSchema.parse(payload)).toEqual(payload);
  });

  it("omits owner and coordinate when unknown", () => {
    const payload = {
      id: "Q1",
      label: "One",
      aliases: [],
      types: [],
      statements: [],
    };
    expect(adminEntityDetailSchema.parse(payload)).toEqual(payload);
  });
});

describe("adminGraphHealthReportSchema", () => {
  it("accepts a report with per-check counts and drill-down items", () => {
    const payload = {
      checks: [
        {
          id: "orphaned-entities",
          label: "Orphaned entities",
          count: 1,
          items: [{ targetType: "entity", targetId: "Q999", detail: "in no statement" }],
        },
        {
          id: "uncovered-statements",
          label: "Uncovered statements",
          count: 0,
          items: [],
        },
      ],
    };
    expect(adminGraphHealthReportSchema.parse(payload)).toEqual(payload);
  });
});

describe("adminGeneratorPreviewSchema", () => {
  it("accepts a quizzable card with a rendered prompt", () => {
    const payload = {
      statementId: "cc:tokyo-japan",
      relation: "located_in",
      packId: "core-cities",
      packLabel: "Core Cities",
      provenance: "Core Cities",
      cards: [
        {
          hiddenSlot: "object",
          quizzable: true,
          prompt: "What country is Tokyo in?",
          questionKind: "text",
          correctAnswer: "Japan",
        },
      ],
    };
    expect(adminGeneratorPreviewSchema.parse(payload)).toEqual(payload);
  });

  it("accepts a non-quizzable card with a reason instead of a prompt", () => {
    const payload = {
      statementId: "s1",
      relation: "unquizzed",
      packId: "p",
      packLabel: "P",
      provenance: "P",
      cards: [{ hiddenSlot: "object", quizzable: false, reason: "relation has no generator" }],
    };
    expect(adminGeneratorPreviewSchema.parse(payload)).toEqual(payload);
  });
});
