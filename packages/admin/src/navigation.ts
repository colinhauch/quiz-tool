import { useSyncExternalStore } from "react";

/**
 * Where the Packs surface should jump to next it's shown. Graph Health's
 * drill-down ("each failing item drills to the Entity/Statement on the Packs
 * surface", #138) needs to land on a different surface than the one it's
 * rendered from; `surfaces.tsx`'s registry renders every surface as a bare
 * `ComponentType` with no props, so there is no prop-drilling path from
 * GraphHealth to Packs. This tiny module-level store is the seam instead: a
 * cross-surface jump writes here, `App` watches it to switch the active
 * surface, and `Packs` consumes it once mounted to pick its initial view.
 */
export type PacksFocus =
  | { kind: "pack"; packId: string }
  | { kind: "entity"; entityId: string }
  | { kind: "statement"; packId: string; statementId: string };

let focus: PacksFocus | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Requests that the Packs surface jump to `next`, and switches the shell to it. */
export function focusPacksOn(next: PacksFocus): void {
  focus = next;
  notify();
}

/** Reads and clears the pending focus request — consumed once, by whoever acts on it. */
export function consumePacksFocus(): PacksFocus | null {
  const current = focus;
  focus = null;
  notify();
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PacksFocus | null {
  return focus;
}

/** Re-renders whenever a cross-surface focus request is made or consumed. */
export function usePacksFocus(): PacksFocus | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
