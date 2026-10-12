import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import path from "node:path";

config({ quiet: true });

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("TEST_DATABASE_URL não definida (veja .env.example).");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    env: { DATABASE_URL: testDb, DATABASE_POOL_MAX: "10" },
    globalSetup: ["tests/global-setup.ts"],
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
