import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "~src": path.resolve(__dirname, "./src"),
      "~": path.resolve(__dirname, "./")
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: {
      modules: {
        classNameStrategy: "non-scoped"
      }
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/types/**",
        "src/**/types.ts",
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/**/*.d.ts"
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85
      }
    }
  }
})
