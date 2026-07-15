# Geography Learning Engine — Data Architecture Specification

**Status:** Draft v0.1 · **Scope:** Data model, pack format, question generation, user tracking, storage
**Working name:** *GeoQuiz* (placeholder)

---

## 1. Purpose & Vision

A quiz application that teaches world geography by asking questions generated from a knowledge graph, tracking every answer, and surfacing insights about the user's knowledge gaps ("Colin knows US city names well, but not the languages spoken in South American cities").

The defining constraint: **the engine must be generic.** Question content, relation kinds, and even entity kinds arrive via installable **data packs**. The MVP ships with one pack (~300 most-populated world cities and their countries); later packs add languages, currencies, borders, rivers, religions, historical names, images — *without schema changes, without breaking historical answer logs, and without rearchitecting.*

### 1.1 Design principles

1. **Everything quizzable is a Statement.** One uniform fact format means one uniform answer log and one scheduler, forever.
2. **The engine knows structure, packs know semantics.** The engine understands entities, relation types, statements, and templates. It has no idea what a "city" is.
3. **Sets are queries, not entities.** "Countries bordering Brazil" is derived from pairwise statements, never stored as a thing.
4. **Reify when arity > 2.** Any fact too complex for one statement becomes an entity with statements hanging off it. This is the universal escape hatch that guarantees no future refactor.
5. **Geometry stays out of the runtime.** Spatial computation (if ever needed) happens at import time in ETL tooling; the app only ever sees conceptual facts and literal attributes.
6. **Single-user MVP, multi-user schema.** Every user-side record carries a `user_id` from day one; MVP hardcodes one local user.
7. **Validate at build time, trust at runtime.** Packs are validated against relation-type schemas when built/installed; the engine never defensively parses.

### 1.2 Explicit non-goals (MVP)

User accounts & sync · images/maps · GIS/geometry · authoring UI for packs · the Wikidata import tooling itself (the *format* must support it; building it is post-MVP).

---

## 2. Core Concepts (Glossary)

| Concept | One-liner |
|---|---|
| **Entity** | A thing facts attach to: Tokyo, Japan, the Mississippi, `us_mx_border`. Thin identity record. |
| **Relation Type** | A registered, schema'd definition of a kind of fact: `located_in`, `borders`, `population`. |
| **Statement** | One fact: subject + relation + object (entity ref *or* typed literal) + qualifiers + provenance. |
| **Qualifier** | Per-statement metadata bag validated by the relation type's schema: `{direction: "NE"}`, `{start: 1960}`. |
| **Data Pack** | Installable bundle of entity defs, relation-type defs, statements, and assets (any subset). |
| **Question Template** | Declarative recipe attached to a relation type: how to phrase, direct, and render a question. |
| **Answer Event** | Immutable log row: user × statement × direction × correctness × context. |
| **Card / Scheduler State** | Mutable spaced-repetition state per (user, statement, direction). |

Five content object kinds (entities, relation types, statements, packs, assets) + two user-side kinds (answer events, scheduler state). That is the entire model.

---

## 3. Entities

Entities are **thin identity records**. Anything you could quiz on lives in statements, not entity fields.

```jsonc
{
  "id": "Q1490",                      // canonical ID — Wikidata Q-ID convention (§3.1)
  "types": ["city"],                  // one or more entity types; types are declared by packs
  "labels":  { "en": "Tokyo", "ja": "東京" },          // BCP-47 language codes
  "aliases": { "en": ["Tokio", "Edo"], "ja": ["江戸"] }, // per-language alias arrays
  "descriptions": { "en": "capital and largest city of Japan" }, // disambiguation text
  "media": [ { "kind": "image", "asset": "assets/tokyo_skyline.jpg", "caption_key": "skyline" } ],
  "pack_id": "core-cities@1.0.0",
  "source": "wikidata",
  "created": "2026-07-14T00:00:00Z",
  "modified": "2026-07-14T00:00:00Z"
}
```

Field notes:

