"use client";

import { useRouter } from "next/navigation";
import { MoreHorizontal, Archive, ArchiveRestore, UserX, Receipt, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { confirmDialog } from "@/components/ui/confirm";
import { archiveContactAction, anonymizeContactAction } from "../actions";

export function ContactMenu({ id, archived, canAnonymize, canSell, canTrade }: { id: string; archived: boolean; canAnonymize: boolean; canSell: boolean; canTrade: boolean }) {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="icon-sm" aria-label="Mais ações">
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent className="w-64">
        {canSell && (
          <MenuItem onSelect={() => router.push(`/vendas/nova?contato=${id}`)}>
            <Receipt /> Nova venda para este contato
          </MenuItem>
        )}
        {canTrade && (
          <MenuItem onSelect={() => router.push(`/catiras/nova?contato=${id}`)}>
            <ArrowLeftRight /> Nova catira com este contato
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            const r = await archiveContactAction(id, !archived);
            if (r.ok) {
              toast.success(archived ? "Contato reativado" : "Contato arquivado");
              router.refresh();
            } else toast.error(r.error);
          }}
        >
          {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Reativar" : "Arquivar"}
        </MenuItem>
        {canAnonymize && (
          <MenuItem
            danger
            onSelect={async () => {
              const c = await confirmDialog({
                title: "Remover dados pessoais deste contato?",
                description: "Use quando a pessoa pedir a exclusão dos dados. Nome, telefone, e-mail, documento e anotações são apagados. Vendas e compras continuam registradas (sem os dados pessoais) para manter os números corretos. Não pode ser desfeito.",
                typeToConfirm: "ANONIMIZAR",
                confirmLabel: "Remover dados pessoais",
                tone: "danger",
              });
              if (!c.ok) return;
              const r = await anonymizeContactAction(id, "ANONIMIZAR");
              if (r.ok) {
                toast.success("Dados pessoais removidos");
                router.refresh();
              } else toast.error(r.error);
            }}
          >
            <UserX /> Remover dados pessoais
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}
