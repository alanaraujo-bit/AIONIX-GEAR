import { execSync } from "node:child_process";
import { config } from "dotenv";

/** Migra o banco de testes e cria empresas/usuários com senhas geradas na hora (ficam em tests/e2e/.auth/). */
export default async function setup() {
  config({ quiet: true });
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL! };
  execSync("npx prisma migrate deploy", { stdio: "ignore", env });
  execSync("npx tsx tests/e2e/seed-e2e.ts", { stdio: "inherit", env });
}
