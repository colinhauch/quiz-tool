/**
 * `pnpm packs:validate` — the validator's authoring/CI caller.
 *
 * One validator implementation, two callers: this, and the loader at boot. The
 * point of the second caller is that an author can find out a pack is broken
 * without starting the server, and CI can fail on it — but never that the two
 * disagree, which is why the *shared* checks all live in `validatePacks`.
 *
 * The one check that lives *here* and not there is the image-asset existence
 * check (spec #180): a statement's `image` literal names a served file
 * (`/flags/jp.svg`) that must be vendored in the pack (`assets/jp.svg`), and
 * verifying that is filesystem work. The pure validator must stay fs-free — it
 * also runs on the Cloudflare Worker, where there is no disk (the bundle
 * replaces it) — so a disk check cannot go there. This CLI is Node-only, so it
 * is the right home.
 */
import { existsSync } from "node:fs";
import { basename } from "node:path";
import { discoverPacks, type LoadedPack, loadPack } from "./pack-loader.js";
import { PackValidationError, validatePacks } from "./pack-validator.js";

/**
 * Every `image`-literal statement points at a vendored file. `src` is the served
 * path (`/flags/jp.svg`); the source of truth is the pack's `assets/` dir keyed
 * by the same basename. Returns a problem per missing file.
 */
function checkImageAssets(packs: LoadedPack[]): string[] {
  const problems: string[] = [];
  for (const pack of packs) {
    for (const statement of pack.statements) {
      const { object } = statement;
      if (object.kind !== "literal" || object.literal.datatype !== "image") continue;
      const file = basename(object.literal.value.src);
      const asset = new URL(`assets/${file}`, pack.dir);
      if (!file || !existsSync(asset)) {
        problems.push(
          `statement "${statement.id}" (${pack.id}) references image "${object.literal.value.src}", but ${pack.dirName}/assets/${file} is missing`,
        );
      }
    }
  }
  return problems;
}

const packs = await Promise.all(discoverPacks().map(loadPack));

try {
  const registry = validatePacks(packs);
  const assetProblems = checkImageAssets(packs);
  if (assetProblems.length > 0) throw new PackValidationError(assetProblems);
  const relations = [...registry].map(([id, r]) => `    ${id} (${r.packId})`).join("\n");
  console.log(`✓ ${packs.length} packs valid: ${packs.map((p) => p.id).join(", ")}`);
  console.log(`  ${registry.size} relations declared:\n${relations}`);
} catch (err) {
  if (!(err instanceof PackValidationError)) throw err;
  console.error(`✗ ${err.problems.length} problem(s) found:\n`);
  for (const problem of err.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
