# Regras de negócio e cálculos

Este documento explica como o AIONIX GEAR calcula cada número. Todos os relatórios são **gerenciais**: não substituem contabilidade, apuração de impostos nem documentos fiscais.

## 1. Princípios

1. **Dinheiro em centavos inteiros.** Nenhum cálculo usa ponto flutuante. Limite por campo: R$ 9.999.999,99.
2. **Custo desconhecido não é zero.** Fica `NULL` com marcação `UNKNOWN`. Ele não entra no valor do estoque, e as vendas desses itens aparecem sinalizadas nos relatórios ("lucro superestimado").
3. **O histórico não se apaga.** Movimentos de caixa, lançamentos de resultado, baixas de títulos, eventos de item e componentes de custo são *append-only*. Cancelamentos, devoluções e correções viram lançamentos de estorno, com motivo, data e autor.
4. **Uma coisa por vez.** Orçamento ≠ venda (receita) ≠ recebimento (caixa) ≠ entrega (saída física).
5. **Estimativa não é dinheiro.** O "valor de mercado estimado" é informado pelo usuário, aparece separado e nunca entra no lucro nem no caixa. O sistema não busca nem inventa preços de mercado.
6. **Toda operação é da empresa ativa.** O `orgId` vem da sessão no servidor, nunca do navegador.

## 2. Itens e estoque

- **Unidade (UNIT):** cada peça física tem código próprio (GX-0001), série, estado, local, custo e histórico. A quantidade é sempre 1.
- **Lote (LOT):** insumos controlados por quantidade (pasta térmica, cabos). O custo unitário do lote é `custo total ÷ quantidade`. Custos acrescentados depois são distribuídos pelo saldo restante.
- **Posse** é separada da **situação**. Posse pode ser *Próprio*, *Consignado de terceiro*, *Cliente* ou *Terceiro sob guarda*. Só itens próprios entram no "estoque a custo".
- **Situações:**
  - Disponível
  - Reservado (orçamento)
  - Aguardando inspeção
  - Com defeito
  - Em montagem
  - Em negociação (catira)
  - Consignado (com terceiro)
  - Instalado em PC
  - Vendido (a entregar)
  - Entregue
  - Devolvido
  - Trocado (catira)
  - Desmontado
  - Baixado
  - Anulado (origem estornada)
- **Estoque físico** reúne o que está sob sua guarda: disponível, reservado, inspeção, defeito, em montagem, em negociação, vendido ainda não entregue e devolvido. Componentes instalados contam dentro do PC.
- **Disponível** é só o que pode ser vendido, montado ou trocado agora.
- **Exclusividade:** uma unidade só pode estar em uma operação por vez (venda, reserva, montagem ou catira). Isso é garantido por uma atualização condicional no banco (`UPDATE … WHERE status = 'AVAILABLE'`). Se duas operações tentarem usar a mesma unidade ao mesmo tempo, só uma vence; a outra recebe "Item indisponível". Um índice único impede a mesma unidade ativa em duas montagens.

## 3. Compras e custo de aquisição

- O custo de cada unidade = preço pago − parte do desconto + parte dos custos extras (frete, taxa, comissão, reparo, teste).
- **Rateio:** desconto e extras são distribuídos entre as linhas na proporção do valor de cada linha (quantidade × preço). Dentro da linha, a divisão entre as unidades é igual.
- **Centavos exatos:** o rateio usa o método do maior resto, de modo que a soma dos custos das unidades é sempre igual ao total da compra.
- O pagamento pode ser feito agora (em uma ou mais contas) e/ou em parcelas a pagar.
- **Cancelar compra confirmada** só é permitido se nenhuma peça dela foi usada. As peças viram *Anulado* e os pagamentos são estornados (registrados como devolvidos pelo fornecedor).
- **Estoque inicial:** cadastro com custo *conhecido*, *estimado* ou *desconhecido*. Não movimenta caixa nem resultado.
- **Custos posteriores** (ex.: reparo) somam ao custo do item. Com pagamento, geram saída de caixa ou conta a pagar. "Correção" registra um custo já pago fora do sistema, sem movimentar caixa.

## 4. Vendas

- **Receita** é reconhecida quando a venda é *fechada*, por linha, já com o desconto da venda rateado pelo valor das linhas. O frete cobrado do cliente também é receita.
- **Custo das mercadorias vendidas (CMV)** = custo unitário × quantidade, congelado na linha no momento da venda.
- **Despesas de venda:** taxas de cartão/plataforma e frete pago pelo vendedor.
  - **Taxa retida pela plataforma:** registrada como baixa "taxa retida" no título a receber. O caixa recebe o valor líquido.
  - **Taxa paga à parte:** vira conta a pagar.
  - **Frete pago pelo vendedor:** sai do caixa, ou fica a pagar.
