import { makeCardId } from "./card.js";
import { createGraph } from "./graph.js";
import type { HiddenSlot, Pack, RenderedQuestion, Statement } from "./types.js";

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

  const content = generator({ statement, hiddenSlot, graph: createGraph(pack.entities) });
  return {
    cardId: makeCardId(statement.id, hiddenSlot),
    prompt: content.prompt,
    input: content.input,
    packId: source.id,
    packLabel: source.labels.en,
  };
}