- **`id`** — globally unique, permanent, shared across packs.
- **`types`** — plural. Istanbul is a `city`; a reified border (§5.4) is type `border`. Entity types are lightweight declarations shipped in packs (`{ "id": "city", "labels": {"en": "City"} }`); domain/range constraints on relations reference them.
- **`labels` / `aliases` / `descriptions`** — keyed by BCP-47 codes (`en`, `ja`, `pt-BR`). Wikidata provides all three in hundreds of languages for free. Descriptions matter the moment two entities share a label ("Springfield, city in Illinois" vs "Springfield, city in Missouri"). *Note: aliases here are display synonyms. Historical names with dates are `aka` statements (§5.3) so they can be quizzed.*
- **`media`** — optional asset references (§7.4). Absence of media is normal; templates declare whether they need it.
- **`pack_id` / `source`** — provenance: which pack introduced this entity, and where it originally came from.

### 3.1 Canonical IDs

Use **Wikidata Q-IDs** as entity IDs wherever the entity exists in Wikidata (`Q155` = Brazil, `Q1490` = Tokyo). Benefits: globally unique and permanent; cross-pack deduplication is automatic (every pack agrees on what Brazil *is*); every entity carries a free backlink to its richest data source; import tooling maps 1:1. Entities with no Wikidata counterpart (e.g. app-specific reifications) use a namespaced ID: `gq:us_mx_border_1`.

**Cross-pack merge rule:** if two installed packs both define `Q155`, the records are merged — labels/aliases union per language, types union, conflicts resolved in pack-installation order (later pack wins per field). Statements never conflict this way because each statement is its own record.

---

## 4. Relation Types

Relation types are **first-class registered definitions**, not strings. A statement's `relation` field must reference a registered relation type, and this registry is what keeps qualifiers, validation, and question generation consistent across packs.

```jsonc
{
  "id": "borders",
  "labels": { "en": "shares a border with" },
  "arity": "entity",                 // object kind: "entity" | "literal"
  "symmetric": true,                 // store ONE edge; engine treats both directions as equivalent
  "inverse_of": null,                // for asymmetric pairs: located_in ⇄ contains
  "domain": ["country"],             // allowed subject types
  "range":  ["country"],             // allowed object types (or literal datatype, see population below)
  "cardinality": "many",             // "one" | "many" — informs templates (select-all vs single answer)
  "qualifier_schema": {              // JSON Schema fragment for this relation's qualifier bag
    "type": "object",
    "properties": { "length_km": { "type": "number" } },
    "additionalProperties": false    // core qualifiers (§4.1) are implicitly allowed
  },
  "templates": ["mc_object", "mc_subject", "select_all_objects", "qualifier_quantity"],
  "pack_id": "borders@1.0.0"
}
```

A literal-valued relation differs only in `arity` and `range`:

```jsonc
{
  "id": "population",
  "labels": { "en": "population" },
  "arity": "literal",
  "range": { "datatype": "quantity", "unit": "people" },
  "symmetric": false,
  "cardinality": "one",              // one *current* value; history via rank + time qualifiers
  "qualifier_schema": { "type": "object", "properties": { "as_of": { "type": "string", "format": "date" } } },
  "templates": ["compare_two", "order_of_magnitude_mc", "range_bucket_mc"],
  "pack_id": "core-cities@1.0.0"
}
```

Field notes:

- **`symmetric` vs `inverse_of`** — a relation declares at most one. `borders` is symmetric: store `(Brazil, borders, Argentina)` once; queries and questions normalize both directions. `located_in` declares `inverse_of: "contains"`: only `located_in` edges are stored; "name a city in India" is generated by phrasing the inverse — the `contains` edge never exists in storage.
- **`domain` / `range`** — powers import validation ("a `located_in` subject must be a city or admin region") *and* distractor generation ("wrong answers must be type-valid, or the right answer is guessable by type").
- **`cardinality`** — `one` means templates like "what is the capital?" are safe; `many` means prefer "which of the following…" and select-all templates.
- **`qualifier_schema`** — JSON Schema validated at pack build/install time (§7.2). Different relations legitimately have different qualifier vocabularies; the schema is where that lives.

