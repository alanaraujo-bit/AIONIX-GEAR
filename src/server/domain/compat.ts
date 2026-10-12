/**
 * Verificações de compatibilidade de hardware. São AVISOS baseados nas
 * especificações cadastradas — nunca garantia. Especificação ausente vira aviso
 * "não verificável", não aprovação silenciosa.
 */

export type PartForCompat = {
  code: string;
  title: string;
  kind: string; // CategoryKind
  quantity: number;
  specs: Record<string, unknown>;
};

export type CompatFinding = { level: "ok" | "warn" | "error" | "unknown"; text: string };

const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v).trim().toUpperCase());
const num = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export const SPEC_FIELDS: Record<string, { key: string; label: string; placeholder?: string; type?: "text" | "number" }[]> = {
  CPU: [
    { key: "socket", label: "Soquete", placeholder: "AM4, LGA1700…" },
    { key: "tdp", label: "TDP (W)", type: "number" },
    { key: "cores", label: "Núcleos", type: "number" },
    { key: "igpu", label: "Vídeo integrado (sim/não)" },
  ],
  MOTHERBOARD: [
    { key: "socket", label: "Soquete", placeholder: "AM4, LGA1700…" },
    { key: "memoryType", label: "Tipo de memória", placeholder: "DDR4, DDR5" },
    { key: "memorySlots", label: "Slots de memória", type: "number" },
    { key: "maxMemoryGb", label: "Memória máxima (GB)", type: "number" },
    { key: "formFactor", label: "Formato", placeholder: "ATX, mATX, ITX" },
    { key: "m2Slots", label: "Slots M.2", type: "number" },
    { key: "chipset", label: "Chipset", placeholder: "B550, B660…" },
  ],
  RAM: [
    { key: "memoryType", label: "Tipo", placeholder: "DDR4, DDR5" },
    { key: "capacityGb", label: "Capacidade (GB)", type: "number" },
    { key: "speedMhz", label: "Frequência (MHz)", type: "number" },
  ],
  GPU: [
    { key: "vramGb", label: "VRAM (GB)", type: "number" },
    { key: "tdp", label: "Consumo (W)", type: "number" },
    { key: "lengthMm", label: "Comprimento (mm)", type: "number" },
    { key: "recommendedPsuW", label: "Fonte recomendada (W)", type: "number" },
  ],
  PSU: [
    { key: "wattage", label: "Potência (W)", type: "number" },
    { key: "certification", label: "Certificação", placeholder: "80 Plus Bronze…" },
    { key: "modular", label: "Modular (sim/não)" },
  ],
  CASE: [
    { key: "formFactor", label: "Placas-mãe suportadas", placeholder: "ATX, mATX, ITX" },
    { key: "maxGpuLengthMm", label: "GPU máx. (mm)", type: "number" },
  ],
  STORAGE: [
    { key: "interface", label: "Interface", placeholder: "NVMe, SATA" },
    { key: "capacityGb", label: "Capacidade (GB)", type: "number" },
    { key: "formFactor", label: "Formato", placeholder: "M.2, 2.5\", 3.5\"" },
  ],
  COOLER: [
    { key: "sockets", label: "Soquetes suportados", placeholder: "AM4, LGA1700" },
    { key: "tdpRating", label: "TDP suportado (W)", type: "number" },
  ],
  MONITOR: [
    { key: "sizeIn", label: "Tamanho (pol.)", type: "number" },
    { key: "resolution", label: "Resolução", placeholder: "1920x1080" },
    { key: "refreshHz", label: "Taxa (Hz)", type: "number" },
  ],
  NOTEBOOK: [
    { key: "cpu", label: "Processador" },
    { key: "ramGb", label: "RAM (GB)", type: "number" },
    { key: "storage", label: "Armazenamento" },
    { key: "gpu", label: "Vídeo" },
  ],
  PC: [
    { key: "cpu", label: "Processador" },
    { key: "gpu", label: "Placa de vídeo" },
    { key: "ram", label: "Memória" },
    { key: "storage", label: "Armazenamento" },
    { key: "psu", label: "Fonte" },
  ],
};

