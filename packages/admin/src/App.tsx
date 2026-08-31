import { useEffect, useState } from "react";
import { SURFACES, type SurfaceId } from "./surfaces.js";
import { usePacksFocus } from "./navigation.js";
import { readEnvironmentPref } from "./environmentPref.js";
import { EnvironmentSelector } from "./EnvironmentSelector.js";

/**
 * The admin shell: a persistent left nav across the five surfaces — Packs,
 * Users, Results, Graph Health, Generator Preview — and the active surface
 * beside it. The selected surface is component state, so moving between them
 * preserves place; each surface owns its own data fetching.
 *
 * An always-visible read-only badge states the app's stance in this iteration
 * (the BFF exposes reads only). It is chrome the shell owns, so every surface
 * carries it without each having to remember to.
 *
 * The {@link EnvironmentSelector} (#172) sits directly beneath the brand and
 * above the surface list, per spec #171 — always visible, on every surface,
 * because "which environment am I looking at" is a question the operator
 * should never have to go hunting for. It is entirely self-contained: it
 * reads/writes its own persisted choice and reloads the page on switch,
 * so nothing here threads an environment prop to `ActiveSurface`.
 */
export function App() {
  const [active, setActive] = useState<SurfaceId>("packs");

  // A cross-surface drill-down (Graph Health → Packs, #138) writes a pending
  // focus request rather than calling into this shell directly (the surface
  // registry renders every surface as a bare `ComponentType`, with no props to
  // drill through — see `navigation.ts`). This is the one place that watches
  // for it and switches surfaces; `Packs` itself consumes the request once
  // mounted, to pick where within itself to land.
  const pendingFocus = usePacksFocus();
  useEffect(() => {
    if (pendingFocus) setActive("packs");
  }, [pendingFocus]);

  // SURFACES is non-empty (a compile-time constant), so this is a real fallback,
  // not a possible-undefined the shell has to reason about.
  const surface = SURFACES.find((s) => s.id === active) ?? SURFACES[0]!;
  const ActiveSurface = surface.component;

  // The shell states which Environment it is showing, and the stylesheet keys
  // a subtle accent off it (warm prod / neutral test / cool dev) so a
  // screenshot is self-documenting. A tint, not a banner: the admin is
  // read-only, so looking at the wrong Environment is a misreading, not a
  // mistake you cannot undo. Read once, like `apiClient` does — switching
  // reloads the page (#172), so it cannot go stale under us.
  const environment = readEnvironmentPref();

  return (
    <div className="admin-shell" data-environment={environment}>
      <nav className="admin-nav" aria-label="Admin surfaces">
        <div className="admin-brand">Geo Admin</div>
        <EnvironmentSelector />
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
