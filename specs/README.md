# Specs

Architectural and product concepts for the geography learning engine. Start here; descend only into what you need.

## What a spec is

A spec is a **primer on a concept** — enough context that someone (human or agent) can build something new in that area competently, without having read the whole codebase or been present for the decisions.

Specs hold what the code cannot teach you:

- **Motivation** — why this concept exists, what problem it solves.
- **Rationale** — why it is shaped this way and not the obvious alternative.
- **Rejected alternatives** — what was considered and why it lost.
- **Failed attempts** — what was tried and didn't work. This is the most valuable content here and the easiest to lose.
- **Constraints on future work** — what must stay true as the system grows.
- **Open questions** — what is undecided, recorded next to the thing it blocks.

## What a spec is not

**Specs are not the source of truth for how the system works. The code is.** If an agent can learn something by reading the code, it should read the code. A spec that restates the shape of a type is a second source of truth that will drift, and drifting docs are worse than no docs.

Specs are also not implementation or maintenance guidance. That is what `CLAUDE.md` memory files are for.

| | Specs (`/specs`) | Memory files (`CLAUDE.md`) |
|---|---|---|
| **Answers** | Why is it like this? What else did we try? | How do I work in this directory? |
| **Organized by** | Concept | Directory (mirrors the code) |
| **Audience** | Someone about to *build* something new | Someone about to *maintain* existing code |
| **Lifespan** | Long — outlives implementations | Tied to the code it sits beside |

A concept and its code are usually in different places, and that is the point: concepts are exactly what the code tree cannot express. A UX concept spanning three components has no directory to live in. It gets a spec.

## Writing and editing specs

**Edit in place.** Specs describe what we currently believe. Git holds the history — there are no immutable decision records here, no superseding chains. Expect to edit often.

**Prose over structure.** A spec is read to be understood, not consulted like a reference. Write paragraphs.

**Enumerations are snapshots, not registries.** A spec may list things (the current distractor strategies, say) to orient a reader. When it does, it points at the code that actually owns the list. If they drift, the code is right. Don't try to keep them in sync — the list is there for orientation, not authority.

**Record the "why" while you still remember it.** The single highest-value moment to write is right after a decision, especially one that was hard or reversed an earlier choice. That reasoning is unrecoverable later.

### Reference files

A few specs have a companion marked *reference* — `shapes.md`, `format.md`, `sql-examples.md`, `template-shape.md`, `interfaces.md`. These hold concrete proposed detail: record shapes, schemas, interfaces.

They exist for a specific and temporary reason. **This system was designed before the code, so the proposals are currently all we have** — and once the code exists, they become a record of the *first attempt*. If the implementation diverges, that divergence is a decision worth seeing, and it's easier to see with the original beside it.

They are second-class on purpose. Reference files are the exception to "don't restate the shape," and they are the files most likely to rot. Rules for them:

- **The concept README is the real spec.** Reference is the appendix; it never carries the argument.
- **Once code exists, the code wins** — without exception, and the reference file is history, not a claim.
- **Don't add more.** New reference files should be rare and deliberate. If you're tempted, ask whether the code could express it instead.

`format.md` is the one likely to stay genuinely useful, since the pack format is a contract with external authors and ETL rather than something app code fully expresses.

### When to add or split

A concept earns its own file when someone would want to **read it without its parent**. If it can't be understood alone, splitting it made things worse — now the reader loads two files instead of one.

A file becomes a folder when it has **two or more real children** that each pass the read-independence test. Never a folder with one child. Size is a symptom, not a criterion: a long file on one coherent concept stays one file.

Roots are just concepts too. A UI surface sitting next to a data structure is fine — group by concept and regroup later if the tree gets awkward. Update this index when you do.

### Open questions

Open questions live **at the level they apply to**. A question about a technical detail goes in the leaf that it blocks, so whoever implements that leaf sees it. A question about system architecture lives high in the tree. Any folder may have an `open-questions.md`; none are required. When a question resolves, it becomes rationale in the same file.

## Review status

Most of these specs were drafted by an agent and **have not been reviewed by a human**. That matters: an unreviewed spec is a plausible-sounding account of a decision that may never have been made. Do not treat it as settled just because it is written down and sounds confident.

Every unreviewed file or section carries a blockquote marker — the literal word `UNREVIEWED` in square brackets and bold, followed by an em dash and one line on what specifically needs a human's eyes:

