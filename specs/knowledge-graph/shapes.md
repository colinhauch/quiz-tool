# Record Shapes (Reference)

> **[UNREVIEWED]** — Proposed shapes, never implemented. **The most drift-prone file in the tree:** the moment TypeScript types exist, they are the source of truth and this becomes a historical sketch. Kept so that if the real types diverge, the divergence is visible and informative.

Preserved from the original design document. The *reasoning* lives in [README.md](README.md), [statements.md](statements.md), [identity.md](identity.md), and [rank-and-time.md](rank-and-time.md) — read those first; this is here so the first attempt isn't lost.

## Entity

```jsonc
{
  "id": "Q1490",                      // Wikidata Q-ID convention
  "types": ["city"],                  // one or more; types are declared by packs
  "labels":  { "en": "Tokyo" },                 // BCP-47 language codes; MVP fills `en` only
  "aliases": { "en": ["Tokio", "Edo"] },        // strings to recall it by; unread in the MVP
  "descriptions": { "en": "capital and largest city of Japan" },  // disambiguation; unread in the MVP
  "media": [ { "kind": "image", "asset": "assets/tokyo_skyline.jpg", "caption_key": "skyline" } ],
  "pack_id": "core-cities@1.0.0",
  "source": "wikidata",
  "created": "2026-07-14T00:00:00Z",
  "modified": "2026-07-14T00:00:00Z"
}
```

Entity types are themselves lightweight pack-shipped declarations: `{ "id": "city", "labels": {"en": "City"} }`. Relation domain/range constraints reference them.

## Relation Type

Entity-valued:

```jsonc
{
  "id": "borders",
  "labels": { "en": "shares a border with" },
  "arity": "entity",                 // "entity" | "literal"
  "symmetric": true,                 // store ONE edge; both directions equivalent
  "inverse_of": null,                // for asymmetric pairs: located_in ⇄ contains
  "domain": ["country"],             // allowed subject types
  "range":  ["country"],             // allowed object types
  "cardinality": "many",             // "one" | "many" — informs templates
  "qualifier_schema": {              // JSON Schema fragment for this relation
    "type": "object",
    "properties": { "length_km": { "type": "number" } },
    "additionalProperties": false    // core qualifiers implicitly allowed
  },
  "templates": ["mc_object", "mc_subject", "select_all_objects", "qualifier_quantity"],
  "pack_id": "borders@1.0.0"
}
```

Literal-valued differs only in `arity` and `range`:

```jsonc
{
  "id": "population",
  "labels": { "en": "population" },
  "arity": "literal",
  "range": { "datatype": "quantity", "unit": "people" },
  "symmetric": false,
  "cardinality": "one",              // one *current* value; history via rank + time
  "qualifier_schema": { "type": "object", "properties": { "as_of": { "type": "string", "format": "date" } } },
  "templates": ["compare_two", "order_of_magnitude_mc", "range_bucket_mc"],
  "pack_id": "core-cities@1.0.0"
}
```

A relation declares **at most one** of `symmetric` / `inverse_of`.

## Core qualifiers

Engine-reserved, allowed on every statement — the coordination floor from [statements.md](statements.md):

| Qualifier | Type | Meaning |
|---|---|---|
| `start` | date (possibly year-only) | fact became true |
| `end` | date | fact stopped being true |
| `as_of` | date | snapshot date for volatile values |
| `note` | localized string | free-text caveat, display-only |

## Statement

```jsonc
{
  "id": "s_9f3a",                    // stable unique ID (ULID suggested)
  "subject": "Q155",                 // Brazil
  "relation": "borders",
  "object": { "entity": "Q414" },    // Argentina
  "qualifiers": { "length_km": 1261 },
  "rank": "normal",                  // "preferred" | "normal" | "deprecated"
  "pack_id": "borders@1.0.0",
  "source": "wikidata:Q155#P47",
  "created": "2026-07-14T00:00:00Z",
  "modified": "2026-07-14T00:00:00Z"
}
```

### The object union

```jsonc
{ "entity": "Q414" }                                          // entity reference
{ "literal": { "datatype": "quantity", "value": 37400000, "unit": "people" } }
{ "literal": { "datatype": "string",   "value": "Constantinople", "lang": "en" } }
{ "literal": { "datatype": "date",     "value": "1960-04-21", "precision": "day" } }
```

Datatypes (MVP set): `string` (optionally language-tagged), `quantity` (value + unit), `date` (value + precision `year`/`month`/`day`), `boolean`. Engine-level, not pack-level.

## Worked examples

**Symmetric with qualifier** — the border set falls out of a query, never stored:

```jsonc
{ "subject": "Q155", "relation": "borders", "object": { "entity": "Q414" }, "qualifiers": { "length_km": 1261 } }
{ "subject": "Q155", "relation": "borders", "object": { "entity": "Q419" }, "qualifiers": { "length_km": 2995 } }
// … 8 more. "Which countries border Brazil?" = all borders statements touching Q155.
```

**Rank and time** — the capital of Brazil, current and historical:

```jsonc
{ "id": "s_101", "subject": "Q155", "relation": "capital", "object": { "entity": "Q2844" },  // Brasília
  "qualifiers": { "start": "1960-04-21" }, "rank": "preferred" }
{ "id": "s_102", "subject": "Q155", "relation": "capital", "object": { "entity": "Q8678" },  // Rio de Janeiro
  "qualifiers": { "start": "1763", "end": "1960-04-21" }, "rank": "normal" }
```

**Historical name** — a string literal with temporal qualifiers, itself quizzable in two directions:

```jsonc
{ "id": "s_ist", "subject": "Q406", "relation": "aka",
  "object": { "literal": { "datatype": "string", "value": "Constantinople", "lang": "en" } },
  "qualifiers": { "start": "0330", "end": "1930", "context": "official name" } }
// Q: "What was Istanbul officially called before 1930?"  → object of s_ist
// Q: "When did Constantinople become Istanbul?"          → `end` qualifier of s_ist
```

**Direction as an edge property** — geometry resolved at import time:

```jsonc
{ "subject": "gq:santa_catalinas", "relation": "overlooks", "object": { "entity": "Q18575" },  // Tucson
  "qualifiers": { "direction": "NE" } }
// Q: "Which mountain range lies northeast of Tucson?"
```

**Numeric snapshot:**

```jsonc
{ "subject": "Q1490", "relation": "population",
  "object": { "literal": { "datatype": "quantity", "value": 37400000, "unit": "people" } },
  "qualifiers": { "as_of": "2025-01-01" }, "source": "wikidata:Q1490#P1082" }
```

## Reification

"The Rio Grande forms part of the border between the US and Mexico" — four participants, so the relationship becomes an entity:

```jsonc
{ "id": "gq:us_mx_border", "types": ["border"], "labels": { "en": "United States–Mexico border" } }

{ "subject": "gq:us_mx_border", "relation": "border_party",  "object": { "entity": "Q30" } }    // USA
{ "subject": "gq:us_mx_border", "relation": "border_party",  "object": { "entity": "Q96" } }    // Mexico
{ "subject": "gq:us_mx_border", "relation": "formed_by",     "object": { "entity": "Q41000" },  // Rio Grande
  "qualifiers": { "extent": "partial" } }
{ "subject": "gq:us_mx_border", "relation": "length",
  "object": { "literal": { "datatype": "quantity", "value": 3145, "unit": "km" } } }
```

Note that nothing here is a new *kind* of thing — it is entities and statements, which is the point.
