import { useState, type ChangeEvent } from "react";
import type { Environment } from "@geo/contract";
import { readEnvironmentPref, writeEnvironmentPref } from "./environmentPref.js";

/** The three environments, in nav order, paired with the schema each binds to (`environmentPref.ts`/`admin-app.ts` — the `prod` → `public` divergence is why the two are separate words at all; see CONTEXT.md). */
const ENVIRONMENTS: { readonly id: Environment; readonly schema: string }[] = [
  { id: "prod", schema: "public" },
  { id: "test", schema: "test" },
  { id: "dev", schema: "dev" },
];

/** `window.location.reload()`, the real seam's default — overridden in tests. */
function defaultReload(): void {
  window.location.reload();
}

/**
 * The environment selector (#172): a `<select>` in the left nav, directly
 * beneath the brand and above the surface list (see `App.tsx`), always
 * visible and always enabled. Each option is labelled `<environment>
 * (<schema>)` — the dropdown is the one place in the whole app where an
 * operator sees both names side by side, so it doubles as the prod/public documentation (spec #171).
 *
 * Switching writes the new choice to `localStorage` (`environmentPref.ts`)
 * and reloads the page — a deliberate first step, not the final design: a
 * React context plus environment-keyed effects in each surface replaces the
 * reload later, making switching instant without this component or its
 * callers changing. `onReload` exists so that replacement (and this
 * component's own tests) never has to touch `window.location` directly —
 * pass a stub to observe "switching requested a reload" as a plain function
 * call.
 */
export function EnvironmentSelector({ onReload = defaultReload }: { onReload?: () => void } = {}) {
  const [selected, setSelected] = useState<Environment>(() => readEnvironmentPref());

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const env = event.target.value as Environment;
    setSelected(env);
    writeEnvironmentPref(env);
    onReload();
  }

  // Plain text, not markup: `<option>` is text-only content in HTML, so a
  // nested `<span>` is invalid and every browser flattens it away — there is
  // no way to dim half an option's label in a native `<select>`. The dimming
  // spec #171 asks for needs a custom listbox (see #173); until then the
  // label carries both names, which is the part that actually matters.
  return (
    <select className="admin-env-select" aria-label="Environment" value={selected} onChange={handleChange}>
      {ENVIRONMENTS.map((env) => (
        <option key={env.id} value={env.id}>
          {env.id} ({env.schema})
        </option>
      ))}
    </select>
  );
}
