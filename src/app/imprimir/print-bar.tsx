"use client";

import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintBar() {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4">
      <Button variant="ghost" size="sm" onClick={() => (history.length > 1 ? history.back() : window.close())}>
        <ArrowLeft /> Voltar
      </Button>
      <Button variant="primary" size="sm" onClick={() => window.print()}>
        <Printer /> Imprimir ou salvar PDF
      </Button>
    </div>
  );
}
