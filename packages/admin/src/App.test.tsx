import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";
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
});
