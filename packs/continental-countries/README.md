# continental-countries pack

Country→continent `located_in` statements over entities owned by `core-geo`. Object-hidden questions: "What continent is X in?"

## Contents

- `pack.json` — manifest
- `statements.jsonl` — 193 country→continent statements, fetched from Wikidata
- `index.ts` — question generator for object-hidden `located_in` questions

## Generation

To regenerate statements from core-geo entities and Wikidata:

```bash
node generate-statements.mjs
```

Requires network access to Wikidata SPARQL endpoint.
