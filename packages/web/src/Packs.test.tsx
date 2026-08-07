import type { PackList } from "@geo/contract";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Packs } from "./Packs.js";

const list: PackList = {
  packs: [
    {
      id: "core-cities",
      label: "Core Cities",
      description: "City→country statements.",
      version: "0.0.1",
      license: "CC0-1.0",
      credits: [{ source: "Wikidata", retrieved: "2026-07-26" }],
      statementCount: 6,
      cardCount: 6,
      included: true,
    },
    {
      id: "continental-countries",
      label: "Continental Countries",
      description: "Country→continent statements, quizzed both ways.",
      version: "0.0.1",
      statementCount: 193,
      cardCount: 386,
      included: true,
    },
  ],
  queued: 392,
};

/** Serves the catalogue on GET and records PUTs, so a save can be asserted on. */
function stubFetch(payload: PackList = list) {
  const puts: unknown[] = [];
  const fetchMock = vi.fn((url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "PUT") {
      puts.push(JSON.parse(init.body ?? "{}"));
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({ ok: true, json: async () => payload });
  });
  vi.stubGlobal("fetch", fetchMock);
  return puts;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Packs", () => {
  // Each pack is a toggle; an included pack reads as pressed.
  it("shows every selectable pack as a toggle reflecting the committed selection", async () => {
    stubFetch();
    render(<Packs />);
    expect(await screen.findByRole("button", { name: "Core Cities" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Continental Countries" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // Toggling is a pending edit: nothing reaches the server until Save.
  it("toggling a pack does not change the queue until saved", async () => {
    const puts = stubFetch();
    render(<Packs />);
    fireEvent.click(await screen.findByRole("button", { name: "Core Cities" }));

    expect(screen.getByRole("button", { name: "Core Cities" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(puts).toHaveLength(0);
    expect(screen.getByText(/Unsaved/)).toBeInTheDocument();
  });

  it("sends the checked packs when saved", async () => {
    const puts = stubFetch();
    render(<Packs />);
    fireEvent.click(await screen.findByRole("button", { name: "Core Cities" }));
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => expect(puts).toEqual([{ packIds: ["continental-countries"] }]));
  });

  it("cannot save an empty selection", async () => {
    stubFetch();
    render(<Packs />);
    fireEvent.click(await screen.findByRole("button", { name: "Core Cities" }));
    fireEvent.click(screen.getByRole("button", { name: "Continental Countries" }));

    expect(screen.getByRole("button", { name: "Save selection" })).toBeDisabled();
    expect(screen.getByText("Choose at least one pack.")).toBeInTheDocument();
  });

  it("cannot save when nothing has changed", async () => {
    stubFetch();
    render(<Packs />);
    await screen.findByRole("button", { name: "Core Cities" });
    expect(screen.getByRole("button", { name: "Save selection" })).toBeDisabled();
  });

  it("reports how many questions are queued", async () => {
    stubFetch();
    render(<Packs />);
    expect(await screen.findByText(/questions in your queue/)).toBeInTheDocument();
    expect(screen.getByText("392")).toBeInTheDocument();
  });
});
