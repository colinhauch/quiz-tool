import type { AdminGeneratorPreview, AdminGeneratorPreviewCard } from "@geo/contract";
import { generateQuestion, supportedSlots, targetEntityId, type HiddenSlot, type Pack } from "@geo/engine";

/**
 * Previews one hidden slot of a statement: the rendered prompt, Question Kind,
 * and correct answer when the relation has a generator; a `reason` instead of
 * erroring when it doesn't (a Statement whose Relation has no Generator is
 * non-quizzable, not broken — #139).
 *
 * `distractors` is carried by the contract for a future multiple-choice kind
 * (ADR-0002) but is never populated here: the engine's only Question Kind
 * today is `text` (`RenderedContent.input`), so there is nothing to preview
 * yet — this renders whatever kind the generator produced rather than
 * re-implementing one.
 */
function previewCard(pack: Pack, statement: Pack["statements"][number], hiddenSlot: HiddenSlot): AdminGeneratorPreviewCard {
  if (!pack.generators[statement.relation]) {
    return { hiddenSlot, quizzable: false, reason: `relation "${statement.relation}" has no generator` };
  }
  try {
    const rendered = generateQuestion(pack, statement, hiddenSlot);
    const targetId = targetEntityId(statement, hiddenSlot);
    const correctAnswer = pack.entities.get(targetId)?.labels.en ?? targetId;
    return {
      hiddenSlot,
      quizzable: true,
      prompt: rendered.prompt,
      questionKind: rendered.input,
      correctAnswer,
    };
  } catch (error) {
    return { hiddenSlot, quizzable: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The Generator Preview surface's shaping (#139): every card a Statement can
 * yield — forward and reverse, where the relation supports both hidden slots —
 * previewed side by side, plus the provenance line the player would see.
 * `undefined` when the statement id doesn't resolve, so the route can 404
 * instead of the projection throwing.
 */
export function previewGenerator(pack: Pack, statementId: string): AdminGeneratorPreview | undefined {
  const statement = pack.statements.find((s) => s.id === statementId);
  if (!statement) return undefined;

  const source = pack.packs.get(statement.pack);
  const packLabel = source?.labels.en ?? statement.pack;

  const cards = supportedSlots(pack, statement.relation).map((hiddenSlot) => previewCard(pack, statement, hiddenSlot));

  return {
    statementId: statement.id,
    relation: statement.relation,
    packId: statement.pack,
    packLabel,
    provenance: packLabel,
    cards,
  };
}
