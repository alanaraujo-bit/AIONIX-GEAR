# Operação e entrega técnica

## 1. Arquitetura em uma página

```
Navegador (PWA) ──HTTPS──> Vercel (Next.js 16, funções Node)
                              │  Server Components (leitura) + Server Actions (escrita)
                              │  src/server/domain/* → regras de negócio, sempre com orgId da sessão
                              ▼
                       PostgreSQL (Railway, projeto "aionix-gear")
                       migrações Prisma + CHECKs/índices em SQL
                       fotos/documentos no próprio banco (ou Vercel Blob privado, opcional)
```

- **Sessões:**
  - token aleatório no cookie `ag_session` (httpOnly, secure em produção, SameSite=Lax);
  - no banco fica só o hash SHA-256 do token;
  - vale 30 dias, renovada com o uso;
  - sair encerra a sessão no servidor.
- **Senhas:**
  - scrypt com sal, mínimo de 10 caracteres;
  - login bloqueado por 15 minutos após 8 falhas no mesmo e-mail ou no mesmo IP (tabela `LoginAttempt`), sem revelar se o e-mail existe;
  - nenhuma senha no código ou em seeds.
- **Multiempresa:**
  - toda consulta e escrita usa o `orgId` da sessão;
  - IDs vindos do navegador são sempre conferidos contra a empresa ativa;
  - testado em `tests/security.test.ts` e no E2E.
- **Papéis:**
  - Proprietário, Administrador, Vendas e Estoque (matriz em `src/lib/permissions.ts`), verificados no servidor;
  - custos e lucros são removidos das respostas no servidor para quem não tem `inventory.cost`;
  - administrador da plataforma é outro nível: vê empresas, membros e uso, mas não registros de negócio.
- **Auditoria:** criação, edição, cancelamento, estorno, alteração de custo, troca de papel, definição/troca de senha e exportações ficam em `AuditLog`.

## 2. Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | URL do Postgres. Na Vercel: URL **pública** (proxy TCP) do Railway |
| `DATABASE_POOL_MAX` | não (5) | Conexões por instância. Use 3–5 em serverless |
| `APP_URL` | sim | URL pública do app, usada nos links de senha, convites, QR e orçamentos |
| `NEXT_PUBLIC_BRAND_NAME` | não | Nome exibido (padrão "AIONIX GEAR") |
| `BLOB_READ_WRITE_TOKEN` | não | Ativa o Vercel Blob privado para fotos. Vazio = arquivos no Postgres |

`TEST_DATABASE_URL` é usada só por testes locais. Segredos ficam no painel da Vercel e no `.env` local (ignorado pelo git), nunca no repositório.

## 3. Implantação

### Banco (Railway)

1. Projeto `aionix-gear`, serviço `Postgres`. Ele precisa estar com deploy ativo. O sistema usa o banco **`aionix_gear`** desse servidor (URL pública do proxy terminando em `/aionix_gear`). O banco padrão `railway` guarda dados de uma versão anterior e não é usado.
2. Faça um backup antes (se já houver dados): ver [BACKUP.md](BACKUP.md).
3. Aplique as migrações:
   `DATABASE_URL="<url pública do Railway>" npx prisma migrate deploy`
   A migração habilita a extensão `pg_trgm`, usada na busca por semelhança.

### App (Vercel)

Esta pasta ainda não tem repositório remoto. Há dois caminhos.

**Caminho A, pela CLI** (sem GitHub):

1. Vincule a pasta: `npx vercel@latest link`. Escolha o time `aionixdev` e crie o projeto `aionix-gear`.
2. Cadastre as variáveis de produção, uma a uma. O valor é pedido de forma interativa e não fica no histórico:
   - `npx vercel@latest env add DATABASE_URL production`
   - o mesmo para `DATABASE_POOL_MAX` (ex.: `3`);
   - o mesmo para `APP_URL` (provisório; corrigido no passo 4).
3. Publique: `npx vercel@latest deploy --prod`. Anote a URL de produção.
4. Ajuste `APP_URL` para essa URL (`npx vercel@latest env rm APP_URL production` e `env add` de novo) e publique outra vez. Isso é necessário porque os links de senha e convite usam `APP_URL`.

**Caminho B, pelo GitHub:**

1. Envie o repositório para o GitHub.
2. Na Vercel: *Add New › Project* e importe o repositório.
3. Cadastre as variáveis da seção 2 e publique.
4. Ajuste `APP_URL` como no passo 4 acima.

**Nos dois casos:**

- `postinstall` gera o cliente Prisma.
- Migrações **não** rodam no build. Rode `prisma migrate deploy` antes de publicar uma versão com migração nova.
- Para conferir a publicação:
  1. `/entrar` abre e o login funciona;
  2. *Relatórios › Verificação* mostra "Tudo confere.".
- Só depois de `APP_URL` correto rode o `create-org` da seção 4.

**Região:** use a região de funções da Vercel mais próxima da região do Postgres no Railway. A latência entre elas pesa em cada página.

## 4. Primeiro acesso do Gabriel (sem senha no código)

Com `DATABASE_URL` e `APP_URL` apontando para produção:

```bash
npm run admin -- create-org --org "Gabriel Airton Hardware" --email <e-mail do Gabriel> --name "Gabriel Airton"
```

1. O comando imprime um link `…/definir-senha/<token>`, de uso único e válido por 72 horas.
2. Envie esse link ao Gabriel por um canal privado. Ele define a própria senha e cai no assistente de início:
   - dados da empresa;
   - locais e contas;
   - primeiros itens;
   - importação de planilha, se tiver.
3. Ele convida a equipe em *Configurações › Equipe*. O convite gera um link para enviar pelo WhatsApp; o sistema não envia e-mails.

**Outros comandos:**

- **Administrador da plataforma:** `npm run admin -- platform-admin --email <seu e-mail> --name "Seu Nome"`. Imprime o link de senha se for conta nova. O console fica em `/plataforma`.
- **Senha esquecida:** `npm run admin -- reset-link --email <e-mail>`, válido por 24 horas. O dono também gera esse link pela tela de equipe para os membros.
- **Listar empresas:** `npm run admin -- list-orgs`.
- **Demonstração** (empresa separada e marcada, nunca misturada com a real): `npm run seed:demo -- --owner <e-mail>`.

## 5. Rotina e suporte

- **Diário:** backup (ver BACKUP.md).
- **Semanal:** abrir *Relatórios › Verificação*. Qualquer divergência aponta o registro exato.
- **Problemas comuns:**
  - **Item preso em "Reservado":** abra o item; a origem da reserva tem link. Reservas de orçamento vencido são liberadas sozinhas.
  - **Usuário bloqueado por tentativas:** espere 15 minutos ou gere um link de redefinição.
  - **"Outra operação alterou estes dados":** é proteção contra edição simultânea. Recarregue e repita.
- **Logs:** painel da Vercel (funções) e do Railway (banco). Argumentos de Server Actions não são registrados, de propósito, para não vazar senhas.

## 6. Desenvolvimento

- **Rodar localmente:** README.md.
- **Testes:** `npm test` (domínio, Postgres real) e `npm run test:e2e` (navegador, build de produção). Os dois usam o banco `aionix_gear_test`.
- **Mudança de schema:**
  1. edite `prisma/schema.prisma`;
  2. `npm run db:migrate -- --name <nome>`;
  3. confira o SQL gerado. CHECKs e índices parciais são escritos à mão na migração.
- **Regra de ouro:**
  - escrita de negócio só em `src/server/domain/*`, dentro de `withTx`, com `audit()`;
  - nada de apagar movimentos financeiros, eventos ou custos: estorne.
