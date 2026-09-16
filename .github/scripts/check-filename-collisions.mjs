#!/usr/bin/env node
// Fails if two tracked files would collide on a case-insensitive filesystem
// (macOS/Windows) in a way that breaks module resolution or checkout — a class
// Linux CI cannot surface on its own (both files coexist, every build stays
// green). This is what happened in #262: `abilityChart.ts` (model) and
// `AbilityChart.tsx` (component) differ only by case, and on macOS the resolver
// matched `./AbilityChart.js` to the lowercase model, breaking `vite build`.
//
// Two collision classes are detected, both scoped to a single directory (where
// relative imports and the checkout actually clash):
//
//   1. Module collision — files whose names, with a JS/TS extension removed and
//      lowercased, are equal (e.g. abilityChart.ts vs AbilityChart.tsx, or
//      foo.ts vs foo.js). TS/JS resolution ignores both the extension and (on a
//      case-insensitive FS) the case, so these are ambiguous. `.d.ts` keeps its
//      `.d` so a declaration beside its impl (foo.d.ts + foo.ts) is NOT flagged.
//   2. Exact-name collision — any two files (e.g. two .css, or a data file)
//      whose full names are equal case-insensitively. Non-module extensions are
//      kept, so index.ts + index.css never collide.
//
// No dependencies; runs on the job's existing Node.

import { execFileSync } from "node:child_process";

const MODULE_EXT = /\.(?:tsx?|jsx?|mts|cts|mjs|cjs)$/i;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

/** @type {Map<string, string[]>} key -> original paths */
const groups = new Map();

for (const path of files) {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);

  // Module files key on their extension-less stem so .ts/.tsx/.js variants that
  // resolve to the same specifier collide; everything else keys on its full name.
  const isModule = MODULE_EXT.test(name);
  const stem = isModule ? name.replace(MODULE_EXT, "") : name;
  const cls = isModule ? "module" : "file";
  const key = `${cls}\0${dir.toLowerCase()}\0${stem.toLowerCase()}`;

  const list = groups.get(key);
  if (list) list.push(path);
  else groups.set(key, [path]);
}

const collisions = [...groups.values()].filter(
  // Distinct paths only: the same path can't appear twice from git ls-files, but
  // guard against it anyway.
  (paths) => new Set(paths).size > 1,
);

if (collisions.length > 0) {
  const detail = collisions
    .map((paths) => `  ${paths.sort().join("  <->  ")}`)
    .join("\n");
  const msg = `Case-insensitive filename collision(s) detected (green on Linux, broken on macOS/Windows checkouts):\n${detail}`;
  // GitHub Actions error annotation + human-readable body.
  console.error(`::error::${msg.split("\n")[0]}`);
  console.error(msg);
  process.exit(1);
}

console.log(`No case-insensitive filename collisions (${files.length} tracked files checked).`);
