/**
 * Administração da plataforma pela linha de comando (sem senhas no código).
 *
 *   npm run admin -- create-org --org "Gabriel Airton Hardware" --email gabriel@exemplo.com --name "Gabriel Airton"
 *   npm run admin -- platform-admin --email voce@exemplo.com --name "Seu Nome"
 *   npm run admin -- reset-link --email pessoa@exemplo.com
 *   npm run admin -- list-orgs
 *
 * Os comandos imprimem um link de uso único (válido por 72h) para a pessoa definir a própria senha.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { provisionOrganization } from "../src/server/domain/team";
import { createSetupLink } from "../src/server/auth/core";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

async function main() {
  const cmd = process.argv[2];
  if (cmd === "create-org") {
    const orgName = arg("org");
    const email = arg("email");
    const name = arg("name") ?? "";
    if (!orgName || !email) throw new Error('Uso: create-org --org "Nome da empresa" --email dono@email --name "Nome do dono" [--demo]');
    const r = await provisionOrganization({ orgName, ownerEmail: email, ownerName: name, isDemo: process.argv.includes("--demo") });
    console.log(`\nEmpresa criada: ${orgName} (${r.orgSlug})`);
    if (r.setupToken) console.log(`Link para o proprietário definir a senha (72h, uso único):\n${base}/definir-senha/${r.setupToken}\n`);
    else console.log("O proprietário já tinha conta: ele entra com a senha atual e verá a nova empresa.\n");
  } else if (cmd === "platform-admin") {
    const email = arg("email")?.toLowerCase();
    if (!email) throw new Error("Uso: platform-admin --email voce@email --name \"Nome\"");
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: arg("name") ?? email, isPlatformAdmin: true },
      update: { isPlatformAdmin: true },
    });
    console.log(`\n${email} agora é administrador da plataforma.`);
    if (!user.passwordHash) {
      const token = await createSetupLink(user.id, "SETUP", 72);
      console.log(`Defina a senha em (72h, uso único):\n${base}/definir-senha/${token}\n`);
    }
  } else if (cmd === "reset-link") {
    const email = arg("email")?.toLowerCase();
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user) throw new Error("Usuário não encontrado.");
    const token = await createSetupLink(user.id, "RESET", 24);
    console.log(`\nLink de redefinição para ${email} (24h, uso único):\n${base}/definir-senha/${token}\n`);
  } else if (cmd === "list-orgs") {
    const orgs = await prisma.organization.findMany({ include: { _count: { select: { memberships: true } } }, orderBy: { createdAt: "asc" } });
    for (const o of orgs) console.log(`${o.slug.padEnd(32)} ${o.name.padEnd(40)} membros: ${o._count.memberships}${o.isDemo ? "  [demo]" : ""}`);
  } else {
    console.log("Comandos: create-org | platform-admin | reset-link | list-orgs (veja o topo de scripts/admin.ts)");
  }
}

main()
  .catch((e) => {
    console.error(`Erro: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
