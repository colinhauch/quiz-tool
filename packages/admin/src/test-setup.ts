import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * A benign default for `fetch`, so a component test that doesn't care about
 * network data (e.g. `App.test.tsx`, which only exercises nav chrome) doesn't
 * crash when a surface it mounts in passing (`Packs`, the default surface)
 * fetches on mount. A test that DOES care about the response — every surface's
 * own test file — overrides this with its own `vi.stubGlobal("fetch", ...)`.
 */
vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
);
