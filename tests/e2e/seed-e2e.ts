/** Cria as empresas/usuários de teste do E2E (executado via tsx pelo global-setup). */
import { writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { prisma } from "../../src/server/db";
import { provisionOrganization } from "../../src/server/domain/team";
import { hashPassword } from "../../src/server/auth/crypto";

(async () => {
  const stamp = Date.now();
  const pw = () => `e2e-${randomBytes(9).toString("base64url")}`;
  const mk = async (label: string) => {
    const email = `owner-${label}-${stamp}@e2e.test`;
    const password = pw();
    const p = await provisionOrganization({ orgName: `E2E ${label} ${stamp}`, ownerEmail: email, ownerName: `Dono ${label}` });
    await prisma.user.update({ where: { id: p.userId }, data: { passwordHash: await hashPassword(password) } });
    await prisma.organization.update({ where: { id: p.orgId }, data: { onboardedAt: new Date() } });
    return { email, password, orgId: p.orgId };
  };
  const a = await mk("A");
  const b = await mk("B");
  const salesEmail = `vendas-${stamp}@e2e.test`;
  const salesPassword = pw();
  const su = await prisma.user.create({ data: { email: salesEmail, name: "Vendedor E2E", passwordHash: await hashPassword(salesPassword) } });
  await prisma.membership.create({ data: { orgId: a.orgId, userId: su.id, role: "SALES" } });
  mkdirSync("tests/e2e/.auth", { recursive: true });
  writeFileSync("tests/e2e/.auth/users.json", JSON.stringify({ a, b, sales: { email: salesEmail, password: salesPassword } }, null, 2));
  await prisma.$disconnect();
})();
