import { type Card, enumerateCards } from "./card.js";
import type { Pack } from "./types.js";

/**
 * The question queue: the order the learner will be asked things in, and the
 * one place pack selection is applied.
 *
 * **Provisional — the scheduler is deliberately not designed yet (#20).** This
 * exists because the pack picker needs somewhere for "what you'll be asked
 * next" to live; it is the smallest thing that gives deselecting a pack a
 * visible, correct meaning. How a queue is ordered, how a newly included pack
 * folds in, and what happens at the end of a pass are all *scheduling* policy,
 * and the scheduler session owns them. Expect this file to be rewritten; don't
 * build on its ordering guarantees.
 *
 * It replaced a uniform random draw taken fresh on every request, which had two
 * problems the queue fixes together. Drawing with replacement meant the same
 * card could come up twice running; and with no upcoming-order to speak of,
 * "which packs am I being quizzed on" had nowhere to live except a filter
 * re-applied per request.
 *
 * A queue holds only what is *ahead*. Asked cards are dropped, never marked —
 * the answer log is the record of what happened, and it is append-only. Nothing
 * here is ever consulted to render history, so a queue rebuild can never
 * disturb it.
 *
 * Everything in this module is pure: a queue goes in, a new queue comes out.
 * The server owns the one live instance and the randomness; the engine owns
 * what a queue *is*. That keeps fold-in and exhaustion testable without a
 * server, which matters because both are order-sensitive and easy to get
 * subtly wrong.
 */

/**
 * Cards ahead of the learner, plus the packs they were drawn from.
 *
 * `included` is carried on the queue rather than looked up from elsewhere so a
 * queue is self-describing: re-selecting compares against the packs *this*
 * queue was built from, which is what makes "newly included" meaningful.
 */
export interface Queue {
  /** Not yet asked, in the order they will be. The head is next. */
  readonly upcoming: readonly Card[];
  /** Pack ids this queue draws from. Never empty. */
  readonly included: readonly string[];
}

/** Random source, injected so every ordering decision is deterministic under test. */
export type Rng = () => number;

/** A card is drawable when its relation has a generator and its pack is included. */
function drawableCards(graph: Pack, included: readonly string[]): Card[] {
  const packs = new Set(included);
  return enumerateCards(graph).filter(
    (card) => card.statement.relation in graph.generators && packs.has(card.statement.pack),
  );
}

/** Fisher-Yates, so every permutation is equally likely and `rng` fully determines it. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * Randomly interleaves `extra` into `kept` while preserving the relative order
 * of each. At every step the next item is taken from one side with probability
 * proportional to how much of that side is left, which is what makes the result
 * a uniformly random interleaving rather than a lumpy one.
 *
 * This is what "fold the new pack's questions in" means precisely: cards the
 * learner was already going to see keep their order, and the new pack's cards
 * land scattered among them instead of in a block at the end.
 */
function interleave<T>(kept: readonly T[], extra: readonly T[], rng: Rng): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < kept.length || j < extra.length) {
    const keptLeft = kept.length - i;
    const extraLeft = extra.length - j;
    if (extraLeft === 0 || (keptLeft > 0 && rng() * (keptLeft + extraLeft) < keptLeft)) {
      out.push(kept[i++] as T);
    } else {
      out.push(extra[j++] as T);
    }
  }
  return out;
}

/**
 * A fresh queue: every drawable card from `included`, shuffled into one pass.
 *
 * Throws on a selection that yields nothing — an empty pack list, or packs that
 * ship no quizzable statements. The contract refuses an empty selection at the
 * seam, so this is the backstop that keeps "the learner is being quizzed on
 * nothing" from ever being a state the app can sit in silently.
 */
export function buildQueue(graph: Pack, included: readonly string[], rng: Rng = Math.random): Queue {
  const cards = drawableCards(graph, included);
  if (cards.length === 0) throw new Error(`no quizzable cards in packs: ${included.join(", ") || "(none)"}`);
  return { upcoming: shuffle(cards, rng), included: [...included] };
}

/**
 * Takes the next card, returning it with the queue that follows it.
 *
 * An exhausted queue reshuffles into a new pass rather than running dry, so the
 * learner sees every card once before seeing any of them twice, and the quiz
 * never has to tell them it is over.
 */
export function drawNext(graph: Pack, queue: Queue, rng: Rng = Math.random): { card: Card; queue: Queue } {
  const live = queue.upcoming.length > 0 ? queue : buildQueue(graph, queue.included, rng);
  const [card, ...rest] = live.upcoming;
  // Unreachable: buildQueue throws rather than returning an empty pass.
  if (!card) throw new Error("question queue is empty after a rebuild");
  return { card, queue: { upcoming: rest, included: live.included } };
}

/**
 * Applies a new pack selection to a queue mid-pass.
 *
 * Cards from dropped packs leave; cards the learner was already going to see
 * keep their relative order; cards from newly included packs are shuffled in
 * among them. The learner's place in the pass survives a selection change —
 * which is the whole reason this is not just `buildQueue` again.
 *
 * A pack that was already included keeps only its *unasked* cards, because
 * those are the only ones the queue still knows about. Re-including a pack that
 * was dropped mid-pass brings all of its cards back, asked-this-pass or not;
 * the queue holds no memory of what it has handed out, and the answer log —
 * which does — is never consulted for scheduling.
 */
export function applySelection(
  graph: Pack,
  queue: Queue,
  included: readonly string[],
  rng: Rng = Math.random,
): Queue {
  const packs = new Set(included);
  const previously = new Set(queue.included);
  const kept = queue.upcoming.filter((card) => packs.has(card.statement.pack));
  const added = drawableCards(graph, included).filter((card) => !previously.has(card.statement.pack));

  if (kept.length === 0 && added.length === 0) return buildQueue(graph, included, rng);
  return { upcoming: interleave(kept, shuffle(added, rng), rng), included: [...included] };
}
