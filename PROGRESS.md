# AIONIX GEAR — Estado da entrega (2026-10-12)

## Pronto e verificado
- **Núcleo de domínio** (`src/server/domain/*`): estoque por unidade/lote, compras com rateio exato, vendas (orçamento ≠ venda ≠ recebimento ≠ entrega, parcelas, troca na venda, consignação, devolução, cancelamento), catiras (custo transferido, sem receita fantasma, análise prévia, contrapropostas, desfazer), montagens (reserva, compatibilidade, conclusão como PC rastreável), desmontagem com rateio, inventário físico, importação reversível, financeiro append-only (títulos, baixas, estornos, conciliação), auth com sessões em banco, convites, papéis, multiempresa.
- **Integridade no banco**: CHECKs (estoque nunca negativo, valores positivos), índice único de peça ativa em montagem, transições condicionais contra venda dupla, idempotência.
- **Testes**: `npm test` — 17/17 cenários A–J passando em Postgres real (incl. venda simultânea e duplo clique).
- **Interface**: shell (barra lateral, busca Ctrl+K, ações rápidas, navegação mobile, aviso offline, tema claro/escuro), login/definir senha/convite, painel inicial com números rastreáveis e onboarding, estoque completo (lista, filtros, visões salvas, ficha, cadastro em 4 modos, edição, fotos, etiquetas QR, anúncio, locais, leitor de código, desmontagem, inventário, importação). Fluxo "comprei uma RTX" validado no navegador (Playwright).

## Falta construir (domínio já pronto, faltam as telas)
- Compras (`/compras`), Vendas (`/vendas` + recibo/orçamento imprimível e link público `/p/[token]`), Catiras, Montagens, Contatos, Negociações (kanban), Financeiro (contas, receber/pagar, lançar despesa), Relatórios (DRE, CSV), Inteligência, Configurações (empresa, equipe, categorias, backup/export, auditoria), Plataforma `/plataforma`.
  Queries já existem em `src/server/queries/commerce.ts`; ações em `financeiro/actions.ts`, `montagens/actions.ts`, `contatos/actions.ts`; componente `TitleList` pronto.
- PWA service worker/página offline, suíte E2E Playwright formal, docs (regras de negócio, backup/restauração), deploy.

## Bloqueios (ação sua)
1. **Postgres de produção parado**: projeto Railway `aionix-gear`, serviço Postgres com deploy REMOVED. Clique em Deploy no painel ou rode
   `! railway redeploy -p b802d71f-c373-4f10-91dc-9be3f9459c59 -e production -s Postgres --from-source -y`.
2. **Autorização** para aplicar migrações nesse banco e publicar o projeto `aionix-gear` na Vercel (time `aionixdev`).

## Rodar localmente
`npm run db:local` (Postgres embutido, porta 54329) · `npx prisma migrate deploy` · `npm run dev` · `npm test`.
Criar empresa: `npm run admin -- create-org --org "Nome" --email dono@email --name "Nome"` (gera link de senha, sem senha no código).
