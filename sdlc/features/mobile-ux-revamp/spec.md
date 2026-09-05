# Spec: Mobile UI revamp — a keyboard-first mobile answering view  (from intent)

Status: draft

Requirements + design in one pass. Produced from `intent.md`, constrained by
`CONTEXT.md` vocabulary and the existing `promptVisual` / `revealVisual` model in
`@geo/contract`. See the `to-spec` skill for the fuller shape.

## Summary

The answering experience below the 900px breakpoint is a second-class,
keyboard-unaware layout: the app renders an entirely separate narrow render tree,
and nothing anywhere accounts for the on-screen keyboard (no `visualViewport`, no
dynamic-viewport units). The keyboard overlaps content the browser thinks is
still there, elements shift as focus and the keyboard come and go, and answering
several questions in a row is awkward.

This spec replaces the narrow branch with a **dedicated, keyboard-first mobile
answering view**: a learner can read the question, see the relevant visual,
answer, see the verdict, and advance to the next question — repeatedly — without
their attention (or ideally their fingers) leaving the keyboard, and without the
layout jumping under them. It reuses the existing leaf components (`AnswerBox`,
`VisualAid`, verdict) and changes only the mobile layout shell and the
answer→advance loop. It is **client-only**: no server, grading, or autocomplete
data-path changes.

The exact per-question-type layout and the exact anti-jump mechanic are
deliberately left to a design/prototype step (see *Open questions carried from
intent*); this spec locks the decisions that are settled and frames the two that
are not.

## Requirements

Numbered and testable. **All** are verifiable at the `Quiz` seam under a forced
narrow layout. jsdom cannot render a real on-screen keyboard, but the app reacts
to the keyboard only through the `visualViewport` signal — which we can stub — so
even the geometry/stability requirements (R8–R10) get automated coverage by
driving a fake viewport resize. We do **not** gate this feature on manual
validation; a real-device pass is an optional final smoke check, not a
requirement (see *Testing Decisions*). The design constraint this imposes: the
view must behave correctly and remain stable in the **no-keyboard** case too — it
must never depend on a keyboard being present to look right.

1. Below the existing narrow breakpoint (`<900px`, one `matchMedia` boundary),
   the app renders a single dedicated mobile answering view; the wide layout is
   unchanged.
2. While **asking**, the answer input and its autocomplete suggestions are
   present and reachable, and suggestions render in-flow (never behind where the
   keyboard sits) — preserving today's narrow-branch behavior.
3. While **asking**, the question prompt text is visible.
4. A question whose **promptVisual** is an `image` (e.g. a flag) shows that image
   prominently while asking.
5. A question with **no promptVisual** does not reserve empty visual space while
   asking (unlike the wide layout, which reserves it); the space goes to prompt
   and answer.
6. A question whose map is a **revealVisual** does not render or reserve map space
   while asking; the map appears only after the learner answers.
7. Submitting an answer shows the verdict inline and keeps the typed answer
   visible-but-disabled (as the narrow branch does today); a single, discoverable
   affordance (Enter and a visible Next control) advances to the next question,
   which returns focus to a fresh, enabled answer input.
8. Across the answer→verdict→advance loop, the on-screen keyboard is not
   dismissed by the app's own focus handling (today, focus moves to Next on
   answer, which blurs the input and drops the keyboard — this must not happen).
9. The answer input + suggestions remain visible above the on-screen keyboard
   while asking (keyboard-open geometry, via `visualViewport`).
10. Layout does not shift in response to keyboard show/hide or focus changes;
    layout **may** change in response to learner-initiated reveal (verdict
    appears, revealVisual map appears). "Jumping" (R10) is about the former only.

## User Stories

1. As a mobile learner, I want to answer several questions in a row without the
   keyboard closing between them, so that I keep a fast rhythm.
2. As a mobile learner, I want to press Enter to submit my answer, so that I don't
   have to reach for an on-screen button mid-flow.
3. As a mobile learner, I want to press Enter again to move to the next question,
   so that the whole loop is one thumb on one key.
4. As a mobile learner who prefers tapping, I want a visible Next button, so that
   I have a thumb-friendly fallback to the keyboard advance.
5. As a mobile learner, I want the question text visible while I type, so that I
   can re-read it without dismissing the keyboard.
6. As a mobile learner answering a flag question, I want the flag shown
   prominently while I answer, so that I can study the flag as I type.
7. As a mobile learner answering a text-only question, I want the screen focused
   on the question and my answer, so that no empty panel wastes my limited space.
8. As a mobile learner, I want the map to appear only when it has something to
   show (after I answer), so that map space isn't wasted while I'm still guessing.
