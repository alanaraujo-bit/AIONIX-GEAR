"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, MoreHorizontal, Receipt, RefreshCw, Coins, Pencil, QrCode, Megaphone, ArrowLeftRight, Scissors, Trash2, Calculator, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, SegmentedControl } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Callout } from "@/components/ui/layout";
import { ContactPicker, type ContactOption } from "@/components/app/pickers";
import { useAction } from "@/components/ui/use-action";
import { STATUS_LABEL, METHOD_LABEL, type ItemStatusKey } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { MoveSheet } from "../item-table";
import { changeStatusAction, addCostAction, defineCostAction, disposeAction, adjustLotAction } from "../actions";

const MANUAL: Partial<Record<string, ItemStatusKey[]>> = {
  AVAILABLE: ["INSPECTION", "DEFECTIVE", "CONSIGNED_OUT"],
  INSPECTION: ["AVAILABLE", "DEFECTIVE"],
  DEFECTIVE: ["AVAILABLE", "INSPECTION"],
  RETURNED: ["AVAILABLE", "INSPECTION", "DEFECTIVE"],
  CONSIGNED_OUT: ["AVAILABLE"],
};

const DISPOSAL: Record<string, string> = {
  LOSS: "Perda / extravio",
  DAMAGE: "Dano irrecuperável",
  SCRAP: "Descarte / sucata",
  OWN_USE: "Uso próprio",
  DONATION: "Doação",
  THEFT: "Furto / roubo",
  RETURN_SUPPLIER: "Devolvido ao fornecedor sem reembolso",
  RETURN_OWNER: "Devolvido ao dono (consignação/cliente)",
  OTHER: "Outro motivo",
};

type ItemLite = {
  id: string;
  code: string;
  title: string;
  status: string;
  tracking: string;
  ownership: string;
  locationId: string | null;
  costStatus: string | null;
  unitCostCents: number | null;
  qtyOnHand: number;
  qtyReserved: number;
  kind: string;
  hasChildren: boolean;
};

