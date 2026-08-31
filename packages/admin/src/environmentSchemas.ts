import type { Environment } from "@geo/contract";

/**
 * The three Environments in nav order, each paired with the Postgres schema it
 * binds to.
 *
 * One list, because two places show it — the left-nav selector and the
 * Environments comparison table — and they must agree. The pairing is the
 * whole reason CONTEXT.md records "Environment" and "schema" as separate
 * terms: `prod` binds to `public`, and that single divergence is what an
 * operator reading SQL alongside this tool needs spelled out. `test` and `dev`
 * name their own schema, listed here anyway so no caller has to special-case
 * which ones differ.
 */
export const ENVIRONMENT_SCHEMAS: readonly { readonly id: Environment; readonly schema: string }[] = [
  { id: "prod", schema: "public" },
  { id: "test", schema: "test" },
  { id: "dev", schema: "dev" },
];