9. As a mobile learner, I want my autocomplete suggestions visible above the
   keyboard, so that I can pick one instead of hunting for the hidden list.
10. As a mobile learner, I want to see whether I was right without scrolling, so
    that I get immediate feedback.
11. As a mobile learner, I want the answer box to stay put when the keyboard opens
    and closes, so that I don't lose track of where I'm typing.
12. As a mobile learner, I want elements not to jump around as I move between
    asking and answered, so that the interface feels stable and predictable.
13. As a mobile learner, I want the layout to adapt to the type of question, so
    that each question uses my screen well instead of forcing one rigid template.
14. As a mobile learner on a small phone with the keyboard open, I want the
    essentials (question, input, suggestions) to fit without hunting, so that I
    can answer without fighting the layout.
15. As a returning learner, I want the mobile experience to feel as capable as the
    desktop one, so that I'm willing to practice on my phone.
16. As a learner who toggled autocomplete off, I want the plain input to behave
    well on mobile too, so that my preference is respected in the new view.
17. As a screen-reader user on mobile, I want the answer combobox and verdict to
    keep their existing ARIA semantics, so that the revamp doesn't regress
    accessibility.
18. As a learner answering a "which highlighted country" map question, I want the
    map (its promptVisual) to stay visible while I answer, so that I can still see
    what I'm being asked about.
19. As a mobile learner using the autocomplete feature, I want to be able to interact
    with the autocomplete feature (scroll, select) without the keyboard closing and
    moving UI elements around distractingly. 

## Design

**Scope of change.** Only the mobile presentation of `@geo/web` changes. The
answering screen (`Quiz`) already branches on `useWideLayout()` into two distinct
render trees; this spec rewrites the **narrow** tree into a dedicated
keyboard-first mobile view and leaves the wide tree alone. Leaf components
(`AnswerBox`, `VisualAid` → `ImageAid` / `MapAid`, the verdict/status, feedback)
are **reused**, not rewritten.

**Reserve vs. reclaim — the core layout decision.** The wide layout deliberately
reserves a fixed media column and even leaves an empty prompt-visual slot when a
question has none: a widescreen luxury that buys layout stability. The mobile view
**inverts** this: with a keyboard eating ~45% of a phone screen, it does not spend
space on a slot that has nothing to show *right now*. Occupancy is driven by the
existing `promptVisual` / `revealVisual` model:

- `promptVisual` present (flag `image`, or a map that *is* the question): shown
  while asking.
- `promptVisual` absent: no reserved visual space while asking.
- `revealVisual` (typically the locating map): shown only after the answer, in the
  space reclaimed once the learner is no longer typing.

This reserve-vs-reclaim divergence between desktop and mobile is the spec's main
architectural statement and is recorded in `CONTEXT.md`.

