import type {
  AdminEntityDetail,
  AdminGeneratorPreview,
  AdminGraphHealthReport,
  AdminHealth,
  AdminPackDetail,
  AdminPackList,
  AdminUserDetail,
  AdminUserList,
} from "@geo/contract";

/**
 * The single choke point every admin SPA→BFF call passes through, mirroring the
 * player app's `apiClient`. There is no auth token in this iteration (localhost,
 * single admin); the credential the reads need — the service-role key — lives in
 * the BFF alone and never here. No component should call `fetch()` directly.
 *
 * Every call hits the BFF under `/api`, which Vite proxies to the Node backend
 * (see `vite.config.ts`).
 */
async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw new Error(`admin request failed: ${res.status} ${path}`);
  return res;
}

/**
 * Like {@link adminFetch}, but a 404 resolves to `null` instead of throwing —
 * for lookups whose target may simply not exist (an unknown entity id, a
 * statement no longer in the graph) rather than a broken request.
 */
async function adminFetchOptional(path: string): Promise<Response | null> {
  const res = await fetch(`/api${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`admin request failed: ${res.status} ${path}`);
  return res;
}

/** The BFF's read-only liveness probe. Proves the SPA↔BFF seam end-to-end. */
export async function getHealth(): Promise<AdminHealth> {
  const res = await adminFetch("/health");
  return (await res.json()) as AdminHealth;
}

/** Every discovered pack, including catalog-hidden ones (#136). */
export async function getPacks(): Promise<AdminPackList> {
  const res = await adminFetch("/packs");
  return (await res.json()) as AdminPackList;
}

/** One pack's Entities and Statements, or `null` if the pack id is unknown (#136). */
export async function getPackDetail(packId: string): Promise<AdminPackDetail | null> {
  const res = await adminFetchOptional(`/packs/${encodeURIComponent(packId)}`);
  return res ? ((await res.json()) as AdminPackDetail) : null;
}

/** One entity's rich view and graph traversal, or `null` if unknown (#137). */
export async function getEntityDetail(entityId: string): Promise<AdminEntityDetail | null> {
  const res = await adminFetchOptional(`/entities/${encodeURIComponent(entityId)}`);
  return res ? ((await res.json()) as AdminEntityDetail) : null;
}

/** The Graph Health report: every check, its count, and its failing items (#138). */
export async function getGraphHealth(): Promise<AdminGraphHealthReport> {
  const res = await adminFetch("/health/graph");
  return (await res.json()) as AdminGraphHealthReport;
}

/** What a statement's generator would render, or `null` if unknown (#139). */
export async function getGeneratorPreview(statementId: string): Promise<AdminGeneratorPreview | null> {
  const res = await adminFetchOptional(`/generator-preview/${encodeURIComponent(statementId)}`);
  return res ? ((await res.json()) as AdminGeneratorPreview) : null;
}

/** Every user, from `auth.users` via the cross-user read seam (#140). */
export async function getUsers(): Promise<AdminUserList> {
  const res = await adminFetch("/users");
  return (await res.json()) as AdminUserList;
}

/** One user's detail: ability per pack, rollups, recent answers, ability trajectory (#141), or `null` if unknown. */
export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const res = await adminFetchOptional(`/users/${encodeURIComponent(userId)}`);
  return res ? ((await res.json()) as AdminUserDetail) : null;
}
