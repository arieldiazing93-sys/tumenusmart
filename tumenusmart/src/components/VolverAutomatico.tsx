"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve solo a otra pantalla después de unos segundos, con un aviso y un
 * botón para quedarse. Se usa después de cobrar en el Punto de Venta: el
 * ticket ya se imprimió (o se guardó como PDF) y el cajero tiene que seguir
 * con la próxima venta sin un clic de más para volver al mostrador.
 *
 * No se imprime (print:hidden): es solo un aviso de pantalla.
 */
export function VolverAutomatico({
  a,
  segundos = 2,
  texto = "Volviendo al punto de venta…",
}: {
  /** Ruta a la que se vuelve. */
  a: string;
  segundos?: number;
  texto?: string;
}) {
  const router = useRouter();
  const [cancelado, setCancelado] = useState(false);

  useEffect(() => {
    if (cancelado) return;
    const id = setTimeout(() => router.push(a), segundos * 1000);
    return () => clearTimeout(id);
  }, [a, segundos, cancelado, router]);

  if (cancelado) return null;

  return (
    <div className="mb-4 flex items-center justify-center gap-3 rounded-lg bg-exito-luz px-4 py-2 text-sm font-medium text-exito print:hidden">
      <span>{texto}</span>
      <button
        type="button"
        onClick={() => setCancelado(true)}
        className="rounded-lg border border-exito/30 bg-white px-3 py-1 text-sm font-medium text-exito transition-colors hover:bg-exito hover:text-white"
      >
        Quedarme acá
      </button>
    </div>
  );
}