**The answer→advance loop.** Today, reaching the `answered` state moves focus to
the Next button, which blurs the input and dismisses the keyboard — the single
biggest obstacle to the intent. The mobile view keeps the keyboard alive across
the loop: submit shows the verdict inline without stealing focus out of the text
field's context, and advancing to the next question re-focuses a fresh input.
Enter drives both transitions; a visible Next control is the tap fallback. The
precise focus-retention technique (keeping a focused element so mobile browsers
don't collapse the keyboard) is prototype territory (see Open questions).

**Keyboard geometry.** The view becomes keyboard-aware using
`window.visualViewport` (used nowhere today) so the input + suggestions stay above
the keyboard and the layout is measured against the *visible* viewport rather than
the full document. Dynamic-viewport units (`svh`/`dvh`) may support this. Exact
mechanism is design/prototype work; the requirement (R9, R10) is fixed.

**Breakpoint.** Reuse the single existing `<900px` boundary; do not introduce a
third (tablet) layout. The `900` value is currently duplicated between
`useWideLayout` and several CSS media queries — prefactor toward a single shared
source of that breakpoint so the JS layout switch and the CSS agree by
construction.

**Vocabulary.** Use `promptVisual` / `revealVisual` (now glossed in `CONTEXT.md`),
"asking" / "answered" for the two states (matching existing view-state code), and
"mobile answering view" for the new narrow shell.

## Testing Decisions

**What makes a good test here:** assert externally observable behavior at the
component boundary — what a learner sees and can do — never internal layout
implementation. Query by role/label/text as the existing suite does; do not assert
on class names or DOM structure.

**Seam (one, existing).** The `Quiz` component, rendered through the
`setLayout("narrow")` helper already in `Quiz.test.tsx` (which stubs `matchMedia`,
absent in jsdom). All behavioral requirements are reachable here:

- R2–R6: given a question with an `image` promptVisual, the image is present while
  asking; given one with no promptVisual, no visual is present while asking; given
  one whose map is a revealVisual, the map is absent while asking and present after
  answering.
- R7, R8: after submit, the verdict (`role="status"`) is shown, the typed answer
  stays visible-but-disabled, and advancing yields a fresh enabled input — with the
  focus target being the input, not a control that would blur it. R8 is asserted as
  a focus fact (focus lands on the input, never on a control whose focus would drop
  the keyboard), which needs no keyboard to verify.
- R9, R10 via a **stubbed `visualViewport`**: the test installs a fake
  `window.visualViewport` and fires a resize simulating the keyboard opening
  (height shrinks) and closing. Assert that the input + suggestions stay within the
  reported visible area (R9) and that the positions of the tracked elements do not
  change across a keyboard open/close cycle or a focus change, while they *are*
  allowed to change on the asking→answered reveal (R10). This is a real behavioral
  test of the mechanic, not a proxy — the only thing faked is the browser signal
  the mechanic consumes.

**Prior art:** `Quiz.test.tsx` (answering-loop behavior, the `setLayout` helper,
verdict assertions via `role="status"`), `VisualAid.test.tsx` (visual dispatch by
kind), `suggestions.test.ts` (autocomplete filtering). The `setLayout` helper is
the model for the new `visualViewport` stub — a small, explicit environment shim
in the test, guarded like the jsdom-absent `matchMedia`. Runner: `vitest run` in
`@geo/web`.

**Optional real-device smoke check (not a gate):** a final manual pass on a phone
can catch browser-specific keyboard quirks the stub can't model, but the feature's
correctness is defined by the automated suite above, and "done" does not wait on a
manual pass. The no-keyboard behavior must be fully correct on its own.

## Flagged concerns

- **The two central UX decisions are unresolved by design** (per-question-type
  layout; anti-jump mechanic). This spec is honest that they are deferred to a
  design/prototype step, not silently assumed. If a reviewer expects the spec to
  fully pin the visual design, that expectation is wrong for this feature — that's
  what the prototype is for.
- **The keyboard itself can't be rendered in jsdom — but the mechanic can be
  tested.** The app reacts to the keyboard only via `visualViewport`, so a stubbed
  viewport resize exercises R9/R10 for real without a keyboard. Residual risk is
  narrowed to real-device browser quirks, covered by an optional smoke check, not a
  requirement gate. Non-negotiable design consequence: the view must be correct and
  stable with no keyboard present.
- **Keyboard persistence fights browser defaults.** Some mobile browsers dismiss
  the keyboard on any blur or on submit; keeping it up across a question boundary
  may require keeping a focused input at all times. This could constrain the
  advance interaction and needs prototype validation before the plan commits.

## Open questions carried from intent

The intent's open questions were *how* to do this and *what compromises* to make,
with the user wanting to collaborate during design. Status of each:

- **Per-question-type mobile layout (intent Q "what compromises")** — *deferred to
  design/prototype.* Direction is set (flag prominent; text-focused; map on
  reveal; reserve nothing idle) but the concrete layouts per question type are to
  be workshopped. **Recommend a `prototype` before `plan.md`.**
- **Anti-jump / keyboard-stability mechanic (intent Q "how")** — *deferred to
  design/prototype.* Contract is fixed (stable on keyboard/focus; may change on
  reveal); the mechanic (pinned input vs. familiar keyboard-slide vs. other) is
  open. Sliding is acceptable, not banned.
- **Affected systems (intent's ask "if other systems are affected, let me know")**
  — *answered: client-only.* Narrow render tree + new `visualViewport` handling in
  `@geo/web`. No server/grading/autocomplete-data changes; suggestions already
  render in-flow and `/api/entities` + `answerTypes` are untouched.

## Out of Scope

- Any new core feature of the application (per intent).
- The wide (`≥900px`) layout — untouched.
- A separate tablet layout — the `<900px` view serves that range.
- Server, grading engine, autocomplete data path, packs, schema — unchanged.
- Finalizing the visual design of the mobile view — that is the prototype/plan
  step, not this spec.

## Further Notes

Recommended chain from here: **`intent.md` (accepted) → this `spec.md` (accepted)
→ `prototype` to resolve the two open UX questions → `plan.md` → implement.** The
prototype is the natural home for the "workshop / prototype it" the user asked for,
and its output (chosen layouts, chosen anti-jump mechanic) feeds `plan.md`.

## Links

Intent: sdlc/features/mobile-ux-revamp/intent.md
