# capital-cities pack

Country→capital `capital` statements over entities owned by `core-geo`. Quizzed **both ways** (`hiddenSlots: ["object", "subject"]`), so each statement yields two cards:

- object-hidden: "What is the capital of X?" (name the city)
- subject-hidden: "X is the capital of what country?" (name the country)

## Contents

- `pack.json` — manifest
- `statements.jsonl` — 191 country→capital statements, fetched from Wikidata (P36). Two of core-geo's 193 countries are skipped: Monaco and Singapore are city-states whose capital Q-id is the country itself, which core-geo owns as a country, not a city.
- `index.ts` — the bidirectional `capital` generator

## Generation

To regenerate statements from core-geo entities and Wikidata:

```bash
node generate-statements.mjs
```

Requires network access to the Wikidata SPARQL endpoint. Regenerating is not routine: a capital that moves changes a statement id and orphans its answer history, so treat a re-run as a deliberate, reviewed change (see `../core-geo/README.md`).
