import { z } from "zod";

/**
 * The typed HTTP seam for the admin visualizer (`@geo/admin`), kept apart from
 * the player-facing schemas in `index.ts` so the two surfaces cannot silently
 * borrow each other's shapes. Like the rest of this package it is dependency-free
 * apart from zod: both the admin SPA and the admin BFF import these, so the admin
 * HTTP seam has one source of truth and cannot drift.
 *
 * Route schemas arrive with the slices that add the routes (#136–#144). This
 * file starts with the one route the skeleton (#135) needs to prove the seam
 * end-to-end.
 */

/**
 * `GET /health` — the admin BFF's liveness probe. It carries `readOnly: true`
 * as a machine-checkable statement of the whole app's stance in this iteration:
 * the BFF exposes reads only, and the SPA renders a read-only affordance. The
 * flag lives at the seam rather than only in UI copy so a future write route
 * cannot be added without this contract (and its test) forcing the question.
 */
export const adminHealthSchema = z
  .object({
    status: z.literal("ok"),
    readOnly: z.literal(true),
  })
  .strict();

export type AdminHealth = z.infer<typeof adminHealthSchema>;

/**
 * Shared building blocks for the Packs / Entity / Graph Health / Generator
 * Preview surfaces (#136–#139). These read the assembled `Pack` graph only —
 * no database, no `AdminReadStore` — so every shape here is a projection over
 * `@geo/engine` types, never a widening of them.
 */

const adminCreditSchema = z.object({ source: z.string(), retrieved: z.string() }).strict();

/**
 * `GET /admin/packs` — every discovered pack (ADR-0001), including
 * catalog-hidden ones (ADR-0003: visibility is a player/catalog policy the
 * admin ignores). Unlike the player-facing `packSummarySchema` in `index.ts`,
 * this has no `included` flag and does not filter out entity-only packs like
 * `core-geo` — the operator needs to see everything that was loaded.
 */
export const adminPackSummarySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    version: z.string().min(1),
    license: z.string().optional(),
    credits: z.array(adminCreditSchema).optional(),
    statementCount: z.number().int().nonnegative(),
    cardCount: z.number().int().nonnegative(),
  })
  .strict();

export type AdminPackSummary = z.infer<typeof adminPackSummarySchema>;

export const adminPackListSchema = z.array(adminPackSummarySchema);

export type AdminPackList = z.infer<typeof adminPackListSchema>;

/** An entity as a link target: enough to render and to navigate to it. */
export const adminEntityRefSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

export type AdminEntityRef = z.infer<typeof adminEntityRefSchema>;

/** A statement's object slot, resolved for display: a linked entity or a literal's display text. */
export const adminObjectSlotSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entity"), entity: adminEntityRefSchema }).strict(),
  z.object({ kind: z.literal("literal"), literal: z.string() }).strict(),
]);

export type AdminObjectSlot = z.infer<typeof adminObjectSlotSchema>;

/** One statement, with its subject/object resolved to navigable entity refs. */
export const adminStatementSchema = z
  .object({
    id: z.string().min(1),
    relation: z.string().min(1),
    subject: adminEntityRefSchema,
    object: adminObjectSlotSchema,
    /** The pack that authored this statement (`Statement.pack`). */
    packId: z.string().min(1),
  })
  .strict();

export type AdminStatement = z.infer<typeof adminStatementSchema>;

export const adminEntitySummarySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    types: z.array(z.string()),
  })
  .strict();

export type AdminEntitySummary = z.infer<typeof adminEntitySummarySchema>;

/**
 * One relation's statements within a pack detail, tagged with whether this
 * pack defines the relation or merely asserts statements against it (CONTEXT.md
 * "Relation": exactly one pack defines it; other packs may still use it).
 * `definedBy` names the defining pack when it differs from the pack being viewed.
 */
export const adminRelationGroupSchema = z
  .object({
    relation: z.string().min(1),
    definedHere: z.boolean(),
    definedBy: z.string().min(1).optional(),
    statements: z.array(adminStatementSchema),
  })
  .strict();

export type AdminRelationGroup = z.infer<typeof adminRelationGroupSchema>;

/** `GET /admin/packs/:packId` — a pack's Entities and Statements (#136). */
export const adminPackDetailSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    version: z.string().min(1),
    license: z.string().optional(),
    credits: z.array(adminCreditSchema).optional(),
    entities: z.array(adminEntitySummarySchema),
    relations: z.array(adminRelationGroupSchema),
  })
  .strict();

