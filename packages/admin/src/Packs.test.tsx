import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Packs } from "./Packs.js";
import { focusPacksOn } from "./navigation.js";

const PACKS_LIST = [
  { id: "core-geo", label: "Core Geography", version: "1.0.0", statementCount: 0, cardCount: 0 },
  { id: "core-cities", label: "Core Cities", version: "0.0.1", statementCount: 1, cardCount: 1 },
];

const PACK_DETAIL = {
  id: "core-cities",
  label: "Core Cities",
  version: "0.0.1",
  entities: [],
  relations: [
    {
      relation: "located_in",
      definedHere: true,
      statements: [
        {
          id: "cc:tokyo-japan",
          relation: "located_in",
          subject: { id: "Q1490", label: "Tokyo" },
          object: { kind: "entity", entity: { id: "Q17", label: "Japan" } },
          packId: "core-cities",
        },
      ],
    },
  ],
};

const ENTITY_DETAIL = {
  id: "Q1490",
  label: "Tokyo",
  aliases: [],
  types: ["city"],
  ownerPackId: "core-geo",
  ownerPackLabel: "Core Geography",
  statements: [],
};

// apiClient (#172) appends `?env=` to every request; matching drops it so
// these fixtures stay keyed by the bare route, which is what's actually
// under test here — not the environment plumbing (covered separately by
// `apiClient.test.ts` and the BFF route tests).
function withoutEnv(path: string): string {
  return path.replace(/([?&])env=[^&]*&?/, "$1").replace(/[?&]$/, "");
}

function mockFetchSequence() {
  const responses = new Map<string, unknown>([
    ["/api/packs", PACKS_LIST],
    ["/api/packs/core-cities", PACK_DETAIL],
    ["/api/entities/Q1490", ENTITY_DETAIL],
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = withoutEnv(String(input));
      const body = responses.get(path);
      if (body === undefined) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

describe("Packs surface", () => {
  beforeEach(() => {
    mockFetchSequence();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every pack, including one with zero statements", async () => {
    render(<Packs />);
    expect(await screen.findByText("Core Geography")).toBeInTheDocument();
    expect(screen.getByText("Core Cities")).toBeInTheDocument();
  });

  it("opens a pack's detail, grouping statements by relation", async () => {
    render(<Packs />);
    fireEvent.click(await screen.findByText("Core Cities"));
    expect(await screen.findByText("located_in")).toBeInTheDocument();
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getByText("Japan")).toBeInTheDocument();
  });

  it("navigates to an entity's detail when its link is clicked, and back via breadcrumb", async () => {
    render(<Packs />);
    fireEvent.click(await screen.findByText("Core Cities"));
    fireEvent.click(await screen.findByText("Tokyo"));

    expect(await screen.findByText(/Core Geography/)).toBeInTheDocument();
    expect(screen.getByText("city")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All packs" }));
    expect(await screen.findByText("Core Geography")).toBeInTheDocument();
  });

  it("jumps straight to a pack when a cross-surface focus request is pending on mount", async () => {
    focusPacksOn({ kind: "pack", packId: "core-cities" });
    render(<Packs />);
    expect(await screen.findByText("located_in")).toBeInTheDocument();
  });

  it("jumps straight to an entity when a cross-surface focus request names one", async () => {
    focusPacksOn({ kind: "entity", entityId: "Q1490" });
    render(<Packs />);
    await waitFor(() => expect(screen.getByText("Tokyo")).toBeInTheDocument());
    expect(screen.getByText("city")).toBeInTheDocument();
  });
});
