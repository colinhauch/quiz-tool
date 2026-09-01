import { useEffect, useState } from "react";

/**
 * The desktop two-column card breakpoint (#187). Below this width the quiz
 * card stays the single-column layout — out of scope here — so this is the
 * one place deciding which of the two `Quiz` renders applies.
 */
const WIDE_QUERY = "(min-width: 900px)";

/** Guarded — jsdom has no `matchMedia` by default; then assume narrow. */
function readMatch(): boolean {
  try {
    return window.matchMedia(WIDE_QUERY).matches;
  } catch {
    return false;
  }
}

/** Whether the viewport currently matches the wide/desktop card layout. */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(readMatch);

  useEffect(() => {
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(WIDE_QUERY);
    } catch {
      return;
    }
    const onChange = () => setWide(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return wide;
}
