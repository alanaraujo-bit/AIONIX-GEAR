import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";

/**
 * Cliente Prisma único por processo. Conexões limitadas porque funções serverless
 * multiplicam instâncias. Use sempre via camada de domínio (que filtra por orgId).
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não está definida.");
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter, log: ["error"] });
}

const globalForPrisma = globalThis as unknown as { __agPrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.__agPrisma ?? createClient();
globalForPrisma.__agPrisma = prisma;

export type Tx = Prisma.TransactionClient;
export { Prisma };
