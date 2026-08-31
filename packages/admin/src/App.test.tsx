import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
import { focusPacksOn } from "./navigation.js";
import { SURFACES } from "./surfaces.js";

describe("admin shell", () => {
  it("renders a nav item for every surface", () => {
    render(<App />);
    for (const surface of SURFACES) {
      expect(screen.getByRole("button", { name: surface.label })).toBeInTheDocument();
    }
  });

  it("shows an always-visible read-only indicator", () => {
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(/read-only/i);
  });

  it("marks the active surface and switches panes on selection", () => {
    render(<App />);

    // Packs is the default surface.
    expect(screen.getByRole("button", { name: "Packs" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Packs" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Graph Health" }));

    expect(screen.getByRole("button", { name: "Graph Health" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Graph Health" })).toBeInTheDocument();
    // The read-only indicator survives the switch — it is shell chrome.
    expect(screen.getByRole("status")).toHaveTextContent(/read-only/i);
  });

  it("switches to Packs when a cross-surface focus request arrives (Graph Health drill-down, #138)", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Graph Health" }));
    expect(screen.getByRole("button", { name: "Graph Health" })).toHaveAttribute("aria-current", "page");

    act(() => {
      focusPacksOn({ kind: "entity", entityId: "Q1" });
    });

    expect(screen.getByRole("button", { name: "Packs" })).toHaveAttribute("aria-current", "page");
  });

  // The tint exists so a screenshot says which environment it was taken
  // against; the honest behavioural assertion is that the shell declares the
  // environment it is showing, which is also what the tint is keyed off.
  it("declares which environment the shell is showing", () => {
    render(<App />);
    expect(screen.getByRole("navigation", { name: "Admin surfaces" })).toBeInTheDocument();
    expect(document.querySelector(".admin-shell")).toHaveAttribute("data-environment", "dev");
  });
});
