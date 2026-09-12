import { describe, expect, it } from "vitest";
import { badgeFor } from "./badgeFor.js";

describe("badgeFor", () => {
  it("suppresses the badge on prod only", () => {
    expect(badgeFor("prod")).toBeNull();
  });

  it("labels each non-prod environment with its uppercased name", () => {
    expect(badgeFor("dev")?.label).toBe("DEV");
    expect(badgeFor("test")?.label).toBe("TEST");
    expect(badgeFor("local")?.label).toBe("LOCAL");
    expect(badgeFor("unknown")?.label).toBe("UNKNOWN");
  });

  it("gives dev and test distinct variants (distinct color)", () => {
    expect(badgeFor("dev")?.variant).not.toBe(badgeFor("test")?.variant);
  });
});
