import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AnswerRecord } from "./storage.js";
import {
  createSupabaseAnswerStore,
  createSupabaseRatingStore,
  createSupabaseSelectionStore,
} from "./supabase-storage.js";

/**
 * Integration tests for the production stores, driven through supabase-js
 * against a real Supabase project. They prove the thing unit tests can't: that
 * Postgres RLS actually isolates one user's answers and pack selection from
 * another's when the store forwards each user's JWT.
 *
 * They need real credentials and network, so they SKIP unless the env is set —
 * keeping `pnpm test` green for anyone without them (see docs/deploy/hitl-checklist.md):
 *   SUPABASE_URL              e.g. https://<ref>.supabase.co
 *   SUPABASE_SERVICE_KEY      secret key — used only to create/sign-in throwaway users
 *   SUPABASE_PUBLISHABLE_KEY  low-privilege key the user clients use (falls back to anon)
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const ready = Boolean(url && serviceKey && publishableKey);

const answer: AnswerRecord = {
  cardId: "cc:tokyo-japan:object",
  input: "Japan",
  correct: true,
  askedAt: "2026-07-19T12:00:00.000Z",
};

/** Creates a throwaway confirmed user and returns a client already signed in as them. */
async function signedInUser(admin: SupabaseClient): Promise<{ client: SupabaseClient; id: string }> {
  const email = `store-test-${crypto.randomUUID()}@example.com`;
  const password = crypto.randomUUID();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message}`);

  const client = createClient(url as string, publishableKey as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn failed: ${signInErr.message}`);
  return { client, id: created.user.id };
}

describe.skipIf(!ready)("Supabase stores (integration, RLS)", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    admin = createClient(url as string, serviceKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    // Deleting the user cascades to their rows (FK on delete cascade).
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  });

  it("records and reads back one user's answers, and never another's", async () => {
    const a = await signedInUser(admin);
    const b = await signedInUser(admin);
    createdUserIds.push(a.id, b.id);

    const storeA = createSupabaseAnswerStore(a.client);
    const storeB = createSupabaseAnswerStore(b.client);

    expect(await storeA.all()).toEqual([]);
    await storeA.record(answer);
    await storeB.record({ ...answer, input: "Berlin", correct: false });

    // Each store sees only its own user's row — isolation is enforced in Postgres.
    expect(await storeA.all()).toEqual([answer]);
    expect(await storeB.all()).toEqual([{ ...answer, input: "Berlin", correct: false }]);
  });

  it("reads null on first run, then round-trips a selection, isolated per user", async () => {
    const a = await signedInUser(admin);
    const b = await signedInUser(admin);
    createdUserIds.push(a.id, b.id);

    const selA = createSupabaseSelectionStore(a.client);
    const selB = createSupabaseSelectionStore(b.client);

    // Never saved => null (distinct from the empty set), for both users.
    expect(await selA.read()).toBeNull();

    await selA.write(["capital-cities", "core-geo"]);
    expect(await selA.read()).toEqual(["capital-cities", "core-geo"]);

    // A whole-set replace fully replaces rather than merging.
    await selA.write(["capital-cities"]);
    expect(await selA.read()).toEqual(["capital-cities"]);

    // B's selection is untouched by A's writes.
    expect(await selB.read()).toBeNull();
  });

  it("round-trips a snapshot on the answer row", async () => {
    const a = await signedInUser(admin);
    createdUserIds.push(a.id);
    const store = createSupabaseAnswerStore(a.client);

    const withSnapshot = {
      ...answer,
      snapshot: { difficulty: 1500, ability: 1520, kApplied: 40, packId: "capital-cities" },
    };
    await store.record(withSnapshot);
    expect(await store.all()).toEqual([withSnapshot]);
  });

  it("keeps ability per-user but difficulty global (shared across users)", async () => {
    const a = await signedInUser(admin);
    const b = await signedInUser(admin);
    createdUserIds.push(a.id, b.id);
    const ratingA = createSupabaseRatingStore(a.client);
    const ratingB = createSupabaseRatingStore(b.client);
    const card = `cc:tokyo-japan:object-${crypto.randomUUID()}`;

    // Ability is isolated: A's write is invisible to B.
    await ratingA.writeAbility("capital-cities", 1600);
    expect(await ratingA.readAbility("capital-cities")).toBeCloseTo(1600, 6);
    expect(await ratingB.readAbility("capital-cities")).toBe(1500); // seed — B has none

    // Difficulty is global: A writes it, B reads the same value.
    await ratingA.writeCard(card, 1480, 3);
    expect(await ratingB.readCard(card)).toEqual({ difficulty: 1480, answerCount: 3 });
  });
});
