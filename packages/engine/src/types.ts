/**
 * The pure domain vocabulary. These types mirror the pack format (see
 * `specs/packs/format.md`) closely enough that swapping the fixture pack for
 * the real `core-cities` pack is a data change, not a code change.
 */

/** Display text, keyed by language. MVP is English-only. */
export interface LocalizedText {
  en: string;
}

/**
 * A graph node: a city, a country, etc. `aliases` are display synonyms used
 * for text-input answer matching (see `specs/knowledge-graph/identity.md`);
 * a historical name with dates is a statement, not an alias.
 */
export interface Entity {
  id: string;
  labels: LocalizedText;
  aliases?: Record<string, string[]>;
  types: string[];
}

/** Engine-level literal datatypes. Packs may not add to this set. */
export type Literal =
  | { datatype: "string"; value: string }
  | { datatype: "quantity"; value: number }
  | { datatype: "date"; value: string }
  | { datatype: "dateRange"; value: { start: string; end: string } }
  | { datatype: "boolean"; value: boolean };

/**
 * The object slot is a closed union — a reference to another entity, or a
 * typed literal. The closure is what lets every consumer handle objects
 * exhaustively (see `specs/knowledge-graph/statements.md`).
 */
export type ObjectSlot = { kind: "entity"; id: string } | { kind: "literal"; literal: Literal };

/** The atomic unit of knowledge; every logged answer references one by ID. */
export interface Statement {
  id: string;
  subject: string;
  relation: string;
  object: ObjectSlot;
}

/** Which slot a question conceals. MVP hides the object only. */
export type HiddenSlot = "subject" | "object" | `qualifier:${string}`;

/** Read access into the graph, handed to generators so they can resolve labels. */
export interface GraphQuery {
  getEntity(id: string): Entity;
}

/**
 * What a generator returns for display. It deliberately omits the answer —
 * `GET /question` must never reveal it (see spec #10).
 */
export interface RenderedContent {
  prompt: string;
  input: "text";
}

export interface GeneratorInput {
  statement: Statement;
  hiddenSlot: HiddenSlot;
  graph: GraphQuery;
}

/**
 * Pack-provided code that turns one of this pack's statements into a question.
 * The engine never hard-codes how a fact becomes a question.
 */
export type Generator = (input: GeneratorInput) => RenderedContent;

/**
 * A loaded pack: its entities, its statements, and the per-relation generators
 * that quiz them. The server assembles this from disk; the engine treats it as
 * already-valid data (validate at build/install, trust at runtime).
 */
export interface Pack {
  entities: Map<string, Entity>;
  statements: Statement[];
  generators: Record<string, Generator>;
}

/** A rendered question ready to cross the HTTP seam. Carries no answer. */
export interface RenderedQuestion {
  /** Stable identifier for the card being asked: `<statementId>:<hiddenSlot>`. */
  cardId: string;
  prompt: string;
  input: "text";
}
