import { defineConfig } from "vitest/config"
import path from "path"

// `npm run build` (next build) runs before the tests in CI; keep its output out
// of the run. The `@/` alias mirrors tsconfig paths so tests can import app
// modules the same way the app does.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
  },
  resolve: {
    alias: { "@": __dirname },
  },
})
