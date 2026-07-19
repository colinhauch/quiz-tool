/**
 * The pure domain: knowledge graph, question generation, answer matching.
 *
 * No IO ever lives here — no filesystem, no database, no HTTP. That purity is
 * what makes the engine unit-testable without a server or a database, and it
 * is enforced by keeping this package free of Node-native dependencies.
 *
 * Real domain logic arrives with the slices (see #12–#14).
 */

export const ENGINE_READY = true;
