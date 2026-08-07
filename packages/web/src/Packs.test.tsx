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
      // Quizzed both ways, so cards outnumber statements — which is why the
      // picker reports both, and why they must not be wired to each other.
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
  it("lists every selectable pack with a checkbox", async () => {
    stubFetch();
    render(<Packs />);
    expect(await screen.findByLabelText("Core Cities")).toBeChecked();
    expect(screen.getByLabelText("Continental Countries")).toBeChecked();
  });

  it("shows the focused pack's details from its manifest", async () => {
    stubFetch();
    render(<Packs />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Details" }))[1] as HTMLElement);

    expect(await screen.findByText("Country→continent statements, quizzed both ways.")).toBeInTheDocument();
    expect(screen.getByText("386")).toBeInTheDocument();
    expect(screen.getByText("193")).toBeInTheDocument();
  });

  // The distinction the picker is built around: reading about a pack is free.
  it("focusing a pack does not change whether it is included", async () => {
    const puts = stubFetch();
    render(<Packs />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Details" }))[0] as HTMLElement);

    expect(screen.getByLabelText("Core Cities")).toBeChecked();
    expect(puts).toHaveLength(0);
  });

  // Checking is a pending edit: nothing reaches the server until Save.
  it("checking a box does not change the queue until saved", async () => {
    const puts = stubFetch();
    render(<Packs />);
    fireEvent.click(await screen.findByLabelText("Core Cities"));

    expect(screen.getByLabelText("Core Cities")).not.toBeChecked();
    expect(puts).toHaveLength(0);
    expect(screen.getByText(/Unsaved/)).toBeInTheDocument();
  });

  it("sends the checked packs when saved", async () => {
    const puts = stubFetch();
    render(<Packs />);
    fireEvent.click(await screen.findByLabelText("Core Cities"));
    fireEvent.click(screen.getByRole("button", { name: "Save selection" }));

    await waitFor(() => expect(puts).toEqual([{ packIds: ["continental-countries"] }]));
  });

  it("cannot save an empty selection", async () => {
    stubFetch();
    render(<Packs />);
    fireEvent.click(await screen.findByLabelText("Core Cities"));
    fireEvent.click(screen.getByLabelText("Continental Countries"));

    expect(screen.getByRole("button", { name: "Save selection" })).toBeDisabled();
    expect(screen.getByText("Choose at least one pack.")).toBeInTheDocument();
  });

  it("cannot save when nothing has changed", async () => {
    stubFetch();
    render(<Packs />);
    await screen.findByLabelText("Core Cities");
    expect(screen.getByRole("button", { name: "Save selection" })).toBeDisabled();
  });

  it("reports how many questions are queued", async () => {
    stubFetch();
    render(<Packs />);
    expect(await screen.findByText(/392 questions in your queue/)).toBeInTheDocument();
  });
});
