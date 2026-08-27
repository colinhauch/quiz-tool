import { useState } from "react";
import { SURFACES, type SurfaceId } from "./surfaces.js";

/**
 * The admin shell: a persistent left nav across the five surfaces — Packs,
 * Users, Results, Graph Health, Generator Preview — and the active surface
 * beside it. The selected surface is component state, so moving between them
 * preserves place; each surface owns its own data fetching.
 *
 * An always-visible read-only badge states the app's stance in this iteration
 * (the BFF exposes reads only). It is chrome the shell owns, so every surface
 * carries it without each having to remember to.
 */
export function App() {
  const [active, setActive] = useState<SurfaceId>("packs");
  // SURFACES is non-empty (a compile-time constant), so this is a real fallback,
  // not a possible-undefined the shell has to reason about.
  const surface = SURFACES.find((s) => s.id === active) ?? SURFACES[0]!;
  const ActiveSurface = surface.component;

  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Admin surfaces">
        <div className="admin-brand">Geo Admin</div>
        <ul>
          {SURFACES.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                aria-current={s.id === active ? "page" : undefined}
                onClick={() => setActive(s.id)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="admin-readonly" role="status">
          Read-only
        </div>
      </nav>
      <main className="admin-main">
        <ActiveSurface />
      </main>
    </div>
  );
}
