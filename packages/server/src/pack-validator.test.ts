import type { Entity, Generator, Statement } from "@geo/engine";
import { describe, expect, it } from "vitest";
import type { LoadedPack, PackManifest } from "./pack-loader.js";
import { PackValidationError, validatePacks } from "./pack-validator.js";

const noop: Generator = () => ({ prompt: "?", input: "text" });

function loaded(
  id: string,
  parts: {
    manifest?: Partial<PackManifest>;
    entities?: Entity[];
    statements?: Statement[];
    generators?: Record<string, Generator>;
    dirName?: string;
  } = {},
): LoadedPack {
  return {
    id,
    dirName: parts.dirName ?? id,
    dir: new URL(`file:///packs/${id}/`),
    manifest: { id, version: "0.0.1", labels: { en: id }, ...parts.manifest },
    entities: new Map((parts.entities ?? []).map((e) => [e.id, e])),
    statements: parts.statements ?? [],
    generators: parts.generators ?? {},
  };
}

const tokyo: Entity = { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] };
const japan: Entity = { id: "Q17", labels: { en: "Japan" }, types: ["country"] };

/** An entities-only pack, the `core-geo` shape: no relations, no generators. */
const owner = loaded("core-geo", { entities: [tokyo, japan] });

/** A statement-only pack declaring one relation, the shape every topic pack has. */
function topic(id: string, relationId: string, statementId = "s:1"): LoadedPack {
  return loaded(id, {
    manifest: { relations: { [relationId]: { labels: { en: relationId }, hiddenSlots: ["object"] } } },
    statements: [{ id: statementId, subject: "Q1490", relation: relationId, object: { kind: "entity", id: "Q17" } }],
    generators: { [relationId]: noop },
  });
}

function problemsOf(packs: LoadedPack[]): string[] {
  try {
    validatePacks(packs);
    return [];
  } catch (err) {
    if (err instanceof PackValidationError) return err.problems;
    throw err;
  }
}

describe("the relation registry", () => {
  it("registers each declared relation against the pack that owns it", () => {
    const registry = validatePacks([owner, topic("core-cities", "located_in")]);
    expect(registry.get("located_in")?.packId).toBe("core-cities");
    expect(registry.get("located_in")?.labels.en).toBe("located_in");
  });

  it("defaults hiddenSlots to object-only when a relation declares none", () => {
    const pack = loaded("p", {
      manifest: { relations: { r: { labels: { en: "r" } } } },
      generators: { r: noop },
    });
    expect(validatePacks([pack]).get("r")?.hiddenSlots).toEqual(["object"]);
  });

  it("carries a bidirectional declaration through unchanged", () => {
    const pack = loaded("p", {
      manifest: { relations: { capital: { labels: { en: "capital" }, hiddenSlots: ["object", "subject"] } } },
      generators: { capital: noop },
    });
    expect(validatePacks([pack]).get("capital")?.hiddenSlots).toEqual(["object", "subject"]);
  });
});

describe("relation ids are global", () => {
  // The rule that was documented from the first draft and enforced by nothing,
  // until two packs both claiming `located_in` made every city question render
  // as a continent question (#38).
  it("refuses two packs declaring the same relation, naming both", () => {
    const problems = problemsOf([owner, topic("core-cities", "located_in", "a:1"), topic("continental", "located_in", "b:1")]);
    expect(problems).toContainEqual(
      expect.stringMatching(/relation "located_in" is declared by both "core-cities" and "continental"/),
    );
  });

  it("accepts the same shape once the second pack uses its own relation id", () => {
    expect(() =>
      validatePacks([owner, topic("core-cities", "located_in", "a:1"), topic("continental", "located_in_continent", "b:1")]),
    ).not.toThrow();
  });
});

describe("declarations and generators must agree, both ways", () => {
  it("refuses a declared relation with no generator", () => {
    const pack = loaded("p", { manifest: { relations: { r: { labels: { en: "r" } } } } });
    expect(problemsOf([pack])).toContainEqual(expect.stringMatching(/declares relation "r" but ships no generator/));
  });

  it("refuses a generator for a relation the pack never declared", () => {
    const pack = loaded("p", { generators: { r: noop } });
    expect(problemsOf([pack])).toContainEqual(expect.stringMatching(/ships a generator for "r" but does not declare it/));
  });
});

