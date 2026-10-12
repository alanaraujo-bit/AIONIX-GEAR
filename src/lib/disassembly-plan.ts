import { allocate } from "./money";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/**
 * Desmonta um PC (montado aqui ou recebido pronto). O custo do PC é redistribuído
 * entre os componentes que voltam ao estoque — com prévia transparente:
 *  - ORIGINAL_COST: cada peça instalada recupera seu custo original; a diferença
 *    (despesas de montagem) é rateada ou lançada como perda, à escolha.
 *  - BY_VALUE: o custo é rateado pelo valor estimado de cada componente.
 * Componentes descartados (SCRAP) levam sua parcela para perda.
 */
export function planDisassembly(
  pcCostCents: number,
  method: "ORIGINAL_COST" | "BY_VALUE",
  remainder: "ALLOCATE" | "WRITE_OFF",
  components: { key: string; originalCostCents: number | null; estimatedValueCents: number | null; scrap: boolean }[],
) {
  let alloc: number[];
  let writeOff = 0;
  if (method === "ORIGINAL_COST") {
    assert(components.every((c) => c.originalCostCents !== null), "Há peças sem custo original; use o rateio por valor estimado.");
    const originals = components.map((c) => c.originalCostCents!);
    const sumOrig = originals.reduce((a, b) => a + b, 0);
    const diff = pcCostCents - sumOrig;
    if (diff >= 0 && remainder === "WRITE_OFF") {
      alloc = originals;
      writeOff = diff;
    } else {
      // Rateia a diferença (positiva ou negativa) proporcionalmente ao custo original.
      const extra = allocate(diff, originals);
      alloc = originals.map((o, i) => o + extra[i]);
      if (alloc.some((a) => a < 0)) alloc = allocate(pcCostCents, originals);
    }
  } else {
    assert(components.every((c) => c.estimatedValueCents !== null), "Informe o valor estimado de cada componente para ratear o custo.");
    alloc = allocate(pcCostCents, components.map((c) => c.estimatedValueCents!));
  }
  const rows = components.map((c, i) => ({ key: c.key, allocatedCents: alloc[i], scrap: c.scrap }));
  writeOff += rows.filter((r) => r.scrap).reduce((a, r) => a + r.allocatedCents, 0);
  return { rows, writeOffCents: writeOff };
}
