"use client";

export function ImprimirBoton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark print:hidden"
    >
      🖨 Imprimir / Guardar como PDF
    </button>
  );
}
