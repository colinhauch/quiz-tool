import { makeCardId, targetEntityId } from "./card.js";
import { createGraph } from "./graph.js";
import type { HiddenSlot, Pack, RenderedQuestion, Statement, VisualAid } from "./types.js";

/**
 * The image an `image`-literal object contributes to the prompt, when that
 * object is on the *visible* side of the card. A flag card hides the subject and
 * shows the flag object; an object-hidden card would be concealing the image
 * itself (nothing to show, and unanswerable anyway), so it gets none. Mirrors
 * `revealVisualFor` in `answer.ts`: the engine derives the visual from stored
 * data so generators stay text-only.
 */
function promptVisualFor(statement: Statement, hiddenSlot: HiddenSlot): VisualAid | undefined {
  if (hiddenSlot === "object") return undefined;
  const { object } = statement;
  if (object.kind !== "literal" || object.literal.datatype !== "image") return undefined;
  return { kind: "image", src: object.literal.value.src, alt: object.literal.value.alt };
}

/**
 * Runs the pack's generator for a statement's relation, hiding `hiddenSlot`,
 * and wraps the result with a stable card identifier. The engine owns the
 * card identity; the generator owns the prompt.
 */
export function generateQuestion(
  pack: Pack,
  statement: Statement,
  hiddenSlot: HiddenSlot,
): RenderedQuestion {
  const generator = pack.generators[statement.relation];
  if (!generator) throw new Error(`no generator for relation: ${statement.relation}`);

  // Provenance is resolved here, from the pack id the loader stamped on the
  // statement. Unreachable when the graph was assembled by the loader, which
  // stamps and registers from the same manifest; the throw is for a caller that
  // hand-builds a graph, so it fails here rather than shipping a blank eyebrow.
  const source = pack.packs.get(statement.pack);
  if (!source) throw new Error(`statement ${statement.id} came from unknown pack: ${statement.pack}`);

  const graph = createGraph(pack.entities);
  const content = generator({ statement, hiddenSlot, graph });
  const promptVisual = promptVisualFor(statement, hiddenSlot);
  return {
    cardId: makeCardId(statement.id, hiddenSlot),
    prompt: content.prompt,
    input: content.input,
    packId: source.id,
    packLabel: source.labels.en,
    answerTypes: graph.getEntity(targetEntityId(statement, hiddenSlot)).types,
    // Spread only when present, so questions without a prompt visual carry no
    // key at all (and `.toEqual` fixtures stay exact).
    ...(promptVisual ? { promptVisual } : {}),
  };
}
