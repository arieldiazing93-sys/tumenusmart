"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarPedidoEntregado } from "./actions";
import { FORMAS_DE_COBRO, type FormaDeCobro } from "@/lib/rendicion";

/**
 * Marcar entregado, diciendo con qué le pagaron.
 *
 * Antes esto era un botón con un `confirm()` del navegador. Ahora el botón
 * abre las formas de cobro y se elige una: sigue siendo un solo toque para
 * confirmar, pero ese toque además deja el dato que hace falta para cuadrar
 * la caja cuando vuelva.
 *
 * Solo se ofrecen los medios que el local tiene activados en Configuración
 * (aceptaEfectivo/etc.) — mostrar "Transferencia" a un repartidor de un
 * local que no la acepta solo suma una opción confusa que nunca corresponde
 * marcar. "Ya estaba pago" no es un medio de pago del local, es un estado
 * del pedido (se pagó al hacerlo, antes de salir) — siempre está disponible.
 *
 * Se sugiere lo que el cliente había elegido al pedir, aunque marcado como
 * sugerencia: en la puerta cambia seguido, y si la sugerencia viniera ya
 * apretada el repartidor la confirmaría sin mirar.
 */
export function EntregarBoton({
  repartidorId,
  orderId,
  pagoSugerido,
  aceptaEfectivo,
  aceptaTransferencia,
  aceptaTarjetaDebito,
  aceptaTarjetaCredito,
}: {
  repartidorId: string;
  orderId: string;
  /** Lo que el cliente dijo al hacer el pedido. Solo para resaltar una opción. */
  pagoSugerido?: string;
  aceptaEfectivo: boolean;
  aceptaTransferencia: boolean;
  aceptaTarjetaDebito: boolean;
  aceptaTarjetaCredito: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);

  const activadas: Record<FormaDeCobro, boolean> = {
    efectivo: aceptaEfectivo,
    tarjeta_debito: aceptaTarjetaDebito,
    tarjeta_credito: aceptaTarjetaCredito,
    transferencia: aceptaTransferencia,
    ya_pagado: true,
  };
  const opciones = FORMAS_DE_COBRO.filter((f) => activadas[f.valor]);

  function marcar(cobro: string) {
    setError(null);
    startTransition(async () => {
      const resultado = await marcarPedidoEntregado(repartidorId, orderId, cobro);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setHecho(true);
      router.refresh();
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
        {opciones.map((f) => (
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
        <p className="mt-2 rounded-md bg-aviso-luz px-2.5 py-2 text-[0.8rem] font-medium text-aviso">
          El cliente había dicho{" "}
          <strong className="font-bold">
            {FORMAS_DE_COBRO.find((f) => f.valor === pagoSugerido)?.etiqueta ?? pagoSugerido}
          </strong>
          . Marcá lo que pasó de verdad.
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