### 4.1 Core qualifiers (engine-defined, allowed on every statement)

To prevent pack A writing `from` and pack B writing `since`, the engine reserves a small universal vocabulary that every relation supports implicitly:

| Qualifier | Type | Meaning |
|---|---|---|
| `start` | date (possibly year-only) | fact became true |
| `end` | date | fact stopped being true |
| `as_of` | date | snapshot date for volatile values |
| `note` | localized string | free-text caveat, display-only |

Temporal question templates (§8.5) key off `start`/`end` uniformly across all packs.

### 4.2 Relation types and packs

Packs may **define** new relation types or **reference** ones defined by packs they depend on (§7.1). A `languages` pack can reuse `core`'s entity types and add only a `speaks` relation + statements. Relation-type IDs are global; redefining an existing ID is an install-time error (extend via new templates instead — templates are additive).

---

## 5. Statements

The atomic unit of knowledge. **Every quizzable fact in the system is a statement**, and every answer ever logged references a statement ID.

```jsonc
{
  "id": "s_9f3a",                    // stable unique ID (ULID recommended)
  "subject": "Q155",                 // Brazil
  "relation": "borders",
  "object": { "entity": "Q414" },    // Argentina — tagged union, see §5.1
  "qualifiers": { "length_km": 1261 },
  "rank": "normal",                  // "preferred" | "normal" | "deprecated" (§5.2)
  "pack_id": "borders@1.0.0",
  "source": "wikidata:Q155#P47",     // credit / provenance pointer
  "created": "2026-07-14T00:00:00Z",
  "modified": "2026-07-14T00:00:00Z"
}
```

### 5.1 The object slot: tagged union

```jsonc
{ "entity": "Q414" }                                          // entity reference
{ "literal": { "datatype": "quantity", "value": 37400000, "unit": "people" } }
{ "literal": { "datatype": "string",   "value": "Constantinople", "lang": "en" } }
{ "literal": { "datatype": "date",     "value": "1960-04-21", "precision": "day" } }
```

Literal datatypes (MVP set): `string` (optionally language-tagged), `quantity` (value + unit), `date` (value + precision: `year`/`month`/`day`), `boolean`. New datatypes may be added later; they are engine-level, not pack-level.

**Numbers are literals, never entities.** There is no "37,400,000" node. Numeric relations get comparison/range/order-of-magnitude templates rather than exact-recall templates (§8.4).

### 5.2 Rank: current vs historical truth

Statements are never deleted to reflect change — they are ranked:

```jsonc
// The capital of Brazil
{ "id": "s_101", "subject": "Q155", "relation": "capital", "object": { "entity": "Q2844" },  // Brasília
  "qualifiers": { "start": "1960-04-21" }, "rank": "preferred" }
{ "id": "s_102", "subject": "Q155", "relation": "capital", "object": { "entity": "Q8678" },  // Rio de Janeiro
  "qualifiers": { "start": "1763", "end": "1960-04-21" }, "rank": "normal" }
```

"What is the capital of Brazil?" queries `rank = preferred` (falling back to `normal` when no preferred exists). "What was the capital before Brasília?" is a temporal template over the same rows. `deprecated` marks statements retracted by a pack update — kept so historical answer events still resolve, excluded from question generation.

### 5.3 Worked examples

**Symmetric with qualifier** — border set falls out of a query, never stored as a set:

```jsonc
{ "subject": "Q155", "relation": "borders", "object": { "entity": "Q414" }, "qualifiers": { "length_km": 1261 } }
{ "subject": "Q155", "relation": "borders", "object": { "entity": "Q419" }, "qualifiers": { "length_km": 2995 } }
// … 8 more. "Which countries border Brazil?" = all borders statements touching Q155.
```

**Historical name** — string literal object, temporal qualifiers, itself quizzable:

