import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/generated/**"],
    // Several test files share the same local Postgres instance. Running them in parallel
    // opens multiple concurrent connection pools against it, which this local dev DB doesn't
    // handle reliably. Serializing keeps the suite deterministic.
    fileParallelism: false,
  },
});
