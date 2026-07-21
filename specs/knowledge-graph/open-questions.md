# Open Questions — Knowledge Graph

## Statement ID stability across pack rebuilds *(resolved)*

**The problem.** Answer events reference statement IDs. If a pack rebuild emits new IDs for the same facts, every user's history for that pack is orphaned — silently. Nothing errors; the learning record just detaches.

**Resolution: statement IDs are authored pack data, not derived.** The ID lives in the pack source as a committed field — assigned once and frozen, not recomputed on each build. A rebuild re-emits the same file with the same IDs, so stability is a property of the source rather than of a hashing discipline. Crucially, a data correction — a border's length from 1261 to 1262 km — edits qualifiers *on the existing ID*, so history stays attached. That is the exact failure a deterministic hash would have reintroduced through the back door (any field change mints a new identity and orphans history), which is why the hash approach was rejected.

**Uniqueness is an import-time rule, not a runtime guarantee.** Two checks:
- **Within a pack**, statement IDs must be unique — a pack that reuses an ID is malformed and the import halts.
- **Across packs**, an import halts if it introduces a statement ID that already exists in the system. Unlike entities, which *merge* when two packs define `Q155` (see [identity.md](identity.md)), statements never merge — each is its own record — so a cross-pack ID clash is always an error, never a merge.

While packs are hand-built, enforcing these by hand is fine — but they are *validation rules the importer owns*, and the manual check is just their MVP implementation. Namespacing IDs by pack (e.g. `borders@1.0.0:s_9f3a`) would make cross-pack collision structurally impossible and is worth considering when ETL is written. See [../tooling/](../tooling/).

## Answer normalization ignores punctuation *(resolved)*

> **[UNREVIEWED]** Ready-for-human ticket #22: confirm the folded mark set is the one we want (esp. dropping apostrophes vs. spacing them, and hyphen → space).

**The problem.** Capitals carry punctuation a learner won't type: `Washington, D.C.`, `St. John's`, `N'Djamena`, `Port-au-Prince`. `normalizeAnswer` folded case, diacritics, and whitespace but not punctuation, so the plainly-typed form was judged wrong. The capitals pack papered over this per-datum via Wikidata aliases — insurance, not a fix.

**Resolution: fold a fixed, conservative mark set in `normalizeAnswer`, applied to every pack.** After diacritic folding:
- **Hyphens → space** — so `Port-au-Prince` matches `port au prince`. Mapping to space (not deletion) leans on the existing whitespace collapse and keeps word boundaries.
- **Periods, commas, apostrophes (straight `'` and curly `’`) dropped** — `Washington, D.C.` → `washington dc`, `St. John's` → `st johns`, `N'Djamena` → `ndjamena`.

**Why a fixed set, not all `\p{Punctuation}`.** Aggressive folding risks collapsing genuinely distinct answers. A named set is auditable and testable, and the negative test asserts two different names carrying the same marks stay distinct. Broaden only when data demands it. Note this handles the punctuation *inside* a canonical label; matching a shorter alias (`Washington` for `Washington, D.C.`) is still an aliasing concern, not normalization's job. See [identity.md](identity.md).
