# Entrega — estado verificado (2026-10-12)

Resumo: o produto está **construído e testado localmente** contra PostgreSQL real e no build de produção. A **publicação ainda não foi feita**: o banco de produção no Railway está parado e não foi possível religá-lo daqui sem autorização (ver "Bloqueios").

## Evidências

Todos os comandos abaixo foram rodados nesta data, na máquina de desenvolvimento.

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos | `npm run typecheck` | sem erros |
| Lint | `npm run lint` | sem avisos |
| Domínio + segurança (Postgres real) | `npm test` | **24/24 passando** (2 arquivos) |
| Navegador no build de produção | `npm run test:e2e` | **9/9 passando** (desktop + Pixel 7) |
| Build de produção | `next build` (dentro do `test:e2e`) | concluído |

### Cenários obrigatórios (A–J), em `tests/scenarios.test.ts`

| | Cenário | O que o teste confere |
|---|---|---|
| A | GPU de pessoa física vendida | custo com frete; venda com taxa retida; lucro realizado; saldo de caixa |
| B | RAM com custos diferentes | custo por unidade; reserva tira da disponibilidade; venda certa |
| C | Montagem de PC | custo = peças + despesas; peças instaladas não duplicam estoque; venda rastreável; troca de peça com defeito |
| D | Catira com volta em dinheiro | custo transferido; nenhuma receita na troca; lucro só na revenda; volta acima do custo vira resultado; desfazer com estorno completo |
| E | Desmontagem | rateio por valor estimado com descarte como perda; PC montado aqui devolve o custo original |
| F | Venda parcelada | recebimento parcial; devolução abate o saldo; cancelamento devolve dinheiro, estorna receita e repõe estoque; orçamento ≠ venda |
| G | Inventário | lugar errado e item faltando são detectados e corrigidos com motivo; a trilha original é preservada |
| H | Segundo operador | convite; papel Vendas restrito; nenhuma visibilidade entre empresas |
| I | Planilha imperfeita | prévia com avisos; custo desconhecido nunca vira zero; importação reversível |
| J | Concorrência | duas vendas simultâneas da mesma unidade: só uma vence; duplo clique com a mesma chave gera uma única venda |

### Segurança, em `tests/security.test.ts`

- Isolamento de leitura entre empresas (consultas e anexos).
- Custos ocultos no servidor para Vendas/Estoque.
- Um PC vendido, entregue ou trocado leva os componentes junto.
- Datas no fuso America/Belem.
- Rateio de centavos exato.
- Totais acima de R$ 21 milhões sem estouro.

### E2E, em `tests/e2e/journeys.spec.ts`

- Login inválido não revela se o e-mail existe.
- Rota protegida leva ao login preservando o destino.
- Cadastro de GPU comprada com frete.
- Venda com taxa retida e recebimento parcial: lucro de R$ 562,00 e falta receber R$ 1.112,00, conferidos na tela.
- Relatório de lucro por item.
- Verificação de integridade "Tudo confere.".
- Vendedor sem custos nem financeiro.
- Empresa B não abre registro nem exportação da empresa A.
- Navegação e ações rápidas no celular.

Também foi feita QA visual manual (claro, escuro e celular) das telas principais, com os dados de demonstração (`npm run seed:demo`).

## O que está pronto

- **Painel:**
  - resultado do mês;
  - caixa, a receber e a pagar;
  - estoque a custo;
  - itens parados;
  - pendências;
  - gráfico de receita × lucro;
  - assistente de início.
- **Estoque:**
  - unidades e lotes, posse × situação, locais em árvore;
  - fotos, QR e etiquetas;
  - leitor de código pela câmera;
  - visões salvas, ficha com histórico completo, texto de anúncio;
  - baixas, ajustes, inventário físico;
  - importação CSV/XLSX reversível.
- **Compras:** rateio exato de desconto e extras; pagamento à vista e/ou parcelado; cancelamento seguro.
- **Vendas:**
  - orçamento com reserva e validade;
  - link público do orçamento;
  - recibo e orçamento imprimíveis;
  - parcelas, taxa retida, frete;
  - troca na venda, consignação;
  - entrega separada da venda;
  - devolução e cancelamento com estorno.
- **Catiras:** análise econômica antes de confirmar, contrapropostas, custo transferido, desfazer.
- **Montagens:**
  - reserva de peças;
  - avisos de compatibilidade;
  - despesas reais × mão de obra própria;
  - preço sugerido;
  - ficha imprimível;
  - desmontagem com rateio.
- **Contatos e negociações:** saldos por contato, duplicados, anonimização; funil de negociações.
- **Financeiro:** contas, saldos, receber/pagar, baixas, despesas, aportes/retiradas, transferências, conciliação.
- **Relatórios:**
  - DRE gerencial;
  - lucro por item/categoria/cliente/canal/montagem/catira/compra;
  - fluxo de caixa;
  - idade e giro do estoque;
  - verificação de integridade;
  - exportações CSV.
- **Inteligência:** 15 regras explicáveis com números e links. Nada de preço de mercado inventado.
- **Busca e atalhos:** busca universal (Ctrl+K) e ações rápidas.
- **Interface:** tema claro/escuro, PWA instalável com página offline.
- **Configurações:** empresa, categorias, equipe (convites por link, papéis, link de senha), dados/backup, auditoria, conta.
- **Plataforma:** console do operador com empresas, membros, uso e suspensão, sem acesso a dados de negócio.
- **Administração por linha de comando:** `scripts/admin.ts`, para criar empresa e gerar links de senha sem senha no código.

## Limitações conhecidas (honestas)

- **Sem envio de e-mail.** Convites e links de senha são gerados na tela ou no terminal e enviados manualmente (WhatsApp, etc.). Integrar um provedor de e-mail exige uma conta paga ou autorização sua.
- **Sem documentos fiscais.** Os relatórios são gerenciais; NF-e/NFC-e e apuração de impostos não estão integrados.
- **Sem cobrança da assinatura.** O campo "plano" existe, mas nenhuma cobrança está integrada.
- **Sem cotações de mercado externas.** O valor de mercado é sempre informado pelo usuário.
- **Offline só para consulta.** Páginas já abertas ficam disponíveis. Registrar operações exige conexão, e o sistema avisa e bloqueia em vez de fingir que salvou.
- **Arquivos:** por padrão ficam no Postgres, até 4 MB por arquivo, com compressão de fotos no navegador. O Vercel Blob privado é opcional, via `BLOB_READ_WRITE_TOKEN`.
- **Latência:** depende da distância entre a região das funções na Vercel e a do Postgres no Railway. Mantenha as duas na mesma região.

## Bloqueios (ação necessária sua)

1. **Postgres de produção parado.** O projeto Railway `aionix-gear`, serviço `Postgres`, tem o último deploy com status **REMOVED** (conferido hoje). Religá-lo é uma ação em produção que não executei sem a sua autorização. Para destravar, clique em *Deploy* no serviço pelo painel do Railway ou rode:
   `! railway redeploy -p b802d71f-c373-4f10-91dc-9be3f9459c59 -e production -s Postgres --from-source -y`
2. **Autorização para publicar.** Com o banco ativo, os próximos passos são:
   - (a) aplicar as migrações nesse banco: `prisma migrate deploy`;
   - (b) criar o projeto `aionix-gear` na Vercel (time `aionixdev`) com `DATABASE_URL`, `DATABASE_POOL_MAX` e `APP_URL`;
   - (c) publicar;
   - (d) gerar o link de primeiro acesso do Gabriel.
   Tudo isso está descrito em [OPERACAO.md](OPERACAO.md). Nenhum desses passos usa serviço pago novo.
