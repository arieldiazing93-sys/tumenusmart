"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_POS, normalizarFormaPagoPos, type FormaPagoPos } from "@/lib/turno-pos";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { cobrarPedido } from "./actions";

/**
 * El cobro de un pedido que todavía no está cobrado (uno viejo, de antes de que todo pedido se cobrara al cargarlo a mano). Se
 * elige con qué se cobra y entra a la caja del turno abierto de esta computadora; si el pedido es con factura y todavía no la tiene,
 * se emite en el mismo momento. Sin turno abierto manda directo a abrirlo y vuelve.
 *
 * Los pedidos nuevos no pasan por acá: nacen cobrados.
 */
export function CobroPedido({
  orderId,
  total,
  formaSugerida,
  conFactura,
}: {
  orderId: string;
  total: number;
  /** Lo que se había anotado como forma de pago (referencia): arranca elegida. */
  formaSugerida: string;
  /** El pedido es con factura y todavía no tiene número: se emite al cobrarlo. */
  conFactura: boolean;
}) {
  const router = useRouter();
  const [forma, setForma] = useState<FormaPagoPos>(normalizarFormaPagoPos(formaSugerida));
  const [error, setError] = useState<string | null>(null);
  const [trabajando, iniciar] = useTransition();

  function cobrar() {
    setError(null);
    iniciar(async () => {
      try {
        const r = await cobrarPedido(orderId, forma);
        if (!r.ok) {
          // Sin turno de caja abierto no se cobra: se va a abrirlo y se vuelve a este pedido.
          if (r.sinTurno) router.push(rutaParaAbrirTurno(`/admin/pedidos/${orderId}`));
          else setError(r.error);
          return;
        }
        router.refresh();
      } catch {
        setError("No se pudo cobrar. Revisá la conexión y probá de nuevo: no se registró nada.");
      }
    });
  }

  return (
    <div className="mt-2.5 rounded-lg border-2 border-amarillo/60 bg-amarillo-luz p-3">
      <p className="text-[0.88rem] font-semibold text-amarillo-oscuro">Sin cobrar — {formatearGuarani(total)}</p>
      <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
        Elegí con qué se cobra: entra a la caja del turno abierto{conFactura ? " y se emite la factura en el acto" : ""}. Hasta
        cobrarlo no se despacha ni se entrega.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FORMAS_PAGO_POS.map((f) => (
          <button
            key={f.valor}
            type="button"
            disabled={trabajando}
            onClick={() => setForma(f.valor)}
            className={`rounded-full border px-3 py-1.5 text-[0.82rem] font-medium disabled:opacity-50 ${
              forma === f.valor
                ? "border-brand bg-brand text-white"
                : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-[0.8rem] font-medium text-peligro">{error}</p>}
      <div className="mt-2.5">
        <button type="button" disabled={trabajando} onClick={cobrar} className={clasesBoton("principal", "sm")}>
          {trabajando ? "Cobrando…" : "Cobrar"}
        </button>
      </div>
    </div>
  );
}
