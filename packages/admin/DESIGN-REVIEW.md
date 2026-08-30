# Admin visualizer — UI/UX design review (#145)

A holistic pass over the five surfaces (Packs, Users, Results, Graph Health,
Generator Preview) once all were built (#136–#144), and the fixes it turned up.
UI-only: no routes, no data shapes, no component behavior changed. The fixes are
almost entirely one file — `src/index.css` — plus this note.

## What was already right (kept, not touched)

- **Consistent class vocabulary.** Every surface, built by a different slice,
  converged on the same names — `admin-surface`, `admin-surface__title`,
  `admin-link`, `admin-muted`, `admin-breadcrumb`, and per-surface wrappers
  (`admin-pack-detail`, `admin-user-detail`, `admin-results-charts`, …). That
  discipline is what let this review be a stylesheet, not a rewrite.
- **Empty/thin-data states are deliberate everywhere.** Users and Results are
  near-empty until the population grows, and each surface says so in words —
  "No answers match the current filters.", "No activity yet.", "No pack ability
  recorded yet.", "This pack has no statements." — rather than rendering a broken
  frame. Loading states (`Loading…`) and not-found states ("Unknown pack: …")
  are handled too.
- **Semantic structure & keyboard reachability.** Real `<table>`/`<thead>`,
  `<dl>` for entity/preview facts, `<nav aria-label="Breadcrumb">`, every
  clickable is a real `<button>` (so tab/enter work for free), the sparkline is
  an `<svg role="img" aria-label>`, and self-referential graph links are
  `disabled` rather than dead.

## Findings & fixes

1. **The shared vocabulary was unstyled (the core finding).** `index.css` held
   only the seven foundation classes from the shell (#135); every surface's
   tables, links, muted text, breadcrumbs, cards, filters, leaderboards and
   sparkline rendered with browser defaults — no hierarchy, no density control,
   links indistinguishable from text. Fix: a cohesive stylesheet for the whole
   vocabulary — typographic scale for `h2/h3/h4` inside a surface, compact
   tables with a sticky header, zebra rows and a hover row, accent links with a
   clear hover/focus/disabled treatment, muted text, and card treatments for the
   per-surface wrappers.

2. **`admin-highlight` was referenced but never defined — a real gap, not just
   cosmetics.** The Graph Health → Packs drill-down (and the Results/Answer-Log
   "jump to Card") lands on a specific statement row keyed by
   `highlightStatementId`, but with no style the operator couldn't see *where*
   they landed — defeating the point of the jump. Fix: a highlighted row
   background + left accent bar, so a drilled-to statement is obvious.

3. **Information density on data-heavy tables.** Results is an 8-column table;
   several surfaces stack multiple tables. Fix: tighter cell padding, a sticky
   `thead` so headers survive a long scroll, and the surface pane owns
   horizontal overflow so a wide table scrolls within the content area instead
   of forcing the whole app sideways.

4. **Charts / analytics legibility.** The "charts" are tables plus one inline
   SVG sparkline (real charting waits on multiple-choice / a charting lib — out
   of scope here). Fix: the sparkline gets an explicit accent stroke and a
   framed plot box so it reads as a chart, and the leaderboard / hardest-easiest
   groups lay out as side-by-side columns that wrap on narrow widths rather than
   as three stacked lists.

5. **Filters form layout.** The Results filter controls were a bare row of
   `<label>`s. Fix: a wrapping grid with each label stacked over its input, a
   consistent input/select style, and the Apply button aligned to the row.

6. **Accessibility — focus & contrast.** Fix: a visible `:focus-visible` ring on
   every link, nav item, input, select and button; the accent darkened to
   `#3f57d6` so link text and the active-nav background both clear WCAG AA
   (4.5:1) on their backgrounds; muted text verified at ≥4.5:1.

## Deliberately deferred (noted, not fixed here)

- Real chart rendering (bars/lines beyond the sparkline) — waits on a charting
  approach; the data and tables are in place.
- A global search / column sort on the big tables — a feature, not a design fix.
- Dark mode — this is a localhost single-operator tool; one light theme is
  intentional.
