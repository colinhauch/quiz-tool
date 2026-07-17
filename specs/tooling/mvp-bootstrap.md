# The MVP Pack Bootstrap

How the one `core-cities` pack gets built, given that the import pipeline it would normally come from is deferred. See [README.md](README.md) for the pipeline itself.

## A one-off script, whose output is committed

The pack is generated once by a throwaway SPARQL query against the Wikidata Query Service. The resulting `.jsonl` is committed to the repository and *is* the pack. The script is not maintained, not tested, not part of the build, and not the pipeline — it is scaffolding that gets kicked away.

**Scope: 100 cities**, plus the countries and continents they need. Cut down from ~300 in the 2026-07-17 review — the pack's job is to exercise the engine, and 100 does that as well as 300 while making the exclusions below reviewable by hand.

> **[UNREVIEWED]** — "Top 100" needs a criterion, and it is not yet chosen. Population is the obvious one (`P1082`), but it is ambiguous in a way that matters: city proper vs. metropolitan area vs. urban agglomeration disagree wildly (city-proper puts Chongqing top and drops Tokyo far down the list). Wikidata carries several, qualified by date and by `determination method`. Whatever is chosen, the query has to pick one and say so.

## Why this isn't the import tooling we said we wouldn't build

[ROADMAP.md](../../ROADMAP.md) lists "the Wikidata import tooling itself" as an MVP non-goal, and separately promises a "hand-built `core-cities` pack." Those two are in tension, and reading them literally produces something nobody would do.

Entities are keyed by Wikidata Q-IDs — see [../knowledge-graph/identity.md](../knowledge-graph/identity.md). So "hand-built" means a human looking up roughly 300 city Q-IDs and 200 country Q-IDs by hand, one at a time, and typing them correctly. That is not a bootstrap; it is data entry with a silent failure mode, because a wrong Q-ID looks exactly like a right one until something downstream can't resolve it. `identity.md` even names the reason the Q-ID correspondence exists in the first place: *"the alternative is hand-authoring hundreds of thousands of facts."* The design chose Q-IDs specifically so that nobody would hand-author facts. Hand-authoring the first pack would be the one case where we ignore that.

The non-goal is doing real work; it is just aimed at something else. What it protects against is **shipping and maintaining a pipeline** — a general, re-runnable ETL with source adapters, incremental updates, and a stability contract. That is a project. Running one query once and committing the answer is not that project, and the distinction is what gets committed: **a data file, not a pipeline.** Nothing in the app knows the script ever existed.

This also lands where [README.md](README.md) already pointed. It says packs are "built by ETL, not hand-authored" and that "the MVP's single hand-built pack is a bootstrap, not the model." The bootstrap is a script. ROADMAP.md's "hand-built" was the outlier, and has been corrected.

## Why the alternatives lost

**Truly hand-authoring** it would at least force us to feel the format's ergonomics the way an external author will, which is a genuine benefit we are giving up. But it tests the format against a use case the design says will never be the real one, and it pays for that test in Q-ID lookups.

**Letting an agent write the pack from memory** is fast and needs no tooling. It also invents Q-IDs. A hallucinated Q-ID is a plausible-looking string that resolves to the wrong city or to nothing, and it surfaces long after the pack is committed. The whole value of Q-IDs is that they are authoritative; generating them from a language model's memory throws that away while keeping the syntax.

**Building the real import tooling now** means never doing this twice, and one day it is the right call. Today it trades the entire MVP timeline for a pipeline we cannot yet specify — see the statement-ID problem below, which is unresolved and blocks doing it properly.

## Simplicity is produced, not found

The MVP treats the world as simple: one country per city, one continent per country, no history, no disputes. **The source data is not simple, so the script has to make it so.** Checked against live Wikidata during the 2026-07-17 review, `P17` (country) on four cities:

| City | `P17` claims | Ranks |
| --- | --- | --- |
| Dijon | 1 — France | `normal` |
| Taipei | 2 — Taiwan; Empire of Japan (ended) | `preferred`, `normal` |
| Beirut | 5 — Lebanon + 4 historical (ended) | `preferred`, 4× `normal` |
| Jerusalem | 17 — including Israel *and* Palestine | **two `preferred`**, rest `normal` |

Two lessons. Historical claims are **ordinary**, not exotic — Beirut is not a disputed city and still carries four ended countries; any unfiltered query returns temporal facts. And **rank does not resolve the hard case**: Jerusalem has two `preferred` claims, separated by a `P518` ("applies to part") qualifier. Wikidata's rank is an editorial layer, and it declines to adjudicate exactly where the world does.

So the script filters, in this order:

1. **Best rank only** — take truthy claims, drop `deprecated`.
2. **Drop anything with an `end` qualifier.** Removes Beirut's four historical countries and Taipei's Empire of Japan. What survives is current by construction.
3. **Drop any entity that still has more than one claim.** Jerusalem falls out here.

**Step 3 is a deliberate omission, and its exclusion list is committed next to the pack.** A dropped city is **backfilled** from the next candidate down the ranking, so the pack is exactly 100 cities rather than "100 minus however many were hard".

The cost that buys: the drops stop being visible in the row count, so **the exclusion list is the only record that they happened.** It is not an artifact of the build — it is the evidence, and it belongs in review alongside the pack. Without it, "100 cities" quietly reads as "the top 100 cities", and the difference is exactly the interesting cities.

It is an omission rather than a dodge because the disputes have a real design waiting for them: a later pack states them as facts — `s(Israel, claims, Jerusalem)` and `s(Palestine, claims, Jerusalem)` — rather than picking a winner. The dispute *is* the data. This needs no engine support and no new relation machinery, which is the uniform fact model working as intended; see [../knowledge-graph/README.md](../knowledge-graph/README.md). The alternative — a `disputed` flag, or leaning on rank to pick — would put a political judgement inside the engine.

**The rule this establishes: an entity the MVP cannot state simply is excluded, not simplified.** Choosing a country for Jerusalem to keep the row count up would be the engine telling a lie it has no standing to tell.

## The side effect: statement-ID stability stops blocking us

[../knowledge-graph/open-questions.md](../knowledge-graph/open-questions.md) raises a real and unsolved problem: if ETL re-runs and emits new IDs for the same facts, every user's answer history for that pack is silently orphaned. It notes the problem is "not urgent while packs are hand-built."

A pack generated once and committed is never rebuilt, so it has no rebuild problem. The question doesn't get answered here — it gets **postponed on purpose**, and the postponement is sound rather than lucky: there is no re-run to be unstable across.

Two caveats keep this honest. The question still **constrains the pack format**, which is a contract with external authors and future ETL — whether [../packs/format.md](../packs/format.md) leaves a deliberate, documented hole there is decided in the packs review, not here. And the postponement expires the moment a second pack is generated, or this one is regenerated. If someone re-runs the script against fresher Wikidata and commits the result, the problem arrives in full, and any answer history against the old pack is what pays for it. **Regenerating this pack is not a routine act.**
