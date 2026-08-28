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
 *
 * `autocomplete` is the short form the answer box *shows and fills* when this
 * entity is a suggestion, for entities whose canonical `labels.en` is too
 * verbose to type ("Seychellois rupee" → "rupee", "United States dollar" →
 * "dollar"). The label stays the canonical answer — it is what feedback reveals
 * and what grading targets — so the `autocomplete` string MUST also be an
 * accepted name (an alias), or picking it would fill a value the grader rejects.
 * Absent for entities whose label is already the natural short answer.
 */
export interface Entity {
  id: string;
  labels: LocalizedText;
  aliases?: Record<string, string[]>;
  autocomplete?: string;
  types: string[];
  /**
   * Where this entity sits on a map. Intrinsic entity identity — a field,
   * like `labels`, not a statement — used to drive map visual aids at reveal
   * time. Optional: an entity without one simply gets no map.
   */
  coordinate?: { lat: number; lon: number };
  /**
   * Regional land geometry for this entity's neighbourhood, in raw lon/lat
   * (WGS84). Clipped from Natural Earth 50m land once at import (spec #152,
   * #154) to the `regionExtent` window and stored here beside `coordinate` —
   * never computed per request. It is the higher-resolution overlay the reveal
   * map zooms into. Present only when `coordinate` is; paired with
   * `regionExtent`, the window it was clipped to.
   */
  localGeoJSON?: GeoMultiPolygon;
  /** The lon/lat window `localGeoJSON` was clipped to (spec #152, #154). */
  regionExtent?: RegionExtent;
}

/**
 * An axis-aligned lon/lat rectangle: the target `viewBox` the reveal map zooms
 * to. Centered on an entity's coordinate, sized by entity type — tight for a
 * city, roughly-country for a country, wide for a continent (spec #152).
 */
export interface RegionExtent {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * A GeoJSON MultiPolygon geometry in raw lon/lat (WGS84) — nothing is
 * pre-projected, so the client projects it with the same point math it uses
 * for the pin. `coordinates` is `[polygon][ring][vertex][lon, lat]`; within a
 * polygon, ring 0 is the outer boundary and any later rings are holes.
 */
export interface GeoMultiPolygon {
  type: "MultiPolygon";
  coordinates: number[][][][];
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

/**
 * The atomic unit of knowledge; every logged answer references one by ID.
 *
 * `pack` is the one field that is not on disk: the loader stamps it as it
 * reads, so provenance is resolved once, by the side that knows it, rather
 * than inferred downstream. It is required rather than optional so the runtime
 * never has to ask whether a statement knows where it came from — the earlier
 * arrangement guessed the pack from the `id` prefix in the UI, and mislabelled
 * 193 of 199 statements because two packs share the `cc:` prefix (#40).
 */
export interface Statement {
  id: string;
  subject: string;
  relation: string;
  object: ObjectSlot;
  /** The id of the pack that authored it. Stamped at load; never on disk. */
  pack: string;
}

/**
 * What the graph remembers about a pack it absorbed: enough to say where a
 * question came from, and enough to describe the pack to a learner choosing
 * between them. The pack's *data* has been merged away by the time this is
 * read; this is what survives of its identity.
 *
 * Everything past `labels` is descriptive text the engine never interprets —
 * it comes off `pack.json` and goes to the picker unchanged. It lives here so
 * the assembled graph stays the single thing the server needs to answer both
 * "where did this question come from" and "what can I be quizzed on".
 */
export interface PackInfo {
  id: string;
  labels: LocalizedText;
  version: string;
  descriptions?: LocalizedText;
  license?: string;
  credits?: { source: string; retrieved: string }[];
}

/**
 * Which slot a question conceals. Object- and subject-hiding are implemented;
 * which a relation supports is declared per-relation (see `Pack.hiddenSlots`).
 * Qualifier-hiding is reserved but unbuilt.
 */
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
  /**
   * The packs that went into this graph, keyed by id — the only place a pack's
   * own identity survives assembly. Read to label a question with where it came
   * from; a statement's `pack` is the key.
   */
  packs: Map<string, PackInfo>;
  /**
   * Which hidden slots each relation can be quizzed on, keyed by relation id.
   * A relation absent here (or the whole map omitted) is object-hidden only —
   * the MVP default — so packs that never quiz the subject need declare nothing.
   * A bidirectional relation like `capital` lists `["object", "subject"]`.
   */
  hiddenSlots?: Record<string, HiddenSlot[]>;
}

/** A rendered question ready to cross the HTTP seam. Carries no answer. */
export interface RenderedQuestion {
  /** Stable identifier for the card being asked: `<statementId>:<hiddenSlot>`. */
  cardId: string;
  prompt: string;
  input: "text";
  /** Which pack authored the statement behind this question. */
  packId: string;
  /** That pack's display name, for the client to show. English only for now. */
  packLabel: string;
  /**
   * The `types` of the entity the answer names — the kind of thing the learner
   * must supply (e.g. `["city"]` for "what is the capital of France?"). Read
   * from the hidden slot's target entity, so a bidirectional card carries the
   * subject's types when subject-hidden and the object's when object-hidden.
   * The client scopes answer suggestions to these types. It reveals the answer's
   * *kind*, never the answer itself. A list because it mirrors `Entity.types`,
   * though in the current graph every entity has exactly one type.
   */
  answerTypes: string[];
}

/**
 * The generic visual-aid slot: `{ kind, entityId, ...kindData }`.
 * Server-computed and fully-hydrated — the client switches on `kind` and
 * knows nothing about entities or coordinates. v1 has one kind, `map`;
 * the union exists so a future kind (flag, photo) is an addition, not a
 * reshape. (`kind`, not `renderer`: CONTEXT.md reserves "renderer" against
 * for the pack-side Generator.)
 */
export interface MapVisualAid {
  kind: "map";
  entityId: string;
  lat: number;
  lon: number;
  /** The entity's English canonical label. */
  label: string;
}

export type VisualAid = MapVisualAid;