```jsonc
{ "id": "s_ist", "subject": "Q406", "relation": "aka",
  "object": { "literal": { "datatype": "string", "value": "Constantinople", "lang": "en" } },
  "qualifiers": { "start": "0330", "end": "1930", "context": "official name" } }
// Q: "What was Istanbul officially called before 1930?"  → object of s_ist
// Q: "When did Constantinople become Istanbul?"          → `end` qualifier of s_ist
```

**Directional fact as edge property** — no geometry at runtime:

```jsonc
{ "subject": "gq:santa_catalinas", "relation": "overlooks", "object": { "entity": "Q18575" },  // Tucson
  "qualifiers": { "direction": "NE" } }
// Q: "Which mountain range lies northeast of Tucson?"
```

**Numeric literal snapshot:**

```jsonc
{ "subject": "Q1490", "relation": "population",
  "object": { "literal": { "datatype": "quantity", "value": 37400000, "unit": "people" } },
  "qualifiers": { "as_of": "2025-01-01" }, "source": "wikidata:Q1490#P1082" }
```

### 5.4 Reification: the n-ary escape hatch

When a fact has **more than two participants**, or the relationship instance itself needs facts referencing other entities, promote it to an entity:

```jsonc
// "The Rio Grande forms part of the border between the US and Mexico"
{ "id": "gq:us_mx_border", "types": ["border"], "labels": { "en": "United States–Mexico border" } }

{ "subject": "gq:us_mx_border", "relation": "border_party",  "object": { "entity": "Q30" } }    // USA
{ "subject": "gq:us_mx_border", "relation": "border_party",  "object": { "entity": "Q96" } }    // Mexico
{ "subject": "gq:us_mx_border", "relation": "formed_by",     "object": { "entity": "Q41000" },  // Rio Grande
  "qualifiers": { "extent": "partial" } }
{ "subject": "gq:us_mx_border", "relation": "length",
  "object": { "literal": { "datatype": "quantity", "value": 3145, "unit": "km" } } }
```

Rules of thumb: binary fact → statement with qualifiers (do **not** reify Brazil–Argentina). Three or more participants, or facts *about the relationship* → reify. Events (a battle, a founding), memberships-with-roles, and ordered routes are all reifications. Because the engine treats all entities identically, reification requires zero engine support beyond what already exists — this is the property that guarantees future facts fit.

---

## 6. Users, Answer Events, and Scheduling

### 6.1 Users

MVP runs with a single hardcoded local user (`user_id = "local"` or a device UUID). **Every user-side row carries `user_id` anyway.** Adding accounts later = auth + a `users` table + sync; the data model does not change.

### 6.2 Answer events (immutable, append-only)

```jsonc
{
  "id": "a_7c21",
  "user_id": "local",
  "statement_id": "s_9f3a",         // the fact tested
  "direction": "forward",           // "forward" (hide object) | "reverse" (hide subject) | "qualifier:<name>"
  "template_id": "mc_object",
  "input_mode": "multiple_choice",  // "multiple_choice" | "text" | "select_all" | …
  "correct": true,
  "answer_given": "Q414",           // entity ID, literal, or raw text as appropriate
  "distractors": ["Q717", "Q736", "Q750"],  // optional: what the wrong options were
  "latency_ms": 3400,               // optional
  "asked_at": "2026-07-14T14:02:11Z",
  "session_id": "sess_04"
}
```

Notes:

- **`statement_id` + `direction` is the knowledge coordinate.** Knowing Tokyo→Japan (forward) and being able to produce Tokyo given Japan (reverse) are different skills and are tracked separately.
- **`direction: "qualifier:end"`** records quizzing a qualifier ("when did Constantinople become Istanbul?") — free because answer events reference statements, not bare triples.
- Events referencing statements later marked `deprecated` remain valid history; they simply stop generating new questions.
- The log never stores derived skill judgments — those are always recomputed (§6.4), so improved analytics apply retroactively to all history.

### 6.3 Scheduler state ("cards") and the Scheduler interface

One mutable row per `(user_id, statement_id, direction)`:

