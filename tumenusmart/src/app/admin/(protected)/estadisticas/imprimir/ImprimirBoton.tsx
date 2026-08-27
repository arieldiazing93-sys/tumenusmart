"use client";

import { clasesBoton } from "@/components/ui";
export function ImprimirBoton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`print:hidden ${clasesBoton("principal")}`}
    >
      🖨 Imprimir / Guardar como PDF
    </button>
  );
}
