# The MVP Pack Bootstrap

How the one `core-cities` pack gets built, given that the import pipeline it would normally come from is deferred. See [README.md](README.md) for the pipeline itself.

## A one-off script, whose output is committed

The pack is generated once by a throwaway SPARQL query against the Wikidata Query Service. The resulting `.jsonl` is committed to the repository and *is* the pack. The script is not maintained, not tested, not part of the build, and not the pipeline — it is scaffolding that gets kicked away.

## Why this isn't the import tooling we said we wouldn't build

[ROADMAP.md](../../ROADMAP.md) lists "the Wikidata import tooling itself" as an MVP non-goal, and separately promises a "hand-built `core-cities` pack." Those two are in tension, and reading them literally produces something nobody would do.

Entities are keyed by Wikidata Q-IDs — see [../knowledge-graph/identity.md](../knowledge-graph/identity.md). So "hand-built" means a human looking up roughly 300 city Q-IDs and 200 country Q-IDs by hand, one at a time, and typing them correctly. That is not a bootstrap; it is data entry with a silent failure mode, because a wrong Q-ID looks exactly like a right one until something downstream can't resolve it. `identity.md` even names the reason the Q-ID correspondence exists in the first place: *"the alternative is hand-authoring hundreds of thousands of facts."* The design chose Q-IDs specifically so that nobody would hand-author facts. Hand-authoring the first pack would be the one case where we ignore that.

The non-goal is doing real work; it is just aimed at something else. What it protects against is **shipping and maintaining a pipeline** — a general, re-runnable ETL with source adapters, incremental updates, and a stability contract. That is a project. Running one query once and committing the answer is not that project, and the distinction is what gets committed: **a data file, not a pipeline.** Nothing in the app knows the script ever existed.

This also lands where [README.md](README.md) already pointed. It says packs are "built by ETL, not hand-authored" and that "the MVP's single hand-built pack is a bootstrap, not the model." The bootstrap is a script. ROADMAP.md's "hand-built" was the outlier, and has been corrected.

## Why the alternatives lost

**Truly hand-authoring** it would at least force us to feel the format's ergonomics the way an external author will, which is a genuine benefit we are giving up. But it tests the format against a use case the design says will never be the real one, and it pays for that test in Q-ID lookups.

**Letting an agent write the pack from memory** is fast and needs no tooling. It also invents Q-IDs. A hallucinated Q-ID is a plausible-looking string that resolves to the wrong city or to nothing, and it surfaces long after the pack is committed. The whole value of Q-IDs is that they are authoritative; generating them from a language model's memory throws that away while keeping the syntax.

**Building the real import tooling now** means never doing this twice, and one day it is the right call. Today it trades the entire MVP timeline for a pipeline we cannot yet specify — see the statement-ID problem below, which is unresolved and blocks doing it properly.

## The side effect: statement-ID stability stops blocking us

[../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md) raises a real and unsolved problem: if ETL re-runs and emits new IDs for the same facts, every user's answer history for that pack is silently orphaned. It notes the problem is "not urgent while packs are hand-built."

A pack generated once and committed is never rebuilt, so it has no rebuild problem. The question doesn't get answered here — it gets **postponed on purpose**, and the postponement is sound rather than lucky: there is no re-run to be unstable across.

Two caveats keep this honest. The question still **constrains the pack format**, which is a contract with external authors and future ETL — whether [../packs/format.md](../packs/format.md) leaves a deliberate, documented hole there is decided in the packs review, not here. And the postponement expires the moment a second pack is generated, or this one is regenerated. If someone re-runs the script against fresher Wikidata and commits the result, the problem arrives in full, and any answer history against the old pack is what pays for it. **Regenerating this pack is not a routine act.**

## The second pack (`capitals`) uses the same bootstrap

> **[UNREVIEWED]** — written when `capitals` was designed, before it was built. Confirm the "generate-once, never rebuild" reading actually holds the postponement, and that `cap:`/`cc:` prefix namespacing is the real answer to cross-pack ID collision rather than a convenience.

The section above warned that the postponement "expires the moment a second pack is generated." That moment is here: `capitals` is the second pack, and it is built the **same way** — a throwaway SPARQL query (each current sovereign state, `P31 wd:Q3624078`, and its `P36` capital), run once against WDQS, output committed as `.jsonl` and never rebuilt. The script is scaffolding, not pipeline; nothing in the app knows it ran.

The warning was about the wrong thing to fear here. What orphans history is **ID churn across rebuilds of one pack**, not the *existence* of a second pack. Two packs each generated once and frozen are two independent no-rebuild situations, so each keeps its history intact for the same reason `core-cities` does. What a second pack genuinely introduces is **cross-pack ID collision**, and that is already answered: statement IDs are prefixed by pack (`cc:`, `cap:`), which the collision rule in [../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md) names as the structural fix. So the postponement holds — but only as long as neither pack is regenerated, which stays a deliberate, non-routine act.

One data decision belongs to this bootstrap rather than the engine: **`P36` is multi-valued** (South Africa, Bolivia, historical capitals with end-dates). The query keeps the preferred-rank, non-historical value; a country still left ambiguous is **omitted and logged**, never guessed. That trades a handful of genuinely multi-capital countries for the guarantee that every shipped `has_capital` statement has exactly one correct answer — which the single-answer `checkAnswer` requires, and which the qualifier machinery that would model multiple capitals doesn't exist to relax yet (see the qualifier discussion in [../knowledge-graph/statements.md](../knowledge-graph/statements.md)).
