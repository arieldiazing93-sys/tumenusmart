"use client";

import { useEffect, useRef, useState } from "react";
import { VolverAutomatico } from "./VolverAutomatico";

/**
 * Abre el diálogo de impresión apenas carga la pantalla, y deja además un
 * botón para volver a imprimir. Es el comportamiento que uno espera de una
 * comanda: se abre e imprime, sin un clic de más en plena cocina.
 *
 * Con `volverA` (el ticket que sale al cobrar en el Punto de Venta), cuando
 * el diálogo de impresión se cierra —se haya impreso, guardado como PDF o
 * cancelado— espera un instante y vuelve solo a esa pantalla: el cajero
 * sigue con la próxima venta sin tener que hacer clic para salir del ticket.
 */
export function ImprimirAuto({ automatico = true, volverA }: { automatico?: boolean; volverA?: string }) {
  const yaDisparado = useRef(false);
  const [terminoDeImprimir, setTerminoDeImprimir] = useState(false);

  useEffect(() => {
    if (!automatico || yaDisparado.current) return;
    yaDisparado.current = true;
    // Un respiro para que terminen de aplicarse los estilos antes de que el
    // navegador arme la vista previa.
    const id = setTimeout(() => window.print(), 350);
    return () => clearTimeout(id);
  }, [automatico]);

  // "afterprint" salta cuando se cierra el diálogo de impresión, sin importar
  // cómo terminó. Solo interesa si hay a dónde volver.
  useEffect(() => {
    if (!volverA) return;
    function alTerminar() {
      setTerminoDeImprimir(true);
    }
    window.addEventListener("afterprint", alTerminar);
    return () => window.removeEventListener("afterprint", alTerminar);
  }, [volverA]);

  return (
    <>
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
      {volverA && terminoDeImprimir && <VolverAutomatico a={volverA} segundos={1.5} />}
    </>
  );
}
