import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ quiet: true });

const PORT = 3100;
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("TEST_DATABASE_URL não definida.");

/**
 * E2E: build de produção servido na porta 3100 apontando para o banco de TESTES.
 * Cada execução cria empresas novas (não depende de banco vazio).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Belem",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } }, grepInvert: /@mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/entrar`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: testDb, APP_URL: `http://localhost:${PORT}`, PORT: String(PORT) },
  },
});
