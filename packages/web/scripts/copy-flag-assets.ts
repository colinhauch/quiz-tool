import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Copies the `flags` pack's vendored SVGs into the web app's served public dir,
 * so the Cloudflare Worker's `[assets]` binding serves them at `/flags/<iso>.svg`
 * (spec #180). The pack owns its images the way it owns its statements; the
 * copies under `public/flags/` are generated (gitignored) — this script is the
 * one that regenerates them.
 *
 * Wired as a `predev`/`prebuild` hook, so it runs before both `vite dev` (which
 * serves `public/`) and `vite build` (which copies `public/` into `dist/`, the
 * directory the Worker serves). Idempotent: the destination is wiped and rebuilt
 * each run, so a flag removed from the pack does not linger in the served set.
 *
 * Resolved from this file's own location (not cwd) so it works no matter which
 * package directory the build invokes it from.
 */
const src = fileURLToPath(new URL("../../../packs/flags/assets/", import.meta.url));
const dest = fileURLToPath(new URL("../public/flags/", import.meta.url));

if (!existsSync(src)) {
  console.error(`copy-flag-assets: source not found: ${src}`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

const count = readdirSync(dest).filter((f) => f.endsWith(".svg")).length;
console.log(`copy-flag-assets: copied ${count} flag SVG(s) → ${dest}`);
