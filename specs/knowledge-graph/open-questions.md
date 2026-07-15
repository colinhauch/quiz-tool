# Open Questions — Knowledge Graph

> **[UNREVIEWED]** — The question and the deterministic-hash candidate are the author's. The "Unresolved" analysis — that a hash makes any data correction orphan history, and the two escape routes — is the agent's and may be missing a simpler answer.

## Statement ID stability across pack rebuilds

**The problem.** Answer events reference statement IDs. If ETL re-runs a pack and emits new IDs for the same facts, every user's history for that pack is orphaned — silently. Nothing errors; the learning record just detaches.

**Candidate.** Derive IDs deterministically from a hash of `(subject, relation, object, qualifiers)`. Re-running ETL over unchanged source data reproduces identical IDs, so rebuilds are stable by construction rather than by discipline.

**Unresolved.** A deterministic hash means *any* change to a statement is a new identity. Correcting a border's length from 1261km to 1262km would produce a new statement and orphan history for the old one — a data fix silently costing a user their progress. That is the exact failure the scheme was meant to prevent, arriving through the back door.

Possible resolutions: hash only the identifying triple and let qualifiers change freely (but then two statements differing only in qualifiers collide — which happens with `aka` names and with anything temporal); or keep an ETL-side identity map (but that is state the tooling has to carry between runs, which is what determinism was supposed to avoid).

Blocks the import pipeline — see [../tooling/](../tooling/). Not urgent while packs are hand-built, but the decision constrains the pack format, so it should be settled before ETL is written.
