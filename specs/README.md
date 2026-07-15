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

### When to add or split

A concept earns its own file when someone would want to **read it without its parent**. If it can't be understood alone, splitting it made things worse — now the reader loads two files instead of one.

A file becomes a folder when it has **two or more real children** that each pass the read-independence test. Never a folder with one child. Size is a symptom, not a criterion: a long file on one coherent concept stays one file.

Roots are just concepts too. A UI surface sitting next to a data structure is fine — group by concept and regroup later if the tree gets awkward. Update this index when you do.

### Open questions

Open questions live **at the level they apply to**. A question about a technical detail goes in the leaf that it blocks, so whoever implements that leaf sees it. A question about system architecture lives high in the tree. Any folder may have an `open-questions.md`; none are required. When a question resolves, it becomes rationale in the same file.

### Keeping this index honest

When you add, split, or promote a spec out of stub status, update the table below. An out-of-date index is the one failure that breaks the whole system — it is how a reader decides what *not* to read.

## Index

**Stubs are marked.** A stub has no content worth loading — don't open it. It marks a concept we know is coming and where it will go.

| Concept | | What's in it |
|---|---|---|
| [knowledge-graph/](knowledge-graph/) | | The uniform fact model: entities, relation types, statements, reification, rank. Why everything quizzable is one shape. |
| [packs/](packs/) | | Extensibility and distribution. Why the engine knows structure and packs know semantics. |
| [questions/](questions/) | | Turning facts into questions: templates, directions, distractors, numeric and temporal handling. |
| [learning/](learning/) | | What the user knows and what to ask next: the answer log, scheduling, insight and gap analysis. |
| [storage/](storage/) | | Persistence choices: why this database, what we liked, what would make us move. |
| [product/](product/) | _stub_ | Product and UX concepts: what the experience should feel like and why. |
| [deployment/](deployment/) | _stub_ | How this ships and runs. |
| [tooling/](tooling/) | _stub_ | Pack authoring and the Wikidata import pipeline. Constrains the pack format today; built post-MVP. |

## Status

The engine specs (`knowledge-graph`, `packs`, `questions`, `learning`, `storage`) are drafted from the original data-architecture design and describe an unbuilt system — they are intent, not description. Nothing here has been validated against a running implementation yet.
