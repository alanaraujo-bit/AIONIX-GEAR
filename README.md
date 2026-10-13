# AIONIX GEAR

Sistema de gestão para comerciantes independentes de hardware: estoque por unidade (com série, local, estado e histórico), compras com custo real, vendas (orçamento → venda → recebimento → entrega), **catiras** com análise econômica, **montagens e desmontagens de PC**, financeiro (caixa, a receber/a pagar), relatórios gerenciais e sugestões explicáveis. Multiempresa (SaaS) desde a fundação. Interface em português do Brasil, valores em BRL, fuso padrão America/Belem.

Primeiro cliente: Gabriel Airton.

## Stack

| Camada | Escolha |
|---|---|
| App | Next.js 16 (App Router, Server Actions, Turbopack), React 19, TypeScript |
| UI | Tailwind CSS 4, Radix UI, lucide, cmdk, Recharts, IBM Plex Sans/Mono |
| Dados | PostgreSQL + Prisma 7 (adapter `pg`), migrações versionadas |
| Arquivos | No próprio Postgres (padrão) ou Vercel Blob privado (`BLOB_READ_WRITE_TOKEN`) |
| Testes | Vitest (domínio contra Postgres real) + Playwright (E2E no build de produção) |
| Hospedagem | Vercel (app) + Railway (PostgreSQL) |

## Rodar localmente

```bash
npm install
cp .env.example .env            # preencha; para local, use os valores do Postgres embutido abaixo
npm run db:local                # Postgres embutido na porta 54329 (deixe rodando)
npx prisma migrate deploy       # aplica as migrações
npm run admin -- create-org --org "Minha Loja" --email voce@exemplo.com --name "Seu Nome"
npm run dev                     # http://localhost:3000 — abra o link de senha impresso pelo comando acima
```

Dados de demonstração (empresa separada e marcada como demo):

```bash
npm run seed:demo -- --owner demo@exemplo.com [--member voce@exemplo.com]
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Desenvolvimento / build de produção / servidor de produção |
| `npm test` | Testes de domínio (cenários A–J, segurança, concorrência) contra o banco de testes |
| `npm run test:e2e` | Build + testes E2E no navegador (porta 3100, banco de testes) |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run db:local` | Sobe o PostgreSQL embutido para desenvolvimento e testes |
| `npm run db:migrate` / `db:deploy` | Cria migração (dev) / aplica migrações (produção) |
| `npm run admin -- <comando>` | `create-org`, `platform-admin`, `reset-link`, `list-orgs` (ver `scripts/admin.ts`) |
| `npm run seed:demo` | Cria a empresa de demonstração |

## Estrutura

```
prisma/                 schema + migrações (com CHECKs de integridade em SQL)
src/server/domain/      regras de negócio (toda escrita passa por aqui, sempre com orgId)
src/server/queries/     leituras para as telas (escopo da empresa + ocultação de custos por papel)
src/server/auth/        senhas (scrypt), sessões em banco, links de senha
src/app/(app)/          telas do sistema (estoque, compras, vendas, catiras, montagens, …)
src/app/(auth)/         entrar, definir senha, convite
src/app/(platform)/     administração da plataforma (sem acesso a dados de negócio)
src/app/api/            arquivos (upload/leitura controlada) e exportações CSV/backup
tests/                  testes de domínio (Vitest) e E2E (Playwright)
docs/                   regras de negócio, backup, operação e entrega
```

## Documentação

- [docs/REGRAS-DE-NEGOCIO.md](docs/REGRAS-DE-NEGOCIO.md) — como cada número é calculado (custo, catira, montagem, resultado, caixa)
- [docs/OPERACAO.md](docs/OPERACAO.md) — implantação, variáveis de ambiente, primeiro acesso do Gabriel, segurança, suporte
- [docs/BACKUP.md](docs/BACKUP.md) — cópias de segurança e restauração
- [docs/ENTREGA.md](docs/ENTREGA.md) — o que está pronto, evidências de teste, limitações conhecidas e bloqueios
- [PRODUCT.md](PRODUCT.md) / [DESIGN.md](DESIGN.md) — princípios de produto e sistema visual
