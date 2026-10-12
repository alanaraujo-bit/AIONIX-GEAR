import { execSync } from "node:child_process";
import { config } from "dotenv";

/**
 * Aplica as migrações reais no banco de testes (operação não destrutiva).
 * Os testes não dependem de banco vazio: cada cenário cria a própria empresa.
 */
export default function setup() {
  config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/test/i.test(url)) throw new Error("TEST_DATABASE_URL precisa apontar para um banco de TESTE.");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
