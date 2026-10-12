"use client";

import * as React from "react";
import { Copy, Check, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function waLink(text: string, phone?: string | null) {
  const digits = phone?.replace(/\D/g, "");
  const to = digits ? (digits.startsWith("55") ? digits : `55${digits}`) : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** Copiar / abrir no WhatsApp (o envio é feito pelo próprio usuário no app dele — sem automação). */
export function ShareButtons({ text, phone, print }: { text: string; phone?: string | null; print?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success("Texto copiado");
            setTimeout(() => setCopied(false), 2000);
          } catch {
            toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
          }
        }}
      >
        {copied ? <Check /> : <Copy />} Copiar texto
      </Button>
      <Button asChild variant="primary">
        <a href={waLink(text, phone)} target="_blank" rel="noreferrer">
          <MessageCircle /> {phone ? "Enviar no WhatsApp" : "Abrir no WhatsApp"}
        </a>
      </Button>
      {print && (
        <Button variant="ghost" onClick={() => window.print()}>
          <Printer /> Imprimir / PDF
        </Button>
      )}
    </div>
  );
}
