"use client";

import { MaestroDetalle } from "@/components/MaestroDetalle";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { colorEstado, etiquetaEstado } from "@/lib/estados-pedido";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { DetallePedido } from "./DetallePedido";
import type { ContextoPedidos, PedidoFila } from "./tipos-pedido";

function horaCorta(iso: string): string {
  const f = new Date(iso);
  const dia = f.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO });
  const hora = f.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_NEGOCIO });
  return `${dia} ${hora}`;
}

/**
 * Los pedidos como las cuentas del Servicio comedor: una columna a la izquierda (con el botón Ver) y, con doble clic en uno, todo lo
 * que lo compone a la derecha, con los botones para operarlo (ver DetallePedido).
 */
export function PedidosMaestro({ pedidos, contexto }: { pedidos: PedidoFila[]; contexto: ContextoPedidos }) {
  return (
    <MaestroDetalle
      items={pedidos}
      cerrarSiDesaparece
      textoVacio="No hay pedidos con estos filtros."
      textoPlaceholder="Hacé doble clic en un pedido (o tocá Ver) para ver todo lo que lo compone y operarlo: preparación, despacho, entrega, repartidor, cobro y cancelación."
      columnas={[
        {
          titulo: "Pedido",
          celda: (p) => (
            <div className="flex flex-col gap-0.5">
              <span className="text-[0.95rem] font-semibold text-tinta">
                {formatearNumero(p.numero)} · {p.clienteNombre}
              </span>
              <span className="text-[0.74rem] text-tinta-suave">
                {horaCorta(p.creadoEn)} · {p.tipoEntrega === "delivery" ? (p.zona ?? "Delivery") : "Retiro"}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${colorEstado(p.estado)}`}>
                  {etiquetaEstado(p.estado)}
                </span>
                {!p.cobrado && p.estado !== "cancelado" && (
                  <span title="Este pedido todavía no se cobró: no entró a ninguna caja" className="text-[0.66rem] font-bold uppercase text-amarillo-oscuro">
                    Sin cobrar
                  </span>
                )}
                {p.comprobanteTipo === "factura" && p.facturaNumero && (
                  <span className="text-[0.66rem] font-medium uppercase text-tinta-suave">{p.facturaNumero}</span>
                )}
              </span>
            </div>
          ),
        },
        {
          titulo: "Total",
          derecha: true,
          celda: (p) => <span className="cifra font-semibold text-tinta">{formatearGuarani(p.total)}</span>,
        },
      ]}
      renderPanel={(p) => <DetallePedido pedido={p} contexto={contexto} />}
    />
  );
}
