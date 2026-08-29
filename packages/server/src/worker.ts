/**
 * Cloudflare Worker entry for the quiz-tool server.
 *
 * This is the production entry: it assembles the bundled pack graph
 * (`src/packs.generated.ts`, built by `pnpm bundle-packs`) and serves the same
 * Hono app the Node server does (`createApp`), but with zero filesystem and no
 * dynamic import — the two things a Worker can't do (see the Node entry
 * `src/index.ts` for the local/dev counterpart, and docs/deploy/hitl-checklist.md §4).
 *
 * Persistence is Supabase, per learner: the auth middleware verifies each
 * request's JWT (ES256 against the project JWKS) and hands each caller a
 * user-scoped client; RLS does the isolation. There is no SQLite here.
 */
import { createApp } from "./app.js";
import { supabaseJwks } from "./auth.js";
import { assembleLoaded } from "./pack-loader.js";
import { loadedPacks } from "./packs.generated.js";
import {
  createSupabaseAnswerStore,
  createSupabaseFeedbackStore,
  createSupabaseSelectionStore,
} from "./supabase-storage.js";

interface Env {
  /** Supabase project URL, e.g. https://<ref>.supabase.co (wrangler var). */
  SUPABASE_URL: string;
  /** Low-privilege publishable key; the forwarded user JWT is what RLS keys on. */
  SUPABASE_PUBLISHABLE_KEY: string;
}

// The pack graph is static per deploy, so assemble it once per isolate rather
// than per request. The app is likewise built once and memoised on the env it
// was built from — env is stable within an isolate.
let app: ReturnType<typeof createApp> | undefined;
let builtFor: Env | undefined;

function getApp(env: Env) {
  if (!app || builtFor !== env) {
    const pack = assembleLoaded(loadedPacks);
    app = createApp({
      pack,
      auth: {
        jwks: supabaseJwks(env.SUPABASE_URL),
        supabaseUrl: env.SUPABASE_URL,
        supabaseKey: env.SUPABASE_PUBLISHABLE_KEY,
        issuer: `${env.SUPABASE_URL}/auth/v1`,
        audience: "authenticated",
      },
      storesForUser: (client) => ({
        store: createSupabaseAnswerStore(client),
        selection: createSupabaseSelectionStore(client),
        feedback: createSupabaseFeedbackStore(client),
      }),
    });
    builtFor = env;
  }
  return app;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    return getApp(env).fetch(request);
  },
};