```jsonc
{ "user_id": "local", "statement_id": "s_9f3a", "direction": "forward",
  "due": "2026-07-19T00:00:00Z", "stability": 4.2, "difficulty": 6.1,
  "reps": 3, "lapses": 0, "last_review": "2026-07-14T14:02:11Z",
  "state": "review",                 // "new" | "learning" | "review" | "relearning"
  "algo": "fsrs-4.5", "algo_state": { /* opaque per-algorithm blob */ } }
```

Selection goes through an interface so the algorithm is swappable without touching schema or engine:

```ts
interface Scheduler {
  /** pick the next cards to quiz for a session */
  select(userId: string, pool: CardQuery, n: number): Card[];
  /** update state after an answer */
  review(card: Card, outcome: AnswerEvent): Card;
}
```

MVP implementation: `RandomLeastRecentScheduler` (uniform over `new` + least-recently-asked). Later: FSRS via `ts-fsrs`, dropping into the same interface. The `algo`/`algo_state` fields let algorithms coexist and migrate per-card.

### 6.4 Insights & gap analysis

Insights are **aggregations over the answer log joined against the graph** — computed, never stored as facts:

- *Accuracy by relation type:* `speaks` vs `located_in` vs `currency`.
- *Accuracy by region:* bucket each tested statement's subject by walking `located_in` edges transitively up to a continent (a recursive traversal / recursive CTE). "Colin's accuracy on `speaks` where subject rolls up to South America: 34%."
- *Strength map:* the (region × relation) accuracy matrix is the core "knowledge gaps" screen.
- *Trend:* same aggregates windowed by `asked_at`.

Because new packs add statements in the same shape, every future pack's answers join into these aggregates automatically — the "languages pack data matches historical US-cities data" requirement is satisfied by construction.

---

## 7. Data Packs

A pack is a versioned bundle: **manifest + any subset of {entity types, relation types, entities, statements, assets}**.

### 7.1 Manifest (`pack.json`)

```jsonc
{
  "id": "borders",
  "version": "1.0.0",                       // semver
  "labels": { "en": "Country Borders" },
  "descriptions": { "en": "Land borders between all countries, with lengths." },
  "engine_min_version": "0.3.0",
  "depends": [ { "id": "core-countries", "version": ">=1.0.0" } ],  // provides the country entities
  "license": "CC0-1.0",
  "credits": [ { "source": "wikidata", "retrieved": "2026-07-01" } ],
  "contents": {
    "entity_types":   "entity_types.json",   // optional
    "relation_types": "relation_types.json", // optional
    "entities":       "entities.jsonl",      // optional
    "statements":     "statements.jsonl",    // optional
    "assets":         "assets/"              // optional
  }
}
```

`.jsonl` (one JSON object per line) keeps large files streamable and diff-friendly. A pack that only adds statements over existing entities (the `borders` pack) ships no entity file at all.

### 7.2 Build/install-time validation

Run when a pack is built by tooling and again on install; the runtime engine trusts installed data.

1. Manifest well-formed; dependencies resolvable at compatible versions.
2. Every statement's `relation` is registered (locally or via a dependency).
3. Subject/object types satisfy the relation's `domain`/`range`; literal objects match `arity`/datatype.
4. Qualifier bags validate against `qualifier_schema` + core qualifiers.
5. All entity references resolve (within the pack or its dependencies).
6. No relation-type ID collisions with installed packs.
7. Asset references resolve to bundled files.

### 7.3 Pack lifecycle

- **Install:** merge entities (§3.1 merge rule), register relation types, insert statements tagged with `pack_id`.
- **Update:** diff by stable statement IDs — new statements insert; removed statements become `deprecated` (preserving answer history); changed statements update in place with `modified` bumped.
- **Uninstall:** statements from the pack are deactivated (or deleted, with answer events retained as orphans pointing at an archived statement snapshot — retain a `statements_archive` for log integrity).

### 7.4 Assets (images and beyond)

