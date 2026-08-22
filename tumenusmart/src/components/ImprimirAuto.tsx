"use client";

import { useEffect, useRef } from "react";

/**
 * Abre el diálogo de impresión apenas carga la pantalla, y deja además un
 * botón para volver a imprimir. Es el comportamiento que uno espera de una
 * comanda: se abre e imprime, sin un clic de más en plena cocina.
 */
export function ImprimirAuto({ automatico = true }: { automatico?: boolean }) {
  const yaDisparado = useRef(false);

  useEffect(() => {
    if (!automatico || yaDisparado.current) return;
    yaDisparado.current = true;
    // Un respiro para que terminen de aplicarse los estilos antes de que el
    // navegador arme la vista previa.
    const id = setTimeout(() => window.print(), 350);
    return () => clearTimeout(id);
  }, [automatico]);

  return (
    <div className="mb-4 flex justify-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
      >
        🖨 Imprimir
      </button>
      <button
        type="button"
        onClick={() => window.close()}
        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:border-neutral-400"
      >
        Cerrar
      </button>
    </div>
  );
}
