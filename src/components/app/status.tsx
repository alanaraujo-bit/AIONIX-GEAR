import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE, COST_STATUS_LABEL, type ItemStatusKey } from "@/lib/labels";

export function ItemStatusBadge({ status }: { status: string }) {
  const s = status as ItemStatusKey;
  return (
    <Badge tone={STATUS_TONE[s] ?? "neutral"} dot>
      {STATUS_LABEL[s] ?? status}
    </Badge>
  );
}

export function CostStatusBadge({ status }: { status?: string | null }) {
  if (!status || status === "KNOWN") return null;
  return (
    <Badge tone={status === "UNKNOWN" ? "warning" : "neutral"} title={status === "UNKNOWN" ? "Sem custo de aquisição registrado — não entra como zero nos cálculos" : "Custo informado como estimativa"}>
      {COST_STATUS_LABEL[status]}
    </Badge>
  );
}
