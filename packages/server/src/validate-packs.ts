/**
 * `pnpm packs:validate` — the validator's authoring/CI caller.
 *
 * One validator implementation, two callers: this, and the loader at boot. The
 * point of the second caller is that an author can find out a pack is broken
 * without starting the server, and CI can fail on it — but never that the two
 * disagree, which is why this file contains no checks of its own.
 */
import { discoverPacks, loadPack } from "./pack-loader.js";
import { PackValidationError, validatePacks } from "./pack-validator.js";

const packs = await Promise.all(discoverPacks().map(loadPack));

try {
  const registry = validatePacks(packs);
  const relations = [...registry].map(([id, r]) => `    ${id} (${r.packId})`).join("\n");
  console.log(`✓ ${packs.length} packs valid: ${packs.map((p) => p.id).join(", ")}`);
  console.log(`  ${registry.size} relations declared:\n${relations}`);
} catch (err) {
  if (!(err instanceof PackValidationError)) throw err;
  console.error(`✗ ${err.problems.length} problem(s) found:\n`);
  for (const problem of err.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
