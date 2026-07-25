import { defineConfig } from "vitest/config"

// Only run the TypeScript sources — see core-api/vitest.config.ts for why the
// compiled dist/ copies must stay out of the run.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
})
