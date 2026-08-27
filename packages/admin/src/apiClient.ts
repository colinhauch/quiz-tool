import type { AdminHealth } from "@geo/contract";

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

/** The BFF's read-only liveness probe. Proves the SPA↔BFF seam end-to-end. */
export async function getHealth(): Promise<AdminHealth> {
  const res = await adminFetch("/health");
  return (await res.json()) as AdminHealth;
}