export function ItemActions({
  item,
  perms,
  locations,
  contacts,
  accounts,
}: {
  item: ItemLite;
  perms: { edit: boolean; adjust: boolean; cost: boolean; sell: boolean; trade: boolean; build: boolean };
  locations: { id: string; path: string }[];
  contacts: ContactOption[];
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [sheet, setSheet] = React.useState<null | "move" | "status" | "cost" | "define" | "dispose" | "lot">(null);
  const close = () => setSheet(null);
  const sellable = item.status === "AVAILABLE" && (item.ownership === "OWNED" || item.ownership === "CONSIGNED_IN");
  const transitions = MANUAL[item.status] ?? [];
  const physical = !["DELIVERED", "EXCHANGED", "DISASSEMBLED", "DISPOSED", "VOID", "INSTALLED"].includes(item.status);
  const canDispose = perms.adjust && ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RETURNED", "CONSIGNED_OUT"].includes(item.status);
  const isPc = item.kind === "PC" || item.kind === "NOTEBOOK" || item.hasChildren;

  return (
    <>
      {perms.sell && sellable && (
        <Button asChild variant="primary" size="sm">
          <Link href={`/vendas/nova?item=${item.id}`}>
            <Receipt /> Vender
          </Link>
        </Button>
      )}
      {perms.edit && physical && (
        <Button size="sm" onClick={() => setSheet("move")}>
          <MapPin /> Mover
        </Button>
      )}
      <Menu>
        <MenuTrigger asChild>
          <Button size="icon-sm" aria-label="Mais ações">
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent className="w-60">
          {perms.edit && transitions.length > 0 && (
            <MenuItem onSelect={() => setSheet("status")}>
              <RefreshCw /> Mudar situação
            </MenuItem>
          )}
          {perms.cost && item.ownership === "OWNED" && physical && (
            <MenuItem onSelect={() => setSheet("cost")}>
              <Coins /> Adicionar custo (frete, reparo…)
            </MenuItem>
          )}
          {perms.cost && item.costStatus && item.costStatus !== "KNOWN" && physical && (
            <MenuItem onSelect={() => setSheet("define")}>
              <Calculator /> Informar custo real
            </MenuItem>
          )}
          {perms.adjust && item.tracking === "LOT" && physical && (
            <MenuItem onSelect={() => setSheet("lot")}>
              <Boxes /> Ajustar quantidade
            </MenuItem>
          )}
          {perms.edit && (
            <MenuItem onSelect={() => router.push(`/estoque/${item.id}/editar`)}>
              <Pencil /> Editar dados
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem onSelect={() => router.push(`/estoque/etiquetas?ids=${item.id}`)}>
            <QrCode /> Imprimir etiqueta
          </MenuItem>
          <MenuItem onSelect={() => router.push(`/estoque/${item.id}/anuncio`)}>
            <Megaphone /> Texto para anúncio
          </MenuItem>
          {perms.trade && item.status === "AVAILABLE" && item.ownership === "OWNED" && (
            <MenuItem onSelect={() => router.push(`/catiras/nova?sai=${item.id}`)}>
              <ArrowLeftRight /> Oferecer em catira
            </MenuItem>
          )}
          {perms.build && isPc && ["AVAILABLE", "INSPECTION", "DEFECTIVE", "RETURNED"].includes(item.status) && item.ownership === "OWNED" && (
            <MenuItem onSelect={() => router.push(`/estoque/${item.id}/desmontar`)}>
              <Scissors /> Desmontar PC
            </MenuItem>
          )}
          {canDispose && (
            <>
              <MenuSeparator />
              <MenuItem danger onSelect={() => setSheet("dispose")}>
                <Trash2 /> Dar baixa
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>

      <MoveSheet open={sheet === "move"} onOpenChange={(o) => !o && close()} ids={[item.id]} locations={locations} current={item.locationId} />
      <StatusSheet open={sheet === "status"} onClose={close} item={item} transitions={transitions} contacts={contacts} />
      <CostSheet open={sheet === "cost"} onClose={close} item={item} accounts={accounts} contacts={contacts} />
      <DefineCostSheet open={sheet === "define"} onClose={close} item={item} />
      <DisposeSheet open={sheet === "dispose"} onClose={close} item={item} />
      <LotSheet open={sheet === "lot"} onClose={close} item={item} />
    </>
  );
}

function StatusSheet({ open, onClose, item, transitions, contacts }: { open: boolean; onClose: () => void; item: ItemLite; transitions: ItemStatusKey[]; contacts: ContactOption[] }) {
  const [to, setTo] = React.useState<ItemStatusKey | "">("");
  const [reason, setReason] = React.useState("");
  const [holder, setHolder] = React.useState<string | null>(null);
  const { run, pending } = useAction(changeStatusAction, { onSuccess: onClose });
  React.useEffect(() => {
    if (open) {
      setTo(transitions[0] ?? "");
      setReason("");
    }
  }, [open, transitions]);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Mudar situação"
      description={`Atual: ${STATUS_LABEL[item.status as ItemStatusKey]}. Vendas, montagens e catiras mudam a situação automaticamente.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={!to} onClick={() => run({ itemId: item.id, to: to as never, reason: reason || null, holderContactId: holder })}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nova situação">
          <Select value={to} onChange={(e) => setTo(e.target.value as ItemStatusKey)}>
            {transitions.map((t) => (
              <option key={t} value={t}>
                {STATUS_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        {to === "CONSIGNED_OUT" && (
          <Field label="Consignado com" required>
            <ContactPicker value={holder} onChange={setHolder} options={contacts} />
          </Field>
        )}
        <Field label={to === "DEFECTIVE" ? "Qual o defeito?" : "Motivo / observação"} required={to === "DEFECTIVE"}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
      </div>
    </Sheet>
  );
}

function CostSheet({ open, onClose, item, accounts, contacts }: { open: boolean; onClose: () => void; item: ItemLite; accounts: { id: string; name: string }[]; contacts: ContactOption[] }) {
  const [kind, setKind] = React.useState("REPAIR");
  const [amount, setAmount] = React.useState<number | null>(null);
  const [description, setDescription] = React.useState("");
  const [payment, setPayment] = React.useState<"PAID" | "PAYABLE" | "NONE">("PAID");
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? "");
  const [method, setMethod] = React.useState("PIX");
  const [contactId, setContactId] = React.useState<string | null>(null);
  const { run, pending } = useAction(addCostAction, { onSuccess: onClose });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Adicionar custo ao item"
      description="Reparo, frete, teste, peça trocada… entra no custo do item e no histórico."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!amount || description.trim().length < 2}
            onClick={(e) => run((key) => ({ idempotencyKey: key, itemId: item.id, kind: kind as never, amountCents: amount!, description, payment, accountId, method: method as never, contactId }))}
          >
            Adicionar {amount ? formatBRL(amount) : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="REPAIR">Reparo</option>
              <option value="PARTS">Peça trocada</option>
              <option value="TESTING">Teste</option>
              <option value="FREIGHT">Frete</option>
              <option value="FEE">Taxa</option>
              <option value="COMMISSION">Comissão</option>
              <option value="OTHER">Outro</option>
            </Select>
          </Field>
          <Field label="Valor">
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
        </div>
        <Field label="Descrição">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: troca de pasta e thermal pads" />
        </Field>
        <Field label="Pagamento">
          <SegmentedControl
            value={payment}
            onChange={setPayment}
            options={[
              { value: "PAID", label: "Já paguei" },
              { value: "PAYABLE", label: "A pagar" },
              { value: "NONE", label: "Correção" },
            ]}
          />
        </Field>
        {payment === "PAID" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Conta">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Forma">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {payment !== "NONE" && (
          <Field label="Pago a (opcional)">
            <ContactPicker value={contactId} onChange={setContactId} options={contacts} role="supplier" placeholder="Técnico, transportadora…" />
          </Field>
        )}
        {payment === "NONE" && (
          <Callout tone="warning">Use “Correção” só para um custo que já foi pago e registrado fora deste item. Não gera movimento de caixa.</Callout>
        )}
      </div>
    </Sheet>
  );
}

function DefineCostSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: ItemLite }) {
  const [amount, setAmount] = React.useState<number | null>(item.unitCostCents);
  const [reason, setReason] = React.useState("");
  const { run, pending } = useAction(defineCostAction, { onSuccess: onClose });
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Informar custo real"
      description="O item deixa de ter custo desconhecido/estimado. A correção fica registrada com o motivo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={amount === null || reason.trim().length < 3} onClick={() => run({ itemId: item.id, unitCostCents: amount!, reason })}>
            Salvar custo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={item.tracking === "LOT" ? "Custo por unidade" : "Custo do item"}>
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        <Field label="De onde vem este valor?" hint="Ex.: achei o comprovante do PIX de 10/03.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
      </div>
    </Sheet>
  );
}

function DisposeSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: ItemLite }) {
  const [kind, setKind] = React.useState(item.ownership === "OWNED" ? "LOSS" : "RETURN_OWNER");
  const [reason, setReason] = React.useState("");
  const [qty, setQty] = React.useState(String(Math.max(1, item.qtyOnHand - item.qtyReserved)));
  const { run, pending } = useAction(disposeAction, { onSuccess: onClose });
  const loss = item.ownership === "OWNED" && kind !== "RETURN_OWNER" && item.unitCostCents ? item.unitCostCents * (item.tracking === "LOT" ? Number(qty) || 0 : 1) : 0;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Dar baixa em ${item.code}`}
      description="O item sai do estoque. O registro e o histórico permanecem."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={pending}
            disabled={reason.trim().length < 3}
            onClick={() => run({ itemId: item.id, reasonKind: kind as never, reason, quantity: item.tracking === "LOT" ? Number(qty) : undefined })}
          >
            Confirmar baixa
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Motivo">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(DISPOSAL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {item.tracking === "LOT" && (
          <Field label="Quantidade">
            <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
          </Field>
        )}
        <Field label="Explique o que aconteceu" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        {loss > 0 && (
          <Callout tone="warning">
            Será lançada uma perda de <strong className="num">{formatBRL(loss)}</strong> (o custo do item) no resultado.
          </Callout>
        )}
      </div>
    </Sheet>
  );
}

function LotSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: ItemLite }) {
  const [counted, setCounted] = React.useState(String(item.qtyOnHand));
  const [reason, setReason] = React.useState("");
  const { run, pending } = useAction(adjustLotAction, { onSuccess: onClose });
  const delta = (Number(counted) || 0) - item.qtyOnHand;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Ajustar quantidade"
      description={`O sistema registra ${item.qtyOnHand} unidade(s).`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={delta === 0 || reason.trim().length < 3} onClick={() => run({ itemId: item.id, delta, reason })}>
            Ajustar ({delta > 0 ? "+" : ""}
            {delta})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Quantidade contada">
          <Input inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.replace(/\D/g, ""))} autoFocus />
        </Field>
        <Field label="Motivo" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Ex.: contagem física de 12/10" />
        </Field>
        {delta !== 0 && item.unitCostCents ? (
          <p className="text-sm text-ink-3">
            {delta < 0 ? "Falta" : "Sobra"} de {Math.abs(delta)} un. ≈ <span className="num">{formatBRL(Math.abs(delta) * item.unitCostCents)}</span> a custo, lançada no resultado.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
