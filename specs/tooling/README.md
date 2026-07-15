# Tooling

> **[UNREVIEWED]** — Stub, but not empty: the two constraints below are real claims about why shipped decisions exist. Worth confirming they're the actual reasons and not a tidy story told after the fact.

**Stub.** Built post-MVP — but it constrains the pack format today, so the constraint is recorded here.

Pack authoring and the import pipeline. Packs are meant to be **built by ETL, not hand-authored**; the MVP's single hand-built pack is a bootstrap, not the model.

## Why this stub exists

The import pipeline is deferred, but its *requirements* are not. Two decisions in the shipped design exist only to serve it:

**Wikidata Q-IDs as entity IDs** — chosen so that Wikidata → our model is nearly mechanical: Q-IDs become entity IDs, properties become relation types, qualifiers and ranks map across directly. See [../knowledge-graph/identity.md](../knowledge-graph/identity.md).

**Geometry stays out of the runtime** — spatial computation belongs *here*, at import time. Derive "northeast of Tucson" from coordinates once, emit a plain statement with a direction qualifier, and the app never links a GIS library. See [../knowledge-graph/](../knowledge-graph/).

Statement ID stability is the open problem that blocks this work, and it is a format concern, so it should be settled before ETL is written — see [../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md).

Intended sources: Wikidata (facts, labels, aliases in every language), GeoNames (city lists by population), REST Countries, Natural Earth (shapes, if spatial derivation is ever used), Wikimedia Commons (license-tagged images).