```
> **[UN­REVIEWED]** — the retroactivity argument is stated far more forcefully
> here than in the source. Confirm it's a rule and not a preference.
```

(The example above contains an invisible soft hyphen so this file doesn't match its own grep. Real markers are one unbroken word.)

Say what is actually suspect. "Needs review" tells a reader nothing they didn't know from the marker's presence; naming the claim you're least sure of tells them where to look and lets them review a file in a minute instead of an hour.

**A whole file:** the marker goes directly under the title, and everything below it is suspect.

**A single section:** the marker goes under that heading, and the rest of the file is vouched for. Review is a property of *claims*, not of files — a spec can be mostly verified with one uncertain corner, and marking the whole file would waste a re-read of the good parts.

**Empty stubs carry no marker.** They make no claims, so there is nothing to review. A stub that starts asserting things needs one.

Find everything awaiting review with:

```
grep -rn "\[UNREVIEWED\]" specs/
```

That grep is the interface. Ask an agent to run it and walk the results with you.

### Reviewing and un-reviewing

**To mark something reviewed, delete its marker.** Nothing replaces it — an absent marker means a human has read the claim and vouches for it. Absence is the signal, which keeps reviewed files clean and puts the visual weight on what still needs attention.

**When you substantively edit a reviewed spec, add the marker back and say so in your response.** Substantively means the claim changed, not the wording. A typo fix or a link repair does not un-review a spec; a new rationale, a reversed decision, or a rewritten section does. If you are unsure, mark it — a false alarm costs a glance, a missed one silently launders an agent's guess into an approved decision.

### Keeping this index honest

When you add, split, or promote a spec, update the table below.

**The index is a summary, not the source of truth.** Each file's own marker is authoritative for its status; this table mirrors it so a reader can triage before spending a hop. Expect the mirror to lag occasionally — when the table and a file disagree, the file is right. Fix the table when you notice.

## Index

`stub` means no content worth loading — don't open it; it marks a concept we know is coming and where it will go. `unreviewed` means drafted but not yet vouched for by a human — read it, but verify before relying on it. `reviewed` means a human has vouched for the claims; rely on it. `mixed` means the folder's files differ — the entry says which is which, and each file's own marker is authoritative.

| Concept | Status | What's in it |
|---|---|---|
| [knowledge-graph/](knowledge-graph/) | mixed | The uniform fact model: entities, relation types, statements, rank. Why everything quizzable is one shape. README reviewed; child files unreviewed. |
| [packs/](packs/) | mixed | First-party, topic-scoped modules that ship data *and* the code to handle it. Why the engine runs the learning loop and packs supply the domain. README reviewed; format.md unreviewed. |
| [questions/](questions/) | unreviewed | Turning facts into questions via pack-provided generator code: directions, distractors, numeric and temporal handling. |
| [learning/](learning/) | unreviewed | What the user knows and what to ask next: the answer log, scheduling, insight and gap analysis. |
| [storage/](storage/) | unreviewed | Persistence choices: why this database, what we liked, what would make us move. Includes the reference SQL schema. |
| [product/](product/) | reviewed | Product and UX concepts. Why a sitting has no boundary, and what that buys. |
| [deployment/](deployment/) | reviewed | How this ships and runs. Why the MVP is a local web app, and what that commits us to. |
| [tooling/](tooling/) | mixed | Pack authoring and the Wikidata import pipeline. Constrains the pack format today; built post-MVP. [mvp-bootstrap.md](tooling/mvp-bootstrap.md) is reviewed; the README is a stub and unreviewed. |
| [open-questions.md](open-questions.md) | unreviewed | Undecided questions at the architecture level, spanning more than one concept. |

Reference appendices sit beside their concept README: [knowledge-graph/shapes.md](knowledge-graph/shapes.md), [packs/format.md](packs/format.md), [questions/template-shape.md](questions/template-shape.md), [learning/interfaces.md](learning/interfaces.md), [storage/sql-examples.md](storage/sql-examples.md). All unreviewed, all superseded by code once it exists.

## Provenance

These specs were decomposed by an agent from a single hand-written design document (`geo-quiz-spec.md`, now removed — see git history). The **decisions** in that document are the author's; the **prose explaining them** is largely the agent's reconstruction, which is why nothing here is reviewed yet. Some rationale is inferred rather than recorded, and inferred rationale is exactly the kind of thing that sounds right and isn't.

Everything describes an **unbuilt system**. These are intent, not description — nothing here has been validated against a running implementation.
