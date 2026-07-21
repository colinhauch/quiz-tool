# Open Questions — Knowledge Graph

## Statement ID stability across pack rebuilds *(resolved)*

**The problem.** Answer events reference statement IDs. If a pack rebuild emits new IDs for the same facts, every user's history for that pack is orphaned — silently. Nothing errors; the learning record just detaches.

**Resolution: statement IDs are authored pack data, not derived.** The ID lives in the pack source as a committed field — assigned once and frozen, not recomputed on each build. A rebuild re-emits the same file with the same IDs, so stability is a property of the source rather than of a hashing discipline. Crucially, a data correction — a border's length from 1261 to 1262 km — edits qualifiers *on the existing ID*, so history stays attached. That is the exact failure a deterministic hash would have reintroduced through the back door (any field change mints a new identity and orphans history), which is why the hash approach was rejected.

**Uniqueness is an import-time rule, not a runtime guarantee.** Two checks:
- **Within a pack**, statement IDs must be unique — a pack that reuses an ID is malformed and the import halts.
- **Across packs**, an import halts if it introduces a statement ID that already exists in the system. Unlike entities, which *merge* when two packs define `Q155` (see [identity.md](identity.md)), statements never merge — each is its own record — so a cross-pack ID clash is always an error, never a merge.

While packs are hand-built, enforcing these by hand is fine — but they are *validation rules the importer owns*, and the manual check is just their MVP implementation. Namespacing IDs by pack (e.g. `borders@1.0.0:s_9f3a`) would make cross-pack collision structurally impossible and is worth considering when ETL is written. See [../tooling/](../tooling/).

## Answer normalization ignores punctuation *(open)*

Text-answer matching (`normalizeAnswer`) folds case, diacritics, and whitespace but **not punctuation**. `located_in`'s data never exercised this; `capitals` does, hard — `Washington, D.C.`, `St. John's`, `N'Djamena` all carry punctuation a learner won't reliably type. The `capitals` pack works around it at authoring time (Wikidata `altLabel` aliases catch common forms like plain "Washington"), but that is per-datum insurance, not a fix. The open question is whether `normalizeAnswer` should also fold punctuation for every pack, and if so which marks — apostrophes and periods are safe, but a rule can't be so loose that two genuinely different answers collapse together. This is an engine change (it touches [identity.md](identity.md)'s label/alias matching), deferred out of the `capitals` slice.