export type AdminPackDetail = z.infer<typeof adminPackDetailSchema>;

/** A statement from the viewpoint of one entity: which role it plays in it. */
export const adminEntityStatementSchema = z
  .object({
    id: z.string().min(1),
    relation: z.string().min(1),
    role: z.enum(["subject", "object"]),
    subject: adminEntityRefSchema,
    object: adminObjectSlotSchema,
    packId: z.string().min(1),
  })
  .strict();

export type AdminEntityStatement = z.infer<typeof adminEntityStatementSchema>;

/**
 * `GET /admin/entities/:entityId` — the rich Entity view (#137): labels,
 * aliases, types, its Owner pack, coordinate/visual-aid when present, and
 * every statement it is subject or object of. `ownerPackId`/`ownerPackLabel`
 * and `coordinate` are absent when unknown or unset — the entity still renders,
 * just without that section.
 */
export const adminEntityDetailSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    aliases: z.array(z.string()),
    types: z.array(z.string()),
    ownerPackId: z.string().min(1).optional(),
    ownerPackLabel: z.string().min(1).optional(),
    coordinate: z.object({ lat: z.number(), lon: z.number() }).strict().optional(),
    statements: z.array(adminEntityStatementSchema),
  })
  .strict();

export type AdminEntityDetail = z.infer<typeof adminEntityDetailSchema>;

/**
 * One Graph Health finding, drilling down to the offending Entity or Statement
 * so the operator can jump straight to it on the Packs surface (#138).
 */
export const adminHealthIssueSchema = z
  .object({
    targetType: z.enum(["entity", "statement"]),
    targetId: z.string().min(1),
    packId: z.string().min(1).optional(),
    detail: z.string().min(1),
  })
  .strict();

export type AdminHealthIssue = z.infer<typeof adminHealthIssueSchema>;

/** One check's result: a summary count plus every failing item. */
export const adminHealthCheckSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    count: z.number().int().nonnegative(),
    items: z.array(adminHealthIssueSchema),
  })
  .strict();

export type AdminHealthCheck = z.infer<typeof adminHealthCheckSchema>;

/** `GET /admin/health/graph` — every Graph Health check, run over the assembled graph. */
export const adminGraphHealthReportSchema = z
  .object({
    checks: z.array(adminHealthCheckSchema),
  })
  .strict();

export type AdminGraphHealthReport = z.infer<typeof adminGraphHealthReportSchema>;

/**
 * One card the Generator Preview would render — a statement paired with a
 * hidden slot (mirrors `@geo/engine`'s `Card`). `quizzable` is false when the
 * statement's relation has no generator; the preview then shows `reason`
 * instead of a rendered prompt, degrading gracefully rather than erroring.
 *
 * The engine has one Question Kind today (`text`, `RenderedContent.input`);
 * `distractors`/`correctOption` are carried for a future multiple-choice kind
 * (ADR-0002) without the engine's surface needing to grow to support this
 * preview — they are simply absent until a generator ever produces them.
 */
export const adminGeneratorPreviewCardSchema = z
  .object({
    hiddenSlot: z.string().min(1),
    quizzable: z.boolean(),
    prompt: z.string().min(1).optional(),
    questionKind: z.string().min(1).optional(),
    correctAnswer: z.string().min(1).optional(),
    distractors: z.array(z.string().min(1)).optional(),
    reason: z.string().min(1).optional(),
  })
  .strict();

export type AdminGeneratorPreviewCard = z.infer<typeof adminGeneratorPreviewCardSchema>;

/**
 * `GET /admin/generator-preview` — what a Statement's Generator emits, for the
 * operator-picked pack + statement (#139). `cards` carries one entry per
 * supported hidden slot, so forward and reverse cards preview side by side
 * when a relation supports both.
 */
export const adminGeneratorPreviewSchema = z
  .object({
    statementId: z.string().min(1),
    relation: z.string().min(1),
    packId: z.string().min(1),
    packLabel: z.string().min(1),
    /** The source line the player would see for a question from this statement. */
    provenance: z.string().min(1),
    cards: z.array(adminGeneratorPreviewCardSchema),
  })
  .strict();

export type AdminGeneratorPreview = z.infer<typeof adminGeneratorPreviewSchema>;
