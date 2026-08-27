/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The admin SPA, deliberately separate from the player app (`@geo/web`) so it
 * deploys apart and never lands in the player bundle. It talks only to the
 * admin BFF (`src/index.ts`) — the sole holder of the service-role key — over
 * `/api`, exactly as the player SPA proxies to its own Node server.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      "/api": {
        target: "http://localhost:3101",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
