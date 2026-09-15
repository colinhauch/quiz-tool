/**
 * Resolves which Cloudflare Worker (if any) a CI build is allowed to deploy,
 * from the branch it fired on. This is the single seam that keeps a deploy from
 * ever touching a Worker that isn't its own.
 *
 * Why this exists: a Cloudflare `custom_domain` is globally unique per zone — it
 * attaches to exactly one Worker, and `wrangler deploy` *moves* it to whatever
 * Worker names it, silently detaching the old one. A `dev`/`test` build that
 * resolved to the prod Worker would therefore steal `quiz.colinhauch.com`. The
 * structural fix (spec #246) is one Workers Builds connection per Worker, each
 * watching exactly one branch; this resolver is the version-controlled,
 * fail-closed backstop that maps branch → deploy target and REFUSES anything
 * unrecognized rather than falling through to a prod-touching action.
 *
 * The resolver only *describes* the action (env / argv / target) — it never
 * runs wrangler — so the branch→env mapping is unit-testable in isolation.
 */

/** A long-lived deploy stage and everything a build needs to target its Worker. */
export interface DeployTarget {
  kind: "deploy";
  /** The stage this branch deploys. */
  env: "prod" | "dev" | "test";
  /** `wrangler` arguments — `--env` is omitted for prod (top-level config). */
  argv: string[];
  /** The Worker this deploys, for logging/auditing. */
  worker: string;
  /** The custom domain this Worker owns, for logging/auditing. */
  domain: string;
}

/** The fail-closed outcome: deploy nothing, say why. */
export interface DeployRefusal {
  kind: "refuse";
  /** Human-readable reason, surfaced in the build log. */
  reason: string;
}

export type DeployAction = DeployTarget | DeployRefusal;

/** The only branches that may deploy, each pinned to its own Worker + domain. */
const TARGET_BY_BRANCH: Record<string, DeployTarget> = {
  prod: { kind: "deploy", env: "prod", argv: ["deploy"], worker: "quiz-tool", domain: "quiz.colinhauch.com" },
  dev: {
    kind: "deploy",
    env: "dev",
    argv: ["deploy", "--env", "dev"],
    worker: "quiz-tool-dev",
    domain: "quiz-dev.colinhauch.com",
  },
  test: {
    kind: "deploy",
    env: "test",
    argv: ["deploy", "--env", "test"],
    worker: "quiz-tool-test",
    domain: "quiz-test.colinhauch.com",
  },
};

/**
 * Maps a raw CI branch string to a deploy action. Strips a leading
 * `refs/heads/` so a ref-prefixed branch still resolves; anything that isn't
 * exactly `prod`/`dev`/`test` (after stripping) REFUSES — it never falls
 * through to a prod-touching deploy. Case-sensitive on purpose: the branches
 * are lowercase and a casing mismatch is exactly the kind of slip we refuse.
 */
export function resolveDeploy(rawBranch: string | undefined): DeployAction {
  if (!rawBranch) {
    return { kind: "refuse", reason: "no branch given (WORKERS_CI_BRANCH empty or unset)" };
  }
  const branch = rawBranch.startsWith("refs/heads/") ? rawBranch.slice("refs/heads/".length) : rawBranch;
  const target = TARGET_BY_BRANCH[branch];
  if (!target) {
    return {
      kind: "refuse",
      reason: `branch "${branch}" is not a deploy branch (expected one of ${Object.keys(TARGET_BY_BRANCH).join(", ")}); deploying nothing`,
    };
  }
  return target;
}