Assets are files bundled in a pack, referenced by relative path from entity `media` or from question templates. The engine treats them opaquely (an ID, a MIME type, a file). **Templates declare their required capabilities** — `mc_object_with_image` requires the subject to have an `image` media entry; packs without images simply never trigger image templates. This is the whole answer to "what if most packs don't have pictures": capability-matching, not special-casing.

---

## 8. Question Generation

### 8.1 Templates

A template is a declarative recipe registered per relation type:

```jsonc
{
  "id": "mc_object",
  "relation": "borders",
  "direction": "forward",
  "prompt": { "en": "Which of the following countries borders {subject}?" },
  "input": "multiple_choice",
  "options": 4,
  "distractors": "siblings",          // strategy, §8.3
  "difficulty": 2,                    // 1–5; informs input-mode selection
  "requires": []                      // capability requirements, e.g. ["subject.media.image"]
}
```

The generator: pick a due card (scheduler) → its statement + direction → an eligible template (capabilities satisfied, difficulty appropriate) → render prompt with localized labels → assemble options.

### 8.2 Directions

- **forward** — hide object: "What country is Tokyo in?"
- **reverse** — hide subject, phrased via `inverse_of` or symmetric normalization: "Name a city in India." For `cardinality: many` reverse questions, *any* valid subject is correct.
- **qualifier:<name>** — hide a qualifier: "When did Constantinople become Istanbul?"

### 8.3 Distractor strategies (multiple choice)

Distractors come from the graph; strategy is declared per template:

- **`siblings`** — same type, near in graph: other countries in South America *not* bordering Brazil. Hard mode.
- **`same_type_far`** — same type, distant region (Mongolia as a Brazil-border option). Easy mode.
- **`same_range`** — anything satisfying the relation's range types (baseline validity: never offer a river as a country answer).
- **`literal_spread`** — for quantities: generate plausible wrong values (×0.5, ×2, ×10 of truth).

Difficulty tuning = distractor strategy + option count + input mode (multiple choice → text recall as mastery grows; the scheduler's `stability` can drive this promotion).

### 8.4 Numeric templates

Exact recall of literals is avoided. Instead: `compare_two` ("Which has the larger population: Tokyo or Delhi?" — reads literals off both), `order_of_magnitude_mc`, `range_bucket_mc` ("Is Tokyo's metro population <10M / 10–20M / 20–40M / >40M?"). Comparison questions synthesize a virtual card keyed to the *pair* of statements; log both statement IDs in the answer event (`statement_id` primary, `context_statement_ids` array).

### 8.5 Temporal templates

Key off core `start`/`end` qualifiers uniformly: "What was the capital of Brazil in 1900?" filters `capital` statements by qualifier date ranges; "When did X become Y?" targets `qualifier:start`.

---

## 9. Storage

### 9.1 Repository interface

All persistence behind interfaces (`EntityRepo`, `StatementRepo`, `AnswerLogRepo`, `CardRepo`, `PackRepo`); the engine never issues raw queries. Reference implementation: **SQLite** (embedded, perfect for local-first MVP, ships in-app later). Swappable to Postgres (accounts era) or a Cypher store (Kùzu/Neo4j) without engine changes.

### 9.2 Reference SQLite schema (abridged)

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY, types JSON NOT NULL, labels JSON NOT NULL,
  aliases JSON, descriptions JSON, media JSON,
  pack_id TEXT NOT NULL, source TEXT, created TEXT NOT NULL, modified TEXT NOT NULL
);

CREATE TABLE relation_types (
  id TEXT PRIMARY KEY, def JSON NOT NULL, pack_id TEXT NOT NULL
);

CREATE TABLE statements (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL REFERENCES entities(id),
  relation TEXT NOT NULL REFERENCES relation_types(id),
  object_entity TEXT REFERENCES entities(id),      -- exactly one of object_entity /
  object_literal JSON,                              -- object_literal is non-null
  qualifiers JSON NOT NULL DEFAULT '{}',
  rank TEXT NOT NULL DEFAULT 'normal' CHECK (rank IN ('preferred','normal','deprecated')),
  pack_id TEXT NOT NULL, source TEXT, created TEXT NOT NULL, modified TEXT NOT NULL,
  CHECK ((object_entity IS NULL) <> (object_literal IS NULL))
);
CREATE INDEX idx_stmt_subject  ON statements(subject, relation);
CREATE INDEX idx_stmt_object   ON statements(object_entity, relation);

