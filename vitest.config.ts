import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/contract",
      "packages/engine",
      "packages/server",
      "packages/web",
    ],
  },
});
