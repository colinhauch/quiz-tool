# Country Flags pack

Show a country's flag, name the country: **"This is the flag of what country?"**
(spec #180). Statement-only pack over `core-geo` country entities — `core-geo`
stays the owner; this pack only asserts `flag` statements about them.

## How a flag becomes a question

- Each statement's object is an **`image` literal**:
  `{ datatype: "image", value: { src: "/flags/jp.svg", alt: "Flag of a country" } }`.
  `src` is the *served* path; `alt` is deliberately generic so the answer never
  leaks to assistive tech or view-source.
- The relation `flag` is **subject-hidden only** (`hiddenSlots: ["subject"]`) —
  the flag is what the card shows, so it's never the slot to guess.
- The engine derives the prompt image from that literal (`promptVisualFor` in
  `packages/engine/src/question.ts`) and puts it on `promptVisual`; the client
  draws it as an `<img>` (`packages/web/src/ImageAid.tsx`).
- The question noun ("country") is **not** hard-coded in the generator: it comes
  from the hidden subject's type via `displayNoun` (`packages/engine/src/noun.ts`).
  A future "US State Flags" pack reuses this same `flag` relation — it only needs
  entities typed `usState` and one entry in `DISPLAY_NOUNS`.

## Assets: source of truth → served files

The pack owns its images. **`assets/<iso-alpha-2>.svg`** (e.g. `assets/jp.svg`)
is the source of truth, committed here.

They reach the browser through a copy step, because packs bundle *data* into the
server while static files are served from the web app's `[assets]` binding:

```
packs/flags/assets/*.svg  --(copy-flag-assets)-->  packages/web/public/flags/*.svg  --(vite)-->  dist/flags/*.svg  --(Worker [assets])-->  /flags/*.svg
```

- The copier is `packages/web/scripts/copy-flag-assets.ts`, wired as the web
  package's `predev` / `prebuild` hook, so it runs before both `vite dev` and
  `vite build` (and therefore before the Worker's `[build]` command, which calls
  the web build). It wipes and rebuilds the destination each run, so a removed
  flag doesn't linger.
- **`packages/web/public/flags/` is generated and gitignored** — never edit or
  commit files there; edit `assets/` and let the copier regenerate them.
- `pnpm packs:validate` checks every `image` literal's `src` resolves to a file
  in `assets/` (the check lives in `packages/server/src/validate-packs.ts`, which
  is Node-only — the pure validator stays fs-free so it can run on the Worker).

## Coverage

This first slice (#181) ships a handful of **hand-authored, simplified** flag
SVGs as tracer stand-ins (Japan, France, Italy, Nigeria, Germany). Ticket #182
replaces them wholesale with the full UN-members-and-observers set fetched from
Wikimedia Commons (Wikidata P297 → P41) by an author-time script, with per-file
provenance. Answer-name aliases for the tricky countries land in #183.
