import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * RLS tests against a real Postgres, driven directly through supabase-js —
 * not through the store abstraction (`supabase-storage.ts`), which never lets
 * a caller set `user_id` at all. These prove the isolation holds even against
 * a client that tries to forge ownership directly, which is what the store's
 * own safety actually rests on (#65).
 *
 * Target: the local stack (`supabase start`) by default, using the standard
 * local-dev demo keys (fixed by the Supabase CLI, safe to commit — they only
 * work against 127.0.0.1). Point at a different project by setting
 * SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY. Skips (does not
 * fail) if nothing is reachable at the target URL, so `pnpm test` stays green
 * without Docker.
 */
const LOCAL_URL = "http://127.0.0.1:55321";
// Standard Supabase CLI local-dev demo keys — signed with the well-known local
// demo JWT secret, valid only against a local `supabase start` instance.
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const url = process.env.SUPABASE_URL ?? LOCAL_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? LOCAL_SERVICE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? LOCAL_ANON_KEY;

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

const ready = await reachable();
if (!ready) {
  // eslint-disable-next-line no-console
  console.warn(`rls.test.ts: no Supabase reachable at ${url} — skipping (run \`supabase start\`).`);
}

/** Creates a throwaway confirmed user and returns a client signed in as them. */
async function signedInUser(admin: SupabaseClient): Promise<{ client: SupabaseClient; id: string }> {
  const email = `rls-test-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message}`);

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);
  return { client, id: created.user.id };
}

describe.skipIf(!ready)("RLS: answers, pack_selection, pack_selection_state", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  });

  it("user A cannot read user B's answers", async () => {
    const a = await signedInUser(admin);
    const b = await signedInUser(admin);
    createdUserIds.push(a.id, b.id);

    await admin.from("answers").insert({
      user_id: b.id,
      card_id: "cc:tokyo-japan:object",
      input: "Japan",
      correct: true,
      asked_at: "2026-07-19T12:00:00.000Z",
    });

    const { data, error } = await a.client.from("answers").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("user A cannot insert an answer row owned by user B (forged user_id)", async () => {
    const a = await signedInUser(admin);
    const b = await signedInUser(admin);
    createdUserIds.push(a.id, b.id);

    const { error } = await a.client.from("answers").insert({
      user_id: b.id,
      card_id: "cc:tokyo-japan:object",
      input: "Japan",
      correct: true,
      asked_at: "2026-07-19T12:00:00.000Z",
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501"); // row-level security policy violation

    const { data: bRows } = await admin.from("answers").select("*").eq("user_id", b.id);
    expect(bRows).toEqual([]);
  });

  it("user A cannot read or write user B's pack_selection", async () => {
    const a = await signedInUser(admin);
    const b = await signedInUser(admin);
    createdUserIds.push(a.id, b.id);

    await admin.from("pack_selection").insert({ user_id: b.id, pack_id: "capital-cities" });

    const { data: seen } = await a.client.from("pack_selection").select("*");
    expect(seen).toEqual([]);

    const { error: insertErr } = await a.client
      .from("pack_selection")
      .insert({ user_id: b.id, pack_id: "core-geo" });
    expect(insertErr?.code).toBe("42501");

    const { error: deleteErr } = await a.client.from("pack_selection").delete().eq("user_id", b.id);
    // No error (delete affecting 0 rows is not an RLS violation), but nothing is removed.
    expect(deleteErr).toBeNull();
    const { data: stillThere } = await admin.from("pack_selection").select("*").eq("user_id", b.id);
    expect(stillThere).toEqual([{ user_id: b.id, pack_id: "capital-cities" }]);
  });

  it("user A cannot reassign their pack_selection_state row to user B (forged update)", async () => {
    const a = await signedInUser(admin);
    const b = await signedInUser(admin);
    createdUserIds.push(a.id, b.id);

    const { error: insertErr } = await a.client
      .from("pack_selection_state")
      .insert({ saved_at: new Date().toISOString() });
    expect(insertErr).toBeNull();

    const { error: updateErr } = await a.client
      .from("pack_selection_state")
      .update({ user_id: b.id })
      .eq("user_id", a.id);
    expect(updateErr).not.toBeNull();
    expect(updateErr?.code).toBe("42501");

    const { data: row } = await admin.from("pack_selection_state").select("user_id").eq("user_id", a.id);
    expect(row).toEqual([{ user_id: a.id }]);
  });

  it("an anonymous (unauthenticated) client sees no rows and cannot write", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data, error } = await anon.from("answers").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { error: insertErr } = await anon.from("answers").insert({
      card_id: "cc:tokyo-japan:object",
      input: "Japan",
      correct: true,
      asked_at: "2026-07-19T12:00:00.000Z",
    });
    expect(insertErr).not.toBeNull();
  });
});