- **Recebimento:** pagamentos agora (várias formas e contas) e o restante em parcelas, com vencimento. Cada pagamento é uma baixa no título e um movimento na conta.
- **Troca na venda:** o item recebido entra no estoque com custo = valor combinado. Esse valor quita parte da venda (baixa do tipo "itens na troca"), sem dinheiro.
- **Consignação:** ao vender um item consignado, o custo é o valor de repasse, e nasce uma conta a pagar ao dono.
- **Entrega** é um passo separado: o item passa de *Vendido* para *Entregue* e sai do estoque físico. Se for um PC, os componentes saem junto.
- **Cancelar uma venda fechada:**
  - receita e CMV são estornados;
  - os itens voltam ao estoque pelo custo original;
  - o dinheiro recebido é registrado como devolvido;
  - parcelas em aberto são canceladas;
  - taxas e frete já incorridos continuam como despesa.
- **Devolução parcial ou total:**
  - estorna a receita pelo valor reembolsado e o CMV dos itens devolvidos;
  - o reembolso abate primeiro o saldo que o cliente ainda deve e só o restante sai do caixa (ou fica a pagar).
- **Orçamento** não gera receita nem tira itens do estoque. Opcionalmente reserva os itens até a validade; vencida a validade, a reserva é liberada automaticamente.

## 5. Catiras (trocas)

**Regra de custo — custo transferido (conservadora):**

```
custo dos itens recebidos = custo histórico do que sai + volta paga + taxas − volta recebida
```

- O custo é rateado entre os itens recebidos pelo **valor combinado** de cada um (ou pela estimativa, na falta dele).
- A troca de mercadoria por mercadoria **não gera receita nem lucro na hora**. O lucro aparece quando os itens recebidos forem vendidos. Assim não há receita fantasma nem duplicidade.
- **Exceção:** se a volta recebida for maior que o custo do que sai, o excedente é **resultado realizado** na data da catira ("Outras receitas") e os itens recebidos entram com custo zero.
- Se algum item que sai tiver custo desconhecido, os recebidos herdam a marcação *desconhecido*.

**Análise mostrada antes de confirmar:**

| Linha | Cálculo |
|---|---|
| Efeito no caixa | volta recebida − volta paga − taxas |
| Custo que os itens recebidos carregarão | regra acima |
| Resultado realizado agora | normalmente R$ 0,00 (ver exceção) |
| Ganho pelos valores combinados (não realizado) | valor combinado recebido + volta recebida − valor combinado entregue − volta paga − taxas |
| Potencial de revenda (não realizado) | valor de mercado estimado dos itens recebidos − custo que eles carregarão |

A análise também mostra alertas: custo desconhecido, estimativa ausente, entregar mais do que recebe, item avaliado abaixo do custo, caixa insuficiente, item "para peças".

**Ciclo de vida:**

- **Rascunho:** não bloqueia nada.
- **Em negociação:** bloqueia os seus itens.
- **Contrapropostas:** cada versão é guardada como retrato.
- **Confirmação:**
  - os itens que saem viram *Trocado*;
  - os recebidos entram em *Aguardando inspeção*;
  - a análise fica congelada no registro.
- **Desfazer** só é possível se os itens recebidos não foram usados. Eles são anulados, os seus voltam com o custo original e o dinheiro é estornado.

## 6. Montagens

- **Reservar uma peça** para a montagem a tira do estoque disponível (*Em montagem*). Lotes reservam quantidade.
- **Despesas da montagem** (mão de obra de terceiro, insumos comprados, testes) são reais: saem do caixa ou ficam a pagar, e entram no custo do PC.
- **Mão de obra própria** é só um "valor atribuído" usado no preço sugerido. Não é despesa nem custo contábil, porque nenhum dinheiro saiu.
- **Conclusão:**
  - cria **um** item vendável (o PC) com custo = peças próprias + despesas;
  - as peças passam a *Instalado em PC*, vinculadas a ele. Não contam mais como estoque avulso, então não há duplicidade;
  - os lotes são consumidos.
