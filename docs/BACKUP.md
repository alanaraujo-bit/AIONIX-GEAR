# Backup e restauração

Há duas camadas de cópia, com finalidades diferentes.

| Camada | O que contém | Quem faz | Serve para |
|---|---|---|---|
| **Banco inteiro** (`pg_dump`) | Todas as empresas, usuários, histórico, fotos e documentos guardados no banco | Operador da plataforma | Recuperar de falha, erro grave ou migração ruim |
| **Exportação da empresa** (JSON/CSV) | Os dados de **uma** empresa, sem fotos | O dono, em *Configurações › Dados e backup* | Portabilidade, auditoria, cópia pessoal do cliente |

> Fotos e documentos ficam no Postgres (tabela `AttachmentData`) quando `BLOB_READ_WRITE_TOKEN` está vazio, e entram no `pg_dump`. Com o Vercel Blob configurado, os arquivos ficam no store privado do Blob e precisam de cópia própria (ver "Arquivos no Blob").

## 1. Cópia do banco inteiro

Pré-requisito: cliente PostgreSQL (`pg_dump`, `pg_restore`, `psql`) da **mesma versão principal do servidor ou mais nova**. Confira a do servidor com `psql "$DATABASE_URL" -c 'show server_version'`. A URL fica em uma variável de ambiente e **nunca** vai para arquivo versionado.

```bash
# Formato custom (comprimido, permite restauração seletiva)
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --file "aionix-gear-$(date +%Y%m%d-%H%M).dump"

# Conferir se o arquivo é legível
pg_restore --list aionix-gear-AAAAMMDD-HHMM.dump | head
```

**Rotina recomendada:**

- Diária, mantendo 7 diárias, 4 semanais e 12 mensais.
- Guarde as cópias fora do Railway (por exemplo, um disco ou nuvem do operador).
- O Railway tem backups de volume próprios. Confira se estão disponíveis no plano em uso, mas não dependa só deles.

**Antes de qualquer migração em produção:** faça um `pg_dump` manual.

## 2. Restauração

### Para um banco novo (recomendado: nunca restaure por cima do banco em uso sem antes copiá-lo)

```bash
# Crie o banco vazio (ou crie um Postgres novo no Railway e use a URL dele)
psql "$ADMIN_URL" -c 'CREATE DATABASE aionix_restore'     # ADMIN_URL = URL do servidor apontando para o banco "postgres"
NOVO_BANCO_URL="postgresql://USUARIO:SENHA@HOST:PORTA/aionix_restore"
pg_restore --dbname "$NOVO_BANCO_URL" --no-owner --no-privileges --exit-on-error aionix-gear-AAAAMMDD-HHMM.dump
DATABASE_URL="$NOVO_BANCO_URL" npx prisma migrate status   # deve dizer "Database schema is up to date"
```

Depois:

1. Abra o sistema apontando para o banco restaurado (ambiente de teste ou local).
2. Entre e confira, em *Relatórios › Verificação*, que aparece **"Tudo confere."**.
3. Só então troque a `DATABASE_URL` de produção na Vercel e faça redeploy.

### Restauração de uma empresa só

O `pg_dump` contém todas as empresas. Para recuperar uma única empresa sem afetar as outras:

1. Restaure o dump em um banco temporário.
2. Exporte dali o JSON da empresa (`/api/export/backup`, entrando como dono no banco temporário).
3. Corrija manualmente os registros afetados na produção.

Não há importação automática do JSON de volta. Isso é deliberado, para não sobrescrever registros vivos.

## 3. Exportação pelo dono (dentro do sistema)

Em *Configurações › Dados e backup*:

- **Backup completo (JSON):** todos os registros da empresa, com versão do formato e data, incluindo:
  - itens, eventos e custos;
  - compras, vendas, catiras e montagens;
  - contatos, títulos, baixas, movimentos de caixa e lançamentos de resultado;
  - inventários, importações, notas e a lista de anexos (sem os arquivos).

  A auditoria sai em planilha separada (CSV *auditoria*).
- **Planilhas CSV** (separador `;`, UTF-8 com BOM, abre direto no Excel): estoque, movimentos, vendas, compras, resultado, contas a receber/pagar, contatos e auditoria.

Só **Proprietário** e **Administrador** baixam o backup e as planilhas. Cada download fica registrado na auditoria.

## 4. Arquivos no Blob (se `BLOB_READ_WRITE_TOKEN` estiver configurado)

- Os metadados (`Attachment`) estão no banco.
- Os bytes estão no store privado do Vercel Blob. Para copiá-los, liste e baixe com o SDK `@vercel/blob` (`list` + `get`) usando o token do store, em um script do operador.
- Cada arquivo fica em `<orgId>/<tipo de registro>/<aleatório>-<nome>`.

## 5. Teste de restauração

Uma vez por trimestre, faça o ciclo completo:

1. Restaure o último dump em um banco temporário.
2. Rode `DATABASE_URL=… npx prisma migrate status`.
3. Abra o sistema e confira em *Verificação*.
4. Apague o banco temporário.

Registre a data do teste.
