# TODO

- [ ] Review documentation — verify unreviewed specs and mark sections as reviewed by removing `[UNREVIEWED]` markers

## Multilingual support

Deferred from the MVP, which fills `en` only and reads only `labels`. Entities keep Wikidata's language-keyed shape (`labels` / `aliases` / `descriptions`), so the seam exists — see [specs/knowledge-graph/identity.md](specs/knowledge-graph/identity.md).

- [ ] **Thread a locale through name resolution.** Resolution is a function `(entity, locale) → string`. The MVP hardcodes `en`; the retrofit cost is every call site, not the data. Cheap to add languages, expensive to add the argument.
- [ ] **Decide the fallback policy, explicitly.** RFC 4647 Lookup truncates from the end and *requires you* to define the default — an `en` backstop is our policy, not the spec's. CLDR parent locales are where truncation is wrong (`zh_Hant` → `root`, not `zh`; `en_AU` → `en_001`). See [docs/research/multilingual-names.md](docs/research/multilingual-names.md).
- [ ] **Backfill labels/aliases for existing entities.** Safe: entities are keyed by Q-IDs, so a fresh query joins on the pack we already shipped. Bounded re-extraction, *not* a pack regeneration — regenerating the pack churns statement IDs and orphans answer history. See [specs/tooling/mvp-bootstrap.md](specs/tooling/mvp-bootstrap.md).

## An `aka` statement relation

- [ ] **Ship `aka` as a relation** (`start` / `end` qualifiers) so historical names are quizzable — "what was Tokyo called before 1868?"
- [ ] **Settle what belongs in `aliases` vs. an `aka` statement.** A string can legitimately be both: "Edo" is an alias (you should find Tokyo by typing it) *and* a dated fact. The open question is the overlap, not the split. It only becomes answerable when text input and an `aka` pack exist together — that is the first moment aliases are actually read. Wikidata's guidance is a set of exclusions (no misspellings, no capitalisation variants), each justified by a layer we do not have yet.
