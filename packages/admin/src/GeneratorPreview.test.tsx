import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneratorPreview } from "./GeneratorPreview.js";

const PACKS_LIST = [
  { id: "capital-cities", label: "Capital Cities", version: "0.0.1", statementCount: 1, cardCount: 2 },
  { id: "unquizzed-pack", label: "Unquizzed", version: "0.0.1", statementCount: 1, cardCount: 1 },
];

const CAPITAL_CITIES_DETAIL = {
  id: "capital-cities",
  label: "Capital Cities",
  version: "0.0.1",
  entities: [],
  relations: [
    {
      relation: "capital",
      definedHere: true,
      statements: [
        {
          id: "cap:japan",
          relation: "capital",
          subject: { id: "Q17", label: "Japan" },
          object: { kind: "entity", entity: { id: "Q1490", label: "Tokyo" } },
          packId: "capital-cities",
        },
      ],
    },
  ],
};

const QUIZZABLE_PREVIEW = {
  statementId: "cap:japan",
  relation: "capital",
  packId: "capital-cities",
  packLabel: "Capital Cities",
  provenance: "Capital Cities",
  cards: [
    { hiddenSlot: "object", quizzable: true, prompt: "What is the capital of Japan?", questionKind: "text", correctAnswer: "Tokyo" },
    { hiddenSlot: "subject", quizzable: true, prompt: "Tokyo is the capital of what country?", questionKind: "text", correctAnswer: "Japan" },
  ],
};

const NON_QUIZZABLE_DETAIL = {
  id: "unquizzed-pack",
  label: "Unquizzed",
  version: "0.0.1",
  entities: [],
  relations: [
    {
      relation: "unquizzed",
      definedHere: true,
      statements: [
        {
          id: "unq:1",
          relation: "unquizzed",
          subject: { id: "Q1", label: "A" },
          object: { kind: "entity", entity: { id: "Q2", label: "B" } },
          packId: "unquizzed-pack",
        },
      ],
    },
  ],
};

const NON_QUIZZABLE_PREVIEW = {
  statementId: "unq:1",
  relation: "unquizzed",
  packId: "unquizzed-pack",
  packLabel: "Unquizzed",
  provenance: "Unquizzed",
  cards: [{ hiddenSlot: "object", quizzable: false, reason: 'relation "unquizzed" has no generator' }],
};

// apiClient (#172) appends `?env=` to every request; matching drops it so
// these fixtures stay keyed by the bare route, which is what's actually
// under test here — not the environment plumbing (covered separately by
// `apiClient.test.ts` and the BFF route tests).
function withoutEnv(path: string): string {
  return path.replace(/([?&])env=[^&]*&?/, "$1").replace(/[?&]$/, "");
}

function mockFetch() {
  const responses = new Map<string, unknown>([
    ["/api/packs", PACKS_LIST],
    ["/api/packs/capital-cities", CAPITAL_CITIES_DETAIL],
    ["/api/packs/unquizzed-pack", NON_QUIZZABLE_DETAIL],
    ["/api/generator-preview/cap%3Ajapan", QUIZZABLE_PREVIEW],
    ["/api/generator-preview/unq%3A1", NON_QUIZZABLE_PREVIEW],
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const body = responses.get(withoutEnv(String(input)));
      if (body === undefined) return new Response(null, { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

describe("Generator Preview surface", () => {
  beforeEach(() => {
    mockFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the prompt, hidden slot, question kind, and correct answer for both forward and reverse cards", async () => {
    render(<GeneratorPreview />);

    fireEvent.change(await screen.findByLabelText("Pack"), { target: { value: "capital-cities" } });
    fireEvent.click(await screen.findByText("cap:japan"));

    expect(await screen.findByText("What is the capital of Japan?")).toBeInTheDocument();
    expect(screen.getByText("Tokyo is the capital of what country?")).toBeInTheDocument();
    expect(screen.getAllByText("text")).toHaveLength(2);
    expect(screen.getAllByText("Tokyo", { exact: false }).length).toBeGreaterThan(0);
  });

  it("shows a non-quizzable statement gracefully, with no prompt and a reason", async () => {
    render(<GeneratorPreview />);

    fireEvent.change(await screen.findByLabelText("Pack"), { target: { value: "unquizzed-pack" } });
    fireEvent.click(await screen.findByText("unq:1"));

    expect(await screen.findByText(/no generator/)).toBeInTheDocument();
    expect(screen.queryByText(/What is/)).not.toBeInTheDocument();
  });
});
