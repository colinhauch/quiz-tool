import { serve } from "@hono/node-server";
import { loadAllPacks } from "@geo/server/pack-loader";
import { createAdminApp } from "./admin-app.js";

/**
 * The admin BFF's Node entrypoint — the credential boundary. Only this process
 * holds `SUPABASE_SERVICE_KEY` (read from a git-ignored `.env.local` by the
 * cross-user store, #140); it is never `VITE_`-prefixed and never reaches the
 * SPA bundle. The SPA talks only to this app's read endpoints over `/api`.
 *
 * Packs are discovered at boot exactly as the player server discovers them
 * (ADR-0001) — the same assembled graph, including catalog-hidden packs, that
 * the static surfaces project over.
 */
const port = Number(process.env.ADMIN_PORT ?? 3101);

const pack = await loadAllPacks();

serve({ fetch: createAdminApp({ pack }).fetch, port }, (info) => {
  console.log(`geo-admin BFF listening on http://localhost:${info.port} (read-only)`);
});
