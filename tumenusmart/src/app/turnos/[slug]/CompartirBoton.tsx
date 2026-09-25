"use client";

import { useEffect, useState } from "react";
import { IconoCompartir } from "@/components/IconosRedes";

/**
 * El botón de compartir de arriba de la página: en el celular abre el menú de
 * compartir del sistema (WhatsApp, Instagram…); si el navegador no lo tiene,
 * copia el link.
 */
export function CompartirBoton({ nombre }: { nombre: string }) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2200);
    return () => clearTimeout(t);
  }, [copiado]);

  async function compartir() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: nombre, url });
      } catch {
        // La persona cerró el menú de compartir: no es un error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      // Sin permiso para copiar: no hay nada más para hacer acá.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={compartir}
        aria-label="Compartir esta página"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-papel/90 text-tinta shadow backdrop-blur transition-transform active:scale-95"
      >
        <IconoCompartir tam={18} />
      </button>
      {copiado && (
        <span
          role="status"
          className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-tinta px-2.5 py-1.5 text-[0.75rem] font-medium text-papel shadow"
        >
          Link copiado
        </span>
      )}
    </div>
  );
}
