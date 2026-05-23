import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
});
