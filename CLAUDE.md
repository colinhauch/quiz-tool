# Geography Learning Engine

A quiz app that teaches world geography from a knowledge graph, tracks every answer, and surfaces knowledge gaps. TypeScript. Pre-implementation — the design exists, the code does not.

## Two kinds of documentation

**`/specs` — concepts and decisions.** Why the system is shaped the way it is: motivation, rationale, rejected alternatives, failed attempts, open questions. Organized by concept, because concepts are what the code tree can't express. Read these when you are about to **build something new** or make a structural decision.

**`CLAUDE.md` files — implementation and development.** How to work in a given directory. Organized by directory, alongside the code. Read these when you are about to **maintain or extend existing code**.

**The code is the source of truth for how the system works.** If you can learn something by reading the code, read the code — specs deliberately do not restate it. Specs carry what the code cannot teach you. Memory files carry what is worth knowing without re-reading everything.

## Using the specs

Start at [specs/README.md](specs/README.md) — it is both the index and the editorial guide for the system. It marks which concepts are stubs, so you can decide what not to open.

Don't read it for work that isn't architectural. Version control, discussion, small maintenance — skip it.

## Updating the specs

**When a decision gets made or something is learned that changes future work, record it.** Read [specs/README.md](specs/README.md) first — it has the rules for where things go and when a concept earns its own file — then edit the relevant leaf in place. Specs are edited, not versioned; git holds the history.

The highest-value moment to write is right after a hard decision or a reversal, while the reasoning is still recoverable. Failed attempts especially: nothing else records those.

Keep the index in [specs/README.md](specs/README.md) current when you add a spec or promote one out of stub status.
