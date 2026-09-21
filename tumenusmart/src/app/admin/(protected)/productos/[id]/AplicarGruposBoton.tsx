"use client";

import { useState, useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { aplicarGruposACategoria } from "../actions";

/**
 * Copia de una sola vez los grupos de agregados de este producto a los
 * demás de su categoría — se arma una vez (ej: Ravioles con el grupo
 * "Salsas") y se replica al resto de las pastas sin ir tildando producto
 * por producto. Mismo patrón que la vieja `AplicarAgregadosBoton` (para
 * agregados propios), ahora para grupos.
 */
export function AplicarGruposBoton({
  productId,
  categoriaNombre,
  cantidadGrupos,
}: {
  productId: string;
  categoriaNombre: string;
  cantidadGrupos: number;
}) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);

  if (cantidadGrupos === 0) return null;

  function aplicar() {
    const confirmado = confirm(
      `¿Aplicar estos grupos de agregados a los demás productos de "${categoriaNombre}"?\n\n` +
        `Se suman los que le falten a cada uno — no se toca ni se duplica ningún grupo que ya tengan.`
    );
    if (!confirmado) return;

    setMensaje(null);
    iniciar(async () => {
      const resultado = await aplicarGruposACategoria(productId);
      if (!resultado.ok) {
        setMensaje({ texto: resultado.error, esError: true });
        return;
      }

      const { productosActualizados, adjuntosCreados, productosSinCambios } = resultado;
      const texto =
        productosActualizados === 0
          ? "Los demás productos de esta categoría ya tenían todos estos grupos."
          : `Se adjuntaron ${adjuntosCreados} grupo(s) en ${productosActualizados} ` +
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
        {pendiente ? "Aplicando…" : `Aplicar esta configuración a "${categoriaNombre}"`}
      </button>
      {mensaje && (
        <p className={`text-xs ${mensaje.esError ? "text-peligro" : "text-exito"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
