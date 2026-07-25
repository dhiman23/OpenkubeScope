import { defineConfig } from "vitest/config"

// Only run the TypeScript sources. `npm run build` (which CI runs before the
// tests) emits CommonJS into dist/, and vitest cannot require() itself from a
// CJS module — so a compiled copy of a test would fail the suite even though the
// src/ copy passes. tsconfig also excludes tests from the build; this is the
// second layer, in case a stale dist/ is still lying around.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
})