const FORM_RANK: Record<string, number> = { ITX: 1, "MINI-ITX": 1, MATX: 2, "MICRO-ATX": 2, "M-ATX": 2, ATX: 3, EATX: 4, "E-ATX": 4 };

export function checkCompatibility(parts: PartForCompat[]): CompatFinding[] {
  const out: CompatFinding[] = [];
  const by = (k: string) => parts.filter((p) => p.kind === k);
  const cpus = by("CPU");
  const mbs = by("MOTHERBOARD");
  const rams = by("RAM");
  const gpus = by("GPU");
  const psus = by("PSU");
  const cases = by("CASE");
  const coolers = by("COOLER");
  const storages = by("STORAGE");

  if (cpus.length === 0) out.push({ level: "warn", text: "Nenhum processador na montagem." });
  if (mbs.length === 0) out.push({ level: "warn", text: "Nenhuma placa-mãe na montagem." });
  if (rams.length === 0) out.push({ level: "warn", text: "Nenhuma memória RAM na montagem." });
  if (psus.length === 0) out.push({ level: "warn", text: "Nenhuma fonte na montagem." });
  if (storages.length === 0) out.push({ level: "warn", text: "Nenhum armazenamento na montagem." });
  if (cpus.length > 1) out.push({ level: "error", text: "Há mais de um processador." });
  if (mbs.length > 1) out.push({ level: "error", text: "Há mais de uma placa-mãe." });
  if (psus.length > 1) out.push({ level: "warn", text: "Há mais de uma fonte." });

  const cpu = cpus[0];
  const mb = mbs[0];
  if (cpu && mb) {
    const a = str(cpu.specs.socket);
    const b = str(mb.specs.socket);
    if (!a || !b) out.push({ level: "unknown", text: "Soquete do processador ou da placa-mãe não informado — não foi possível verificar." });
    else if (a !== b) out.push({ level: "error", text: `Soquete incompatível: processador ${a} × placa-mãe ${b}.` });
    else out.push({ level: "ok", text: `Soquete compatível (${a}).` });
  }
  if (mb && rams.length) {
    const mt = str(mb.specs.memoryType);
    const types = [...new Set(rams.map((r) => str(r.specs.memoryType)))];
    if (!mt || types.includes(null)) out.push({ level: "unknown", text: "Tipo de memória não informado em algum componente — não verificável." });
    else if (types.some((t) => t !== mt)) out.push({ level: "error", text: `Memória incompatível: placa-mãe aceita ${mt}, montagem tem ${types.join(", ")}.` });
    else out.push({ level: "ok", text: `Memória ${mt} compatível com a placa-mãe.` });
    const sticks = rams.reduce((a, r) => a + r.quantity, 0);
    const slots = num(mb.specs.memorySlots);
    if (slots !== null && sticks > slots) out.push({ level: "error", text: `${sticks} pentes de memória para ${slots} slots.` });
    const caps = rams.map((r) => num(r.specs.capacityGb));
    const total = caps.every((c) => c !== null) ? rams.reduce((a, r, i) => a + (caps[i] ?? 0) * r.quantity, 0) : null;
    const max = num(mb.specs.maxMemoryGb);
    if (total !== null && max !== null && total > max) out.push({ level: "error", text: `${total} GB de memória excede o máximo da placa (${max} GB).` });
    const speeds = [...new Set(rams.map((r) => num(r.specs.speedMhz)).filter((x) => x !== null))];
    if (speeds.length > 1) out.push({ level: "warn", text: `Pentes com frequências diferentes (${speeds.join(" / ")} MHz): todos vão operar na menor.` });
    if (sticks === 1) out.push({ level: "warn", text: "Um único pente de memória: sem dual channel, desempenho menor (principalmente com vídeo integrado)." });
  }
  if (cpu && gpus.length === 0) {
    const igpu = str(cpu.specs.igpu);
    if (igpu && ["NAO", "NÃO", "N", "NO", "FALSE"].includes(igpu)) {
      out.push({ level: "error", text: "Processador sem vídeo integrado e nenhuma placa de vídeo: o PC não dará imagem." });
    } else if (!igpu) {
      out.push({ level: "unknown", text: "Sem placa de vídeo: confirme se o processador tem vídeo integrado." });
    }
  }
  // Consumo estimado
  const cpuW = cpu ? num(cpu.specs.tdp) : null;
  const gpuW = gpus.reduce<number | null>((a, g) => (a === null ? null : num(g.specs.tdp) === null ? null : a + (num(g.specs.tdp) ?? 0) * g.quantity), 0);
  const psu = psus[0];
  if (psu) {
    const w = num(psu.specs.wattage);
    if (w === null) out.push({ level: "unknown", text: "Potência da fonte não informada — não verificável." });
    else if (cpuW === null || gpuW === null) out.push({ level: "unknown", text: "Consumo de CPU/GPU não informado — confira a fonte manualmente." });
    else {
      const est = cpuW + gpuW + 80;
      const recommended = Math.ceil((est * 1.35) / 50) * 50;
      const gpuRec = Math.max(0, ...gpus.map((g) => num(g.specs.recommendedPsuW) ?? 0));
      if (w < est) out.push({ level: "error", text: `Fonte de ${w} W abaixo do consumo estimado (~${est} W).` });
      else if (w < Math.max(recommended, gpuRec)) out.push({ level: "warn", text: `Fonte de ${w} W com pouca folga: recomendado ~${Math.max(recommended, gpuRec)} W para ~${est} W de consumo.` });
      else out.push({ level: "ok", text: `Fonte de ${w} W adequada para ~${est} W estimados.` });
    }
  }
  const pcCase = cases[0];
  if (pcCase && mb) {
    const mf = str(mb.specs.formFactor);
    const cf = str(pcCase.specs.formFactor);
    if (!mf || !cf) out.push({ level: "unknown", text: "Formato da placa-mãe ou do gabinete não informado — não verificável." });
    else {
      const supported = cf.split(/[,/ ]+/).map((s) => FORM_RANK[s] ?? 0);
      const need = FORM_RANK[mf] ?? 0;
      if (need && supported.length && Math.max(...supported) < need) out.push({ level: "error", text: `Placa-mãe ${mf} não cabe no gabinete (${cf}).` });
      else out.push({ level: "ok", text: `Placa-mãe ${mf} compatível com o gabinete.` });
    }
  }
  if (pcCase && gpus.length) {
    const max = num(pcCase.specs.maxGpuLengthMm);
    for (const g of gpus) {
      const len = num(g.specs.lengthMm);
      if (max !== null && len !== null && len > max) out.push({ level: "error", text: `${g.title} (${len} mm) não cabe no gabinete (máx. ${max} mm).` });
    }
  }
  if (mb) {
    const m2 = storages.filter((s) => (str(s.specs.interface) ?? "").includes("NVME") || (str(s.specs.formFactor) ?? "").includes("M.2")).reduce((a, s) => a + s.quantity, 0);
    const slots = num(mb.specs.m2Slots);
    if (slots !== null && m2 > slots) out.push({ level: "error", text: `${m2} SSDs M.2 para ${slots} slot(s) na placa-mãe.` });
  }
  if (cpu && coolers.length) {
    const sock = str(cpu.specs.socket);
    for (const c of coolers) {
      const supported = str(c.specs.sockets);
      if (sock && supported && !supported.split(/[,/ ]+/).includes(sock)) out.push({ level: "warn", text: `${c.title} pode não suportar o soquete ${sock}.` });
    }
  }
  return out;
}
