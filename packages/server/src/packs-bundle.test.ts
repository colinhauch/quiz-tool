import { enumerateCards, generateQuestion, type Pack } from "@geo/engine";
import { describe, expect, it } from "vitest";
import { loadedPacks } from "./packs.generated.js";
import { assembleLoaded, loadAllPacks } from "./pack-loader.js";

/**
 * The build-time bundle (`packs.generated.ts`) must serve exactly the graph the
 * on-disk loader serves — that equivalence is the whole reason the bundle is
 * safe to run on a Cloudflare Worker instead of the fs loader. This test is the
 * guarantee: it compares the bundled graph against `loadAllPacks()`, which is
 * what production runs today. Regenerate the bundle (`pnpm bundle-packs`) when
 * packs change, or this fails.
 *
 * Generators are compared by *behavior*, not identity: they are functions, and
 * the fs path imports them dynamically while the bundle imports them statically,
 * so their references legitimately differ. Everything else is compared by value.
 */
function structure(g: Pack) {
  return {
    entities: [...g.entities.entries()],
    statements: g.statements,
    packs: [...g.packs.entries()],
    hiddenSlots: g.hiddenSlots,
    relations: Object.keys(g.generators).sort(),
  };
}

describe("packs.generated bundle", () => {
  it("assembles structurally the same graph the fs loader produces", async () => {
    const fromDisk = await loadAllPacks();
    const fromBundle = assembleLoaded(loadedPacks);
    expect(structure(fromBundle)).toEqual(structure(fromDisk));
  });

  it("renders identical questions from every card the graph can express", async () => {
    const fromDisk = await loadAllPacks();
    const fromBundle = assembleLoaded(loadedPacks);
    let checked = 0;
    for (const card of enumerateCards(fromDisk)) {
      if (!(card.statement.relation in fromBundle.generators)) continue;
      expect(generateQuestion(fromBundle, card.statement, card.hiddenSlot)).toEqual(
        generateQuestion(fromDisk, card.statement, card.hiddenSlot),
      );
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
