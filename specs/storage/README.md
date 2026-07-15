# Storage

Where the data lives, why we picked it, and what would make us leave.

## Everything is behind repository interfaces

`EntityRepo`, `StatementRepo`, `AnswerLogRepo`, `CardRepo`, `PackRepo`. **The engine never issues a query.**

The reason is specific rather than general good-practice: this project has a *known, planned* storage migration ahead of it — possibly two. Local SQLite gives way to Postgres when accounts arrive, and the graph traversals may eventually justify a graph store. We know these are coming and we do not know when. The repo seam is what makes each of them a swap instead of a rewrite, and it is far cheaper to build now than to retrofit once query construction has leaked into the question generator.

The rule to preserve: if engine code needs a new query shape, it gets a new repo method. It does not get a query.

## Why SQLite

**Local-first, zero-ops, embedded.** The MVP has one user on one device, no server, no network, no account. SQLite is the only choice that adds no infrastructure at all — the database is a file, and later it ships inside the app.

**It handles the graph fine at this size.** The worry with a relational store is the traversals — region rollups walk `located_in` up to a continent. SQLite has recursive CTEs, and at MVP scale (~300 cities) that traversal is trivially fast. The graph-shaped data does not require a graph database; it only requires one when traversal depth and variety outgrow what recursive SQL can express readably.

**JSON columns absorb the schemaless parts.** Qualifiers, literals, labels, and per-algorithm scheduler state are all genuinely open-ended — packs define their own qualifier vocabularies, so those cannot be columns. SQLite's JSON support means the parts of the model that resist a schema get to stay unschematized without a second store.

**It is the local half of the eventual multi-user story anyway.** Sync architectures generally want a local database; picking SQLite now is not a decision we expect to unwind when accounts arrive, only one we expect to supplement.

## What we gave up

Concurrent writers, which we do not have. Server-side querying, which we do not need. Native graph traversal syntax — recursive CTEs are workable but not pleasant, and a deep multi-hop query is meaningfully harder to read in SQL than in Cypher.

## The exit condition

Move `StatementRepo` to a Cypher-speaking store (Kùzu, Neo4j) **when traversals grow deep and varied enough to hurt** — when insight queries are slow at real pack scale, or when recursive CTEs become the thing nobody wants to touch.

That is a repo swap, not a redesign, and stating the trigger now is the point of writing this down: it means the migration is a planned response to an observed signal rather than an anxious rewrite. It also means nobody needs to pre-optimize for it today.

Note that the answer log and cards would likely *stay* relational even then — they are flat, append-heavy, and aggregate-scanned, which is the opposite of what a graph store is for. The exit is partial by default.
