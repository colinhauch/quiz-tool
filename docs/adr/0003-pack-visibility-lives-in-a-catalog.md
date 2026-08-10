# Pack visibility and tier live in a catalog, not in `pack.json`

Which packs a learner is offered — and, later, which they must pay for — is governed by `packs/catalog.json`, a sparse `packId → policy` map read at boot. It never touches the loader: every discovered pack is still loaded into the one graph, always (ADR-0001). The catalog only filters what the server *offers*, at the `/packs` serving boundary.

A policy today carries `hidden` (loaded, but withheld from the picker) and a reserved `tier` (`"free" | "premium"`). `tier` is parsed and carried but **nothing gates on it yet** — there is no user model to gate against. The first real use of the file is retiring `core-cities`, which has no assertion worth quizzing (a bare city has nothing to claim; `capital-cities` replaces it), by hiding it rather than deleting its data.

## Considered options

**A `visible`/`tier` field in `pack.json`** — colocated, discovered for free, no drift — was rejected because it conflates two lifecycles. `pack.json` carries a pack's intrinsic authoring facts: identity, version, license, credits. Visibility and price are *product policy*: they change without the pack changing, and they will eventually differ per deployment and per user. Baking "premium" into a CC0 data file makes it a lie the moment a free and a paid tier want different answers — and a pack fundamentally *cannot* know whether *this* learner may see it, which is why the decision belongs next to the user at the serving boundary, not in the artifact.

**A full registry enumerating every pack** was rejected as a direct violation of ADR-0001 ("no list of packs in source"). It would also drift: rename a pack directory and the registry dangles. The catalog is instead a **sparse override map** — it names only the exceptions, and an absent pack (or an absent file) is visible and free. Annotating without enumerating keeps the discovery property intact.

**Enforcing `tier` now** was rejected as dead gating: a check with no user identity behind it is a flag pretending to be a fence. The field is reserved and documented so authors can annotate ahead of enforcement; the enforcement seam is the same `/packs` filter that `hidden` already uses.

## Consequences

**The filter composes with, but stays distinct from, "yields no questions."** A pack can be absent from the picker for two unrelated reasons: it is entities-only (`core-geo`) or the catalog hides it (`core-cities`). These are kept as separate steps in `createApp`, so neither reason masks the other.

**A malformed catalog fails boot, like a malformed pack.** Same reasoning as the loader (ADR-0001): a typo'd policy that silently offers a paid pack for free, or drops a pack from the picker, is the failure to avoid, so `loadCatalog` throws rather than skipping a bad entry.

**Hiding is reversible; the data survives.** `core-cities` remains on disk and in the graph. If the "populous cities" angle ever comes back (a different, deliberate `core-geo` entity refresh), the pack is un-hidden by deleting one line, not resurrected from git.
