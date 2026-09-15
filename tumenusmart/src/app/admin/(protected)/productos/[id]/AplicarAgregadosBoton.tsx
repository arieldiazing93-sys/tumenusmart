"use client";

import { useState, useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { aplicarAgregadosACategoria } from "../actions";

/**
 * Copia de una sola vez los agregados de este producto a los demás de su
 * categoría — para cuando 15-20 productos (ej: todas las hamburguesas)
 * llevan los mismos 6-7 agregados y cargarlos uno por uno sería el mismo
 * trabajo repetido veinte veces.
 */
export function AplicarAgregadosBoton({
  productId,
  categoriaNombre,
  cantidadAgregados,
}: {
  productId: string;
  categoriaNombre: string;
  cantidadAgregados: number;
}) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);

  // Sin agregados propios no hay nada para copiar.
  if (cantidadAgregados === 0) return null;

  function aplicar() {
    const confirmado = confirm(
      `¿Aplicar estos ${cantidadAgregados} agregados a los demás productos de "${categoriaNombre}"?\n\n` +
        `Se suman los que le falten a cada uno — no se toca ni se duplica ningún agregado que ya tengan con el mismo nombre.`
    );
    if (!confirmado) return;

    setMensaje(null);
    iniciar(async () => {
      const resultado = await aplicarAgregadosACategoria(productId);
      if (!resultado.ok) {
        setMensaje({ texto: resultado.error, esError: true });
        return;
      }

      const { productosActualizados, agregadosCreados, productosSinCambios } = resultado;
      const texto =
        productosActualizados === 0
          ? "Los demás productos de esta categoría ya tenían todos estos agregados."
          : `Se agregaron ${agregadosCreados} agregados en ${productosActualizados} ` +
            `producto${productosActualizados === 1 ? "" : "s"}` +
            (productosSinCambios > 0
              ? ` (${productosSinCambios} ya los tenía todos y no se tocó).`
              : ".");
      setMensaje({ texto, esError: false });
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={aplicar}
        disabled={pendiente}
        className={clasesBoton("suave", "sm")}
      >
        {pendiente ? "Aplicando…" : `Copiar a los demás productos de "${categoriaNombre}"`}
      </button>
      {mensaje && (
        <p className={`text-xs ${mensaje.esError ? "text-peligro" : "text-exito"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
