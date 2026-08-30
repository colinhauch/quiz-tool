import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnvironmentSelector } from "./EnvironmentSelector.js";

/**
 * Shell tests for the environment selector (#172), matching the rest of this
 * package's component tests: Testing-Library, `fireEvent` (not user-event),
 * and the reload asserted through the injected `onReload` seam rather than
 * by touching `window.location` — see `EnvironmentSelector.tsx`'s own doc
 * comment for why that seam exists.
 */
describe("EnvironmentSelector", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders all three environments, each naming both itself and its schema", () => {
    render(<EnvironmentSelector />);
    const select = screen.getByRole("combobox", { name: /environment/i });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /prod/i })).toHaveTextContent("public");
    expect(screen.getByRole("option", { name: /test/i })).toHaveTextContent("test");
    expect(screen.getByRole("option", { name: /^dev/i })).toHaveTextContent("dev");
  });

  it("defaults to dev when nothing is persisted", () => {
    render(<EnvironmentSelector />);
    expect(screen.getByRole("combobox", { name: /environment/i })).toHaveValue("dev");
  });

  it("honors a persisted choice on mount", () => {
    localStorage.setItem("geo-admin-env", "test");
    render(<EnvironmentSelector />);
    expect(screen.getByRole("combobox", { name: /environment/i })).toHaveValue("test");
  });

  it("persists the choice and requests a reload through the injected seam, without touching a browser global", () => {
    const onReload = vi.fn();
    render(<EnvironmentSelector onReload={onReload} />);

    fireEvent.change(screen.getByRole("combobox", { name: /environment/i }), { target: { value: "prod" } });

    expect(localStorage.getItem("geo-admin-env")).toBe("prod");
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
