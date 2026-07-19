import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("server app", () => {
  it("serves a health check over the in-process seam", async () => {
    const res = await createApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
