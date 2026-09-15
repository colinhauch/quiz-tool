/**
 * CI deploy dispatcher. Cloudflare Workers Builds invokes this on a build; it
 * resolves the branch (WORKERS_CI_BRANCH) to a single deploy target via the pure
 * `resolveDeploy` seam and runs `wrangler` for it — or logs a clear refusal and
 * exits 0 without touching any Worker.
 *
 * With one Workers Builds connection per Worker (spec #246), each connection
 * only ever fires on its own branch, so this dispatch is belt-and-suspenders:
 * the branch→env mapping stays version-controlled and auditable here, and an
 * unrecognized branch fails CLOSED (never a fallback to a prod-touching deploy).
 */
import { spawnSync } from "node:child_process";

import { resolveDeploy } from "../src/deploy-resolver.js";

const rawBranch = process.env.WORKERS_CI_BRANCH;
const action = resolveDeploy(rawBranch);

if (action.kind === "refuse") {
  // Observable, greppable refusal line (US18). No deploy, no versions upload.
  console.log(`[deploy:ci] REFUSING to deploy: ${action.reason}`);
  process.exit(0);
}

console.log(
  `[deploy:ci] branch "${rawBranch}" → ${action.env}: deploying ${action.worker} (${action.domain}) via \`wrangler ${action.argv.join(" ")}\``,
);

const result = spawnSync("wrangler", action.argv, { stdio: "inherit" });

if (result.error) {
  console.error(`[deploy:ci] failed to launch wrangler: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