CREATE TABLE answer_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
  statement_id TEXT NOT NULL, direction TEXT NOT NULL,
  template_id TEXT, input_mode TEXT, correct INTEGER NOT NULL,
  answer_given JSON, distractors JSON, latency_ms INTEGER,
  asked_at TEXT NOT NULL, session_id TEXT
);
CREATE INDEX idx_ans_user_time ON answer_events(user_id, asked_at);

CREATE TABLE cards (
  user_id TEXT NOT NULL, statement_id TEXT NOT NULL, direction TEXT NOT NULL,
  due TEXT, state TEXT NOT NULL DEFAULT 'new',
  algo TEXT, algo_state JSON, reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0,
  last_review TEXT,
  PRIMARY KEY (user_id, statement_id, direction)
);

CREATE TABLE packs (
  id TEXT NOT NULL, version TEXT NOT NULL, manifest JSON NOT NULL,
  installed_at TEXT NOT NULL, PRIMARY KEY (id, version)
);
```

Region rollups for insights use a recursive CTE over `located_in` statements (city → prefecture → country → continent). If traversals grow deep/varied enough to hurt, that is the signal to move `StatementRepo` to a Cypher-speaking store — a repo swap, not a redesign.

---

## 10. Import Pipeline (post-MVP, format-constraining now)

Packs are **built by ETL tooling, not hand-authored**:

1. **Query** Wikidata (SPARQL) / GeoNames for the pack's scope ("top 300 cities by population with country, coordinates, labels in all languages").
2. **Map** — Wikidata statements → GeoQuiz statements is nearly 1:1: Q-IDs → entity IDs, properties (`P36` capital, `P47` shares border) → relation types, Wikidata qualifiers/ranks → qualifiers/ranks.
3. **Derive (optional)** — any spatial computation happens *here*: compute a direction or on-river fact from coordinates once, emit it as a plain statement. The app never sees geometry.
4. **Validate** against relation-type schemas (§7.2). 5. **Emit** the pack bundle.

Free sources: Wikidata (facts, labels, aliases in all languages), GeoNames (city lists by population), REST Countries (country-level convenience), Natural Earth (shapes, if step 3 is ever used), Wikimedia Commons (images, license-tagged).

---

## 11. MVP Cut

**Ships:** statement/entity/relation-type model as specced · one hand-built `core-cities` pack (~300 cities: `located_in` city→country, country→continent; labels/aliases en) · forward + reverse multiple choice · answer log + cards + `RandomLeastRecentScheduler` behind the `Scheduler` interface · region × relation accuracy screen · SQLite behind repos · single local user.

**Explicitly deferred, zero-refactor by design:** FSRS (interface swap) · new packs: languages, currencies, borders, population, `aka` (data + relation registration only) · qualifier and temporal questions (log format already supports) · images (asset capability matching) · text-input answers with alias matching (aliases already stored) · multilingual quizzing (labels already keyed by language) · accounts & sync (`user_id` already everywhere) · import tooling (pack format already matches Wikidata) · graph database (repo swap).

## 12. Open Questions

1. Statement ID stability across pack rebuilds — derive deterministically from (subject, relation, object, qualifier-hash) so ETL re-runs don't churn IDs?
2. Answer-checking for text input: alias matching + normalization (diacritics, "St."/"Saint") — how fuzzy?
3. Difficulty model: hand-tagged per template vs derived from global answer stats per statement?
4. Reverse `many` questions ("name a city in Brazil"): accept any valid answer — but which statement's card gets credit? (Proposal: the statement matching the given answer; if user answers "São Paulo", credit that card.)
5. Pack distribution: bundled with app builds vs downloadable — affects nothing in the format, but affects app architecture.