- **Peças de cliente** (encomenda) entram com custo zero para você.
- **Cancelar uma montagem não concluída** libera as peças. Despesas já feitas viram perda.
- **Compatibilidade** são avisos baseados nas especificações cadastradas: soquete, tipo e quantidade de memória, consumo × fonte, formato × gabinete, comprimento da GPU, slots M.2, vídeo integrado. Especificação ausente aparece como "não verificável", nunca como aprovada.
- **Preço sugerido** = (custo + mão de obra própria) ÷ (1 − margem-alvo), arredondado para cima em R$ 10.

## 7. Desmontagem

- O custo do PC é redistribuído entre os componentes que voltam ao estoque. Nenhum valor some sem registro.
- **Custo original** (PCs montados aqui): cada peça recupera o seu custo original. A diferença (despesas da montagem, insumos) é rateada nas peças ou lançada como perda, à escolha.
- **Por valor estimado** (PCs recebidos prontos): o custo é rateado pelo valor estimado de cada componente informado.
- Componentes descartados levam a sua parte para "perda na desmontagem".
- O PC passa a *Desmontado*. Cada componente guarda a ligação com a desmontagem e com o PC de origem.

## 8. Baixas, ajustes e inventário

- **Baixa de item próprio** (perda, dano, uso próprio, furto…) lança como perda o **custo** do item, nunca o valor de venda.
- **Ajuste de quantidade de lote:** a falta é perda e a sobra é ganho, ambas ao custo unitário atual.
- **Inventário físico:**
  - lista o que deveria estar no local (incluindo os sublocais);
  - registra o que foi encontrado por código, QR ou série;
  - aponta *lugar errado*, *faltando*, *quantidade diferente* e *inesperado*;
  - no encerramento, cada correção (mover, ajustar, dar baixa, manter) gera evento com referência ao inventário e motivo. O local original fica no histórico.

## 9. Financeiro

- **Caixa:** saldo de cada conta = Σ entradas − Σ saídas. Saldo inicial e ajustes também são movimentos.
- **Títulos:** contas a receber e a pagar, com vencimento e parcelas. Uma baixa parcial ou total registra o pagamento e o movimento de caixa correspondente.
  - Uma baixa nunca pode passar do saldo do título, nem com duas baixas ao mesmo tempo.
  - Cancelar o saldo em aberto preserva o que já foi pago.
- **Aporte e retirada do dono** mexem só no caixa, não no resultado.
- **Transferência entre contas** não muda o total.
- **Conciliação:** a diferença entre o saldo do sistema e o real vira um movimento de ajuste com motivo, lançado como outra receita ou outra despesa.

## 10. Resultado (DRE gerencial)

Tudo vem do livro de resultado (`ResultEntry`), por competência (data do fato):

```
Receita de vendas
(−) Custo das mercadorias vendidas
= Lucro bruto
(−) Despesas de venda (taxas, frete pago)
= Margem de contribuição
(−) Despesas operacionais (aluguel, internet, anúncios…)
(+/−) Outras receitas e perdas (ganho em dinheiro de catira, baixas, ajustes, desmontagem)
= Resultado líquido
```

- **Lucro real do item / da venda:** receita − CMV − despesas da venda rateadas pela receita de cada linha.
- **Lucro por dimensão:** por item, categoria, cliente, canal, compra de origem, catira de origem e montagem.
- **Caixa × lucro:** relatórios separados. Comprar estoque gasta caixa sem gerar prejuízo, e vender a prazo gera lucro antes do dinheiro entrar.

## 11. Verificações independentes

A aba **Relatórios › Verificação** recalcula a partir dos registros de origem e compara:

1. Custo de cada unidade = soma do seu histórico de custos.
2. Valor baixado em cada título = soma das baixas.
3. Todo pagamento tem o movimento de caixa de mesmo valor.
4. Reservados, em montagem e em negociação têm vínculo; instalados têm o PC.
5. Nenhuma unidade está em duas vendas ativas.
6. Todo estorno espelha exatamente o lançamento original.

## 12. Inteligência

Cada sugestão é uma regra simples sobre os registros reais, com os números à vista e um link para conferir:

- capital parado;
- preço abaixo do custo ou margem fraca;
- itens sem preço;
- preço distante da sua estimativa de mercado;
- vendas com prejuízo;
- desconto médio sobre o preço pedido;
- categorias mais e menos lucrativas (com tempo médio de venda);
- concentração do estoque;
- liquidez (contas dos próximos 30 dias × caixa);
- recebíveis atrasados;
- despesas possivelmente esquecidas;
- custos desconhecidos;
- garantias vencendo;
- reservas paradas;
- catiras que destroem valor;
- itens de catira encalhados.
