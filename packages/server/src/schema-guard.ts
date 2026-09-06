/**
 * Guards the Postgres schema a deploy talks to against the stage it claims to
 * be. This exists because a Cloudflare *secret* and a wrangler `[vars]` entry
 * share one `env` object, and a secret silently overrides a var of the same
 * name. A stray `DB_SCHEMA=dev` secret on the prod Worker once pointed
 * production at the `dev` schema — invisible in config, and it took prod down
 * whenever a merge into `dev` migrated that schema.
 *
 * The fix is a second, independent signal: `DEPLOY_ENV` is a committed var set
 * per environment in wrangler.toml. A secret can override `DB_SCHEMA`, but
 * `DEPLOY_ENV` still names the true stage, so a mismatch is detectable — and we
 * fail loudly (throw → 500s) rather than read/write the wrong schema.
 */

/** The only schema each stage is ever allowed to use. Committed, not secret. */
export const SCHEMA_BY_DEPLOY_ENV: Record<string, string> = {
  prod: "public",
  dev: "dev",
  test: "test",
};

/** Supabase's default schema when `DB_SCHEMA` is unset. */
const DEFAULT_SCHEMA = "public";

interface SchemaEnv {
  /** Committed stage identifier (`prod` | `dev` | `test`); the guard's anchor. */
  DEPLOY_ENV?: string;
  /** The schema this deploy would use — overridable by a stray secret. */
  DB_SCHEMA?: string;
}

/**
 * Returns the schema to use, throwing if a stray secret has pushed `DB_SCHEMA`
 * away from what `DEPLOY_ENV` mandates. When `DEPLOY_ENV` is absent (legacy or
 * preview deploys) the effective schema is returned unguarded.
 */
export function resolveSchema(env: SchemaEnv): string {
  const effective = env.DB_SCHEMA ?? DEFAULT_SCHEMA;
  const deployEnv = env.DEPLOY_ENV;
  if (!deployEnv) return effective;

  const expected = SCHEMA_BY_DEPLOY_ENV[deployEnv];
  if (!expected) {
    throw new Error(
      `schema guard: unknown DEPLOY_ENV "${deployEnv}" (expected one of ${Object.keys(SCHEMA_BY_DEPLOY_ENV).join(", ")})`,
    );
  }
  if (effective !== expected) {
    throw new Error(
      `schema guard: DEPLOY_ENV="${deployEnv}" mandates DB_SCHEMA="${expected}" but it resolved to "${effective}". ` +
        `A stray Cloudflare secret is likely overriding the committed var — delete the DB_SCHEMA secret on this Worker.`,
    );
  }
  return expected;
}
