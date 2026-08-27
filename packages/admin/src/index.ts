import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { loadAllPacks } from "@geo/server/pack-loader";
import { createClient } from "@supabase/supabase-js";
import { createAdminApp } from "./admin-app.js";
import { createSupabaseReadStore } from "./supabase-read-store.js";

/**
 * The admin BFF's Node entrypoint — the credential boundary. Only this process
 * holds `SUPABASE_SERVICE_KEY` (read from a git-ignored `.env.local`, loaded
 * below); it is never `VITE_`-prefixed and never reaches the SPA bundle. The
 * SPA talks only to this app's read endpoints over `/api`.
 *
 * Packs are discovered at boot exactly as the player server discovers them
 * (ADR-0001) — the same assembled graph, including catalog-hidden packs, that
 * the static surfaces project over.
 */

/**
 * A minimal, dependency-free `.env.local` reader. Node's own `--env-file`
 * flag would do this, but that requires controlling how this process is
 * invoked (`tsx watch src/index.ts` in `dev:bff`); reading it here instead
 * works regardless of the launcher. Lines are `KEY=VALUE`, `#`-comments and
 * blank lines are skipped, and an already-set env var is never overwritten —
 * a real shell export still wins over the file.
 */
function loadEnvLocal(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal(resolve(process.cwd(), ".env.local"));

const port = Number(process.env.ADMIN_PORT ?? 3101);

const pack = await loadAllPacks();

// The cross-user read seam (#140): only this entrypoint ever builds a
// service-role client. `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are the same env
// vars `@geo/server`'s production stores read; unset in local dev without
// Supabase, in which case `readStore` is omitted and the cross-user routes
// 500 with a clear message rather than the app failing to boot.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const readStore =
  supabaseUrl && supabaseServiceKey
    ? createSupabaseReadStore(
        createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
      )
    : undefined;

if (!readStore) {
  console.warn(
    "geo-admin BFF: SUPABASE_URL/SUPABASE_SERVICE_KEY not set — Users/Results/Population routes will 500 until configured in .env.local",
  );
}

serve({ fetch: createAdminApp({ pack, readStore }).fetch, port }, (info) => {
  console.log(`geo-admin BFF listening on http://localhost:${info.port} (read-only)`);
});
