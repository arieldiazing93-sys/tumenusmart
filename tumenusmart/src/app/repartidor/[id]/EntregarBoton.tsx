"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarPedidoEntregado } from "./actions";
import { FORMAS_DE_COBRO } from "@/lib/rendicion";

/**
 * Marcar entregado, diciendo con qué le pagaron.
 *
 * Antes esto era un botón con un `confirm()` del navegador. Ahora el botón
 * abre las cuatro formas de cobro y se elige una: sigue siendo un solo toque
 * para confirmar, pero ese toque además deja el dato que hace falta para
 * cuadrar la caja cuando vuelva.
 *
 * Se sugiere lo que el cliente había elegido al pedir, aunque marcado como
 * sugerencia: en la puerta cambia seguido, y si la sugerencia viniera ya
 * apretada el repartidor la confirmaría sin mirar.
 */
export function EntregarBoton({
  repartidorId,
  orderId,
  pagoSugerido,
}: {
  repartidorId: string;
  orderId: string;
  /** Lo que el cliente dijo al hacer el pedido. Solo para resaltar una opción. */
  pagoSugerido?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);

  function marcar(cobro: string) {
    setError(null);
    startTransition(async () => {
      try {
        await marcarPedidoEntregado(repartidorId, orderId, cobro);
        setHecho(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo marcar como entregado");
      }
    });
  }

  if (hecho) {
    return <span className="text-sm font-semibold text-exito">✓ Entregado</span>;
  }

  if (!eligiendo) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setEligiendo(true)}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          ✓ Marcar como entregado
        </button>
        {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-linea bg-papel-suave p-3">
      <p className="text-[0.82rem] font-semibold text-tinta">¿Cómo te pagó?</p>

      {/* Botones grandes: esto se aprieta parado en la vereda, de noche y con
          una mano ocupada. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        {FORMAS_DE_COBRO.map((f) => (
          <button
            key={f.valor}
            type="button"
            disabled={pending}
            onClick={() => marcar(f.valor)}
            className={`rounded-lg border px-3 py-3 text-[0.85rem] font-semibold transition-colors disabled:opacity-50 ${
              f.valor === pagoSugerido
                ? "border-brand bg-brand-light text-brand-texto"
                : "border-linea bg-white text-tinta hover:border-brand"
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {pagoSugerido && (
        <p className="mt-2 text-[0.75rem] text-tinta-suave">
          El cliente había dicho{" "}
          {FORMAS_DE_COBRO.find((f) => f.valor === pagoSugerido)?.etiqueta ?? pagoSugerido}.
          Marcá lo que pasó de verdad.
        </p>
      )}

      <button
        type="button"
        onClick={() => setEligiendo(false)}
        className="mt-2 text-[0.8rem] font-medium text-tinta-suave underline"
      >
        Cancelar
      </button>

      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
    </div>
  );
}
