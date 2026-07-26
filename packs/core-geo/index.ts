/**
 * `core-geo` is an entities-only tranche: it ships no statements and no
 * question generators (it owns identity, not facts — see the pack's README
 * and `specs/knowledge-graph/identity.md`). The only thing this module exports
 * is where the data lives, so a loader can read `entities.jsonl` off disk.
 * Resolves against the source location under tsx/vitest, matching how the app
 * runs today.
 */
export const packDir = new URL(".", import.meta.url);
