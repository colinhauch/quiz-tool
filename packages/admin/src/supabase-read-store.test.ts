import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabaseReadStore } from "./supabase-read-store.js";

/**
 * Integration test for the service-role `AdminReadStore` (#140), driven
 * against a real Supabase project exactly as `supabase-storage.test.ts` and
 * `rls.test.ts` are: it needs real credentials and network, so it SKIPS
 * (never fails) unless the env is set, keeping `pnpm test` green with no
 * Docker running:
 *   SUPABASE_URL          e.g. https://<ref>.supabase.co (or the local stack)
 *   SUPABASE_SERVICE_KEY  secret key — this is what makes the read cross-user
 *
 * The point being proved is different from `rls.test.ts`: there, per-user
 * clients are isolated from each other by RLS; here, the *service-role*
 * client — the one credential this store is ever built from — sees across
 * every user's rows despite that same RLS, because the service role bypasses
 * it. That bypass is the whole reason `AdminReadStore` exists.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const ready = Boolean(url && serviceKey);

describe.skipIf(!ready)("createSupabaseReadStore (integration, service role)", () => {
  let admin: SupabaseClient;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    admin = createClient(url as string, serviceKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  });

  async function createUser(): Promise<string> {
    const email = `read-store-test-${crypto.randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  it("lists users created via the Admin API", async () => {
    const userId = await createUser();
    const store = createSupabaseReadStore(admin);

    const users = await store.listUsers();
    expect(users.map((u) => u.id)).toContain(userId);
  });

  it("reads answers across users the service-role client did not sign in as", async () => {
    const a = await createUser();
    const b = await createUser();
    const card = `cc:read-store-${crypto.randomUUID()}:object`;

    await admin.from("answers").insert([
      { user_id: a, card_id: card, input: "Japan", correct: true, asked_at: "2026-08-20T00:00:00.000Z" },
      { user_id: b, card_id: card, input: "Berlin", correct: false, asked_at: "2026-08-21T00:00:00.000Z" },
    ]);

    const store = createSupabaseReadStore(admin);
    const all = await store.listAllAnswers();
    const forThisCard = all.filter((row) => row.cardId === card);
    expect(forThisCard.map((row) => row.userId).sort()).toEqual([a, b].sort());

    const onlyA = await store.listAnswersForUser(a);
    expect(onlyA.filter((row) => row.cardId === card)).toEqual([
      { userId: a, cardId: card, input: "Japan", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
    ]);
  });

  it("reads pack_ability and card_difficulty across users", async () => {
    const a = await createUser();
    const packId = `read-store-pack-${crypto.randomUUID()}`;
    const cardId = `cc:read-store-${crypto.randomUUID()}:object`;

    await admin.from("pack_ability").insert({ user_id: a, pack_id: packId, ability: 1550 });
    await admin.from("card_difficulty").insert({ card_id: cardId, difficulty: 1470, answer_count: 2 });

    const store = createSupabaseReadStore(admin);

    const abilities = await store.listAllPackAbilities();
    expect(abilities).toContainEqual({ userId: a, packId, ability: 1550 });

    const difficulties = await store.listCardDifficulties();
    expect(difficulties).toContainEqual({ cardId, difficulty: 1470, answerCount: 2 });
  });

  /**
   * The one thing an in-memory fake can't prove (#172): that binding the
   * client to a non-default schema via supabase-js's `db.schema` actually
   * changes which rows `.from(...)` reads. `admin` (from `beforeAll`) is
   * unscoped — the project's default schema, `public`, i.e. what the BFF
   * calls the `prod` Environment. `testSchema` below is bound to `test`, one
   * of the other two schemas the admin's environment selector can choose
   * (CONTEXT.md's "Environment"/"schema" entries) — mirroring exactly what
   * `index.ts`'s `buildReadStores` does per-Environment at runtime.
   */
  it("reads from the schema its client is bound to, not the default (public/prod) schema", async () => {
    const testSchemaClient = createClient(url as string, serviceKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "test" },
    });

    const userId = await createUser();
    const packId = `read-store-schema-${crypto.randomUUID()}`;
    const { error } = await testSchemaClient.from("pack_ability").insert({ user_id: userId, pack_id: packId, ability: 1500 });
    if (error) throw new Error(`insert into test schema failed: ${error.message}`);

    const testStore = createSupabaseReadStore(testSchemaClient);
    const inTestSchema = await testStore.listAllPackAbilities();
    expect(inTestSchema).toContainEqual({ userId, packId, ability: 1500 });

    // The default-schema (public/prod) store must not see a row that only
    // exists in `test` — proving the binding actually scopes the read,
    // rather than `db.schema` being silently ignored.
    const prodStore = createSupabaseReadStore(admin);
    const inProdSchema = await prodStore.listAllPackAbilities();
    expect(inProdSchema.some((row) => row.packId === packId)).toBe(false);
  });
});
