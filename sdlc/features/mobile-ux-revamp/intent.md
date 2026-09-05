# Intent: Mobile UI revamp — make the app genuinely usable on a phone

Status: draft

## Problem
The mobile UI is difficult to use and inhibits engagement. UI elements jump
around the screen, several features are hard to operate on a phone (autocomplete
is a clear example), and the overall answering flow is awkward. Together this
makes the app frustrating to use on a mobile screen.

## Why it matters
Mobile is one of the primary ways users will use this application. All of our
main features need to be easy to use and participate in from a mobile screen. If
the mobile experience stays this rough, users won't engage.

## Proposed outcome
A mobile experience that is genuinely usable. Concretely:
- A user can answer multiple questions in a row **without their fingers leaving
  the keyboard**.
- From the mobile view — **with the keyboard open** — the user can see the
  question, any media (images), the autocomplete suggestions, and all other
  features.
- The layout should be stable, not jumping around.

Some compromises may be necessary. The goal is to revamp the mobile experience so
the app is functional on a mobile interface; how far we go and what we trade off
is part of what this effort decides.

## Affected users & systems
Believed to affect only the mobile DOM / mobile presentation of the web app. If
other systems (server, grading, autocomplete data path, packs) are actually
touched, the user wants to know — to be confirmed during spec/design.

## Constraints
- No new core features of the application (see Out of scope).
- Keep the app functional with the on-screen keyboard open — that constraint
  drives the layout.

## Out of scope
- Implementing any new core features of the application. This is a mobile
  usability/UX revamp of existing functionality, not new capability.

## Open questions
- **How** exactly we achieve this (layout strategy, keyboard handling) is
  undecided.
- **What compromises** we make (what to hide/collapse/relayout when the keyboard
  is open) is undecided.
- The user wants **input during design** on both of the above.
- Which systems beyond the mobile DOM (if any) are affected — answer during spec.
