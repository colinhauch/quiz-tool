import { describe, expect, it } from "vitest";
import { adminHealthSchema } from "./admin.js";

describe("adminHealthSchema", () => {
  it("accepts the read-only ok payload", () => {
    expect(adminHealthSchema.parse({ status: "ok", readOnly: true })).toEqual({
      status: "ok",
      readOnly: true,
    });
  });

  it("rejects a payload that claims it can write", () => {
    // readOnly is pinned to `true`: the admin seam cannot describe a writable app.
    expect(() => adminHealthSchema.parse({ status: "ok", readOnly: false })).toThrow();
  });

  it("rejects unknown keys (strict)", () => {
    expect(() => adminHealthSchema.parse({ status: "ok", readOnly: true, extra: 1 })).toThrow();
  });
});