describe("statements", () => {
  it("refuses a statement whose relation no pack declares", () => {
    const pack = loaded("p", {
      statements: [{ id: "s:1", subject: "Q1490", relation: "undeclared", object: { kind: "entity", id: "Q17" } }],
    });
    expect(problemsOf([owner, pack])).toContainEqual(
      expect.stringMatching(/uses relation "undeclared", which no pack declares/),
    );
  });

  it("refuses a statement id used by two packs", () => {
    const problems = problemsOf([owner, topic("a", "r_a", "dupe"), topic("b", "r_b", "dupe")]);
    expect(problems).toContainEqual(expect.stringMatching(/statement id "dupe" is used by both "a" and "b"/));
  });

  it("refuses a statement referencing a subject no pack owns", () => {
    const pack = loaded("p", {
      manifest: { relations: { r: { labels: { en: "r" } } } },
      statements: [{ id: "s:1", subject: "Q999", relation: "r", object: { kind: "entity", id: "Q17" } }],
      generators: { r: noop },
    });
    expect(problemsOf([owner, pack])).toContainEqual(expect.stringMatching(/references subject Q999, which no pack owns/));
  });

  it("refuses a statement referencing an object no pack owns", () => {
    const pack = loaded("p", {
      manifest: { relations: { r: { labels: { en: "r" } } } },
      statements: [{ id: "s:1", subject: "Q1490", relation: "r", object: { kind: "entity", id: "Q999" } }],
      generators: { r: noop },
    });
    expect(problemsOf([owner, pack])).toContainEqual(expect.stringMatching(/references object Q999, which no pack owns/));
  });

  it("accepts a literal object without demanding it resolve to an entity", () => {
    const pack = loaded("p", {
      manifest: { relations: { pop: { labels: { en: "population" } } } },
      statements: [
        { id: "s:1", subject: "Q1490", relation: "pop", object: { kind: "literal", literal: { datatype: "quantity", value: 37 } } },
      ],
      generators: { pop: noop },
    });
    expect(() => validatePacks([owner, pack])).not.toThrow();
  });
});

describe("entities and manifests", () => {
  it("refuses a Q-ID owned by two packs instead of unioning", () => {
    expect(problemsOf([owner, loaded("other", { entities: [japan] })])).toContainEqual(
      expect.stringMatching(/entity Q17 is owned by both "core-geo" and "other"/),
    );
  });

  it("refuses a manifest id that disagrees with its directory name", () => {
    const pack = loaded("stated-id", { dirName: "actual-dir" });
    expect(problemsOf([pack])).toContainEqual(
      expect.stringMatching(/directory "actual-dir" declares id "stated-id"/),
    );
  });

  it("refuses an unknown hidden slot", () => {
    const pack = loaded("p", {
      manifest: { relations: { r: { labels: { en: "r" }, hiddenSlots: ["qualifier:when"] } } },
      generators: { r: noop },
    });
    expect(problemsOf([pack])).toContainEqual(expect.stringMatching(/unknown hidden slot "qualifier:when"/));
  });

  it("refuses an unknown question kind", () => {
    const pack = loaded("p", {
      manifest: { relations: { r: { labels: { en: "r" }, kind: "multipleChoice" } } },
      generators: { r: noop },
    });
    expect(problemsOf([pack])).toContainEqual(expect.stringMatching(/unknown question kind "multipleChoice"/));
  });
});

describe("error reporting", () => {
  // An author who has just written a pack wants the whole list, not one error
  // per run — so problems accumulate rather than throwing on the first.
  it("collects every problem instead of stopping at the first", () => {
    const broken = loaded("broken", {
      manifest: { relations: { declared: { labels: { en: "d" } } } },
      generators: { undeclared: noop },
      statements: [{ id: "s:1", subject: "Q999", relation: "nope", object: { kind: "entity", id: "Q998" } }],
    });
    expect(problemsOf([broken]).length).toBeGreaterThanOrEqual(4);
  });

  it("names the offending pack in the thrown message", () => {
    expect(() => validatePacks([loaded("p", { generators: { r: noop } })])).toThrow(/pack "p"/);
  });
});
