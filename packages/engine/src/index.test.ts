import { describe, expect, it } from "vitest";
import { ENGINE_READY } from "./index.js";

describe("engine", () => {
  it("is wired into the workspace", () => {
    expect(ENGINE_READY).toBe(true);
  });
});
