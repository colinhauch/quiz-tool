import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { loadCatalog } from "./catalog.js";

/** A temp directory standing in for `packs/`, so a catalog fixture can be written and read back. */
let dir: string;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function catalogDir(contents?: string): URL {
  dir = mkdtempSync(join(tmpdir(), "geo-catalog-"));
  if (contents !== undefined) writeFileSync(join(dir, "catalog.json"), contents);
  // Trailing slash so `new URL("catalog.json", dir)` resolves inside it.
  return pathToFileURL(join(dir, "/"));
}

describe("loadCatalog", () => {
  // The common case: no catalog.json at all. A pack is visible and free unless
  // the catalog says otherwise, so an absent file is an empty policy set, never
  // an error.
  it("returns an empty catalog when the file is absent", () => {
    const catalog = loadCatalog(catalogDir());
    expect(catalog.size).toBe(0);
  });

  it("reads a pack's hidden flag", () => {
    const catalog = loadCatalog(catalogDir(`{ "core-cities": { "hidden": true } }`));
    expect(catalog.get("core-cities")?.hidden).toBe(true);
  });

  // `tier` is reserved for later user-gating; the catalog carries it now so
  // authors can annotate ahead of enforcement.
  it("reads a pack's reserved tier", () => {
    const catalog = loadCatalog(catalogDir(`{ "capital-cities": { "tier": "premium" } }`));
    expect(catalog.get("capital-cities")?.tier).toBe("premium");
  });

  it("rejects an unknown policy field", () => {
    expect(() => loadCatalog(catalogDir(`{ "p": { "visble": true } }`))).toThrow();
  });

  it("rejects an unknown tier value", () => {
    expect(() => loadCatalog(catalogDir(`{ "p": { "tier": "gold" } }`))).toThrow();
  });
});
