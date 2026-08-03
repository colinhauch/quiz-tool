# Important Instructions

- **Be extremely brief.** You may sacrifice grammar for the sake of concision.
- **When a decision gets made or something is learned that changes future work, record it.** See the "Updating the specs" section for details.

# Running long-lived processes

Run servers yourself — but **never with a shell `&`**. That detaches from the harness: invisible to the user, no handle, survives the conversation.

Use the Bash tool's `run_in_background: true` instead. The user sees it in the UI, output comes back via `TaskOutput`, `TaskStop` kills it. For short checks, `timeout 15 <cmd>` in the foreground is simpler. (See also `/run`.)

Shut down what you start, in the same session. Identify before killing — `ps -o pid,ppid,lstart,command -p <pids>` — since ports surface unrelated processes (VS Code helpers, other projects).

# Geography Learning Engine

A quiz app that teaches world geography from a knowledge graph, tracks every answer, and surfaces knowledge gaps. TypeScript. Pre-implementation — the design exists, the code does not.

## Two kinds of documentation

**`/specs` — concepts and decisions.** Why the system is shaped the way it is: motivation, rationale, rejected alternatives, failed attempts, open questions. Organized by concept, because concepts are what the code tree can't express. Read these when you are about to **build something new** or make a structural decision.

**`CLAUDE.md` files — implementation and development.** How to work in a given directory. Organized by directory, alongside the code. Read these when you are about to **maintain or extend existing code**.

**The code is the source of truth for how the system works.** If you can learn something by reading the code, read the code — specs deliberately do not restate it. Specs carry what the code cannot teach you. Memory files carry what is worth knowing without re-reading everything.

## Using the specs

Start at [specs/README.md](specs/README.md) — it is both the index and the editorial guide for the system. It marks which concepts are stubs, so you can decide what not to open.

Don't read it for work that isn't architectural. Version control, discussion, small maintenance — skip it.

## Specs are not all reviewed

**Most specs were drafted by an agent and have not been reviewed by a human.** They are plausible accounts of decisions, and some of the reasoning in them is reconstructed rather than recorded. Unreviewed does not mean wrong — it means unverified, and it sounds exactly as confident either way.

Unreviewed files and sections carry a marker: `> **[UNREVIEWED]**`, with a line on what specifically needs checking. Find them all with:

```
grep -rn "\[UNREVIEWED\]" specs/
```

**If you're relying on an unreviewed claim for something that matters, say so rather than proceeding quietly.** An absent marker means a human vouched for it.

Reviewing marks it done by **deleting the marker**. When you substantively edit a reviewed spec — the claim changed, not just the wording — **add the marker back and say so in your response**.

## Updating the specs

Read [specs/README.md](specs/README.md) first — it has the rules for where things go and when a concept earns its own file — then edit the relevant leaf in place. Specs are edited, not versioned; git holds the history.

The highest-value moment to write is right after a hard decision or a reversal, while the reasoning is still recoverable. Failed attempts especially: nothing else records those.

Keep the index in [specs/README.md](specs/README.md) current when you add a spec or promote one out of stub status.

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues. Skills use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout with `CONTEXT.md` at root. See `docs/agents/domain.md`.
