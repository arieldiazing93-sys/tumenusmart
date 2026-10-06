"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { clasesBoton } from "@/components/ui";
import { cambiarEstadoPedido, type ResultadoPedidoAccion } from "./actions";
import { ESTADOS_PEDIDO } from "@/lib/estados-pedido";
import { imprimirComprobante } from "@/lib/impresion-comprobantes";

export function EstadoBotones({
  orderId,
  estadoActual,
  tipoEntrega,
  repartidorId,
  cobrado,
  comprobanteTipo,
  facturaNumero,
  facturaAnulada,
  nombreImpresoraTicket,
  impresorasPorArea,
}: {
  orderId: string;
  estadoActual: string;
  tipoEntrega: string;
  repartidorId: string | null;
  /** El pedido ya se cobró (entró a la caja de un turno). Sin cobrar no se despacha (delivery) ni se entrega. */
  cobrado: boolean;
  comprobanteTipo: string;
  facturaNumero: string | null;
  facturaAnulada: boolean;
  /** Impresora QZ Tray para el ticket/factura, en esta estación — null = sin configurar, cae al manual. */
  nombreImpresoraTicket: string | null;
  /** Mapa Área de Impresión → impresora QZ Tray, en esta estación. */
  impresorasPorArea: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pidiendoMotivoCancelacion, setPidiendoMotivoCancelacion] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  // Se muestra una vez, justo al pasar a "En despacho" — un recordatorio
  // corto, no un bloqueo: el cajero puede perfectamente marcar "Entregado"
  // él mismo después (por ejemplo si el repartidor no tiene el teléfono a mano).
  const [avisoDespacho, setAvisoDespacho] = useState(false);
  // Impresión automática (QZ Tray) que no salió sola — link manual, nunca
  // un window.open ciego (ver src/lib/impresion-comprobantes.ts: entre el
  // clic y este momento pasaron varios `await`, un popup automático se
  // bloquea en silencio en la mayoría de los navegadores).
  const [fallback, setFallback] = useState<{ label: string; url: string }[]>([]);

  const faltaRepartidor = tipoEntrega === "delivery" && !repartidorId;
  // El pedido se cobra al cargarlo (entra a la caja del turno) y recién ahí sigue su recorrido: acá no se mueve plata. Uno sin cobrar
  // no sale de despacho (delivery) ni se entrega: el cuadro "Cobro" de abajo lo cobra.
  const bloqueadoPorCobro = (estado: string) =>
    !cobrado &&
    estadoActual !== estado &&
    (estado === "entregado" || (estado === "en_despacho" && tipoEntrega === "delivery"));
  // Si la factura ya está anulada, cancelar el pedido no le hace nada de
  // yapa a un número que ya está muerto — se trata como cualquier
  // cancelación común. Solo bloquea si TODAVÍA hay una factura viva.
  const facturaVigente = comprobanteTipo === "factura" && !!facturaNumero && !facturaAnulada;

  /**
   * Comanda al pasar a "en preparación" (una por Área de Impresión presente
   * en el pedido, resueltas por el propio cambiarEstadoPedido) y
   * ticket/factura al pasar a "en despacho" (delivery) o "entregado" (no
   * delivery): el repartidor sale con el papel, el cliente que retira se lo
   * lleva. El número de la factura ya se emitió al cobrar el pedido: acá solo
   * se imprime, una vez por pedido.
   *
   * Uno por vez, NUNCA en paralelo: mandar varios trabajos juntos a la
   * misma impresora física los mezcla en su buffer (confirmado con una
   * impresora real — salían líneas superpuestas/ilegibles salteadas).
   */
  async function imprimirSegunEstado(estado: string, resultado: Extract<ResultadoPedidoAccion, { ok: true }>) {
    // `urlCrudo` es lo que se manda a imprimir (texto ESC/POS); `urlManual`
    // es la página HTML normal, para el link de "abrir a mano" si falla.
    const tareas: { label: string; urlCrudo: string; urlManual: string; impresora: string | null }[] = (
      resultado.areasImpresion ?? []
    ).map((areaId) => ({
      label: "Comanda de cocina",
      urlCrudo: `/admin/pedidos/${orderId}/comanda/crudo?area=${areaId}`,
      urlManual: `/admin/pedidos/${orderId}/comanda?area=${areaId}`,
      impresora: impresorasPorArea[areaId] ?? null,
    }));

    const tocaTicket =
      (estado === "en_despacho" && tipoEntrega === "delivery") ||
      (estado === "entregado" && tipoEntrega !== "delivery");
    if (tocaTicket) {
      tareas.push({
        label: "Ticket/factura",
        urlCrudo: `/admin/pedidos/${orderId}/ticket/crudo`,
        urlManual: `/admin/pedidos/${orderId}/ticket`,
        impresora: nombreImpresoraTicket,
      });
    }

    const fallos: { label: string; url: string }[] = [];
    for (const t of tareas) {
      const r = await imprimirComprobante(t.urlCrudo, t.impresora);
      if (!r.ok) fallos.push({ label: t.label, url: t.urlManual });
    }
    if (fallos.length > 0) setFallback((actual) => [...actual, ...fallos]);
  }

  // Mismo criterio que CancelarVentaBoton del POS: motivo obligatorio,
  // queda quién y cuándo — para cualquier pedido, tenga factura o no.
  function confirmarCancelacion() {
    if (!motivoCancelacion.trim()) return;
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const resultado = await cambiarEstadoPedido(orderId, "cancelado", motivoCancelacion);
      if (!resultado.ok) setError(resultado.error);
      else {
        setPidiendoMotivoCancelacion(false);
        if (resultado.aviso) setAviso(resultado.aviso);
      }
    });
  }

  function handleClick(estado: string) {
    setError(null);
    setAviso(null);
    if (bloqueadoPorCobro(estado)) {
      setError("Este pedido todavía no se cobró: cobralo primero con el botón “Cobrar” del cuadro Cobro (más abajo).");
      return;
    }
    if (estado === "en_despacho" && faltaRepartidor) {
      setError("Asigná un repartidor antes de pasar el pedido a \"En despacho\".");
      return;
    }
    if (estado === "cancelado") {
      setPidiendoMotivoCancelacion(true);
      return;
    }
    startTransition(async () => {
      const resultado = await cambiarEstadoPedido(orderId, estado);
      if (!resultado.ok) {
        setError(resultado.error);
      } else {
        if (resultado.aviso) setAviso(resultado.aviso);
        imprimirSegunEstado(estado, resultado);
        if (estado === "en_despacho" && tipoEntrega === "delivery") setAvisoDespacho(true);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ESTADOS_PEDIDO.map((e) => {
          const activo = estadoActual === e.value;
          const sinCobrar = bloqueadoPorCobro(e.value);
          const bloqueado = (e.value === "en_despacho" && faltaRepartidor) || sinCobrar;
          return (
            <button
              key={e.value}
              type="button"
              disabled={pending}
              title={
                sinCobrar
                  ? "Primero cobrá el pedido"
                  : bloqueado
                    ? "Asigná un repartidor primero"
                    : undefined
              }
              onClick={() => handleClick(e.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                activo
                  ? "border-brand bg-brand text-white"
                  : bloqueado
                    ? "border-linea text-tinta-suave"
                    : "border-linea text-tinta-media hover:border-brand hover:text-brand"
              }`}
            >
              {e.emoji} {e.label}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-peligro">{error}</p>}
      {aviso && !error && <p className="mt-2 text-sm text-aviso">{aviso}</p>}
      {!cobrado && estadoActual !== "cancelado" && !error && (
        <p className="mt-2 rounded-lg border border-amarillo/60 bg-amarillo-luz px-3 py-2 text-[0.82rem] font-medium text-amarillo-oscuro">
          Este pedido todavía no se cobró: cobralo con el cuadro Cobro (más abajo) antes de{" "}
          {tipoEntrega === "delivery" ? "despacharlo" : "entregarlo"}.
        </p>
      )}
      {faltaRepartidor && !error && (
        <p className="mt-2 rounded-lg border border-amarillo/60 bg-amarillo-luz px-3 py-2 text-[0.82rem] font-medium text-amarillo-oscuro">
          Este pedido es delivery y todavía no tiene repartidor asignado: elegilo en el cuadro amarillo de abajo.
        </p>
      )}

      {fallback.length > 0 && (
        <div className="mt-3 rounded-lg border border-aviso/30 bg-aviso-luz p-3 text-sm">
          <p className="mb-1 font-medium text-aviso">No se pudo imprimir solo:</p>
          {fallback.map((c, i) => (
            <a
              key={`${c.url}-${i}`}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setFallback((actual) => actual.filter((_, j) => j !== i))}
              className="mr-3 underline text-brand-texto"
            >
              Abrir {c.label}
            </a>
          ))}
        </div>
      )}

      {pidiendoMotivoCancelacion && facturaVigente && (
        <div className="mt-3 rounded-xl border border-aviso/25 bg-aviso-luz p-3">
          <p className="text-sm text-tinta">
            Este pedido tiene la factura N° {facturaNumero} activa. Primero anulá la factura desde
            Facturas — recién después se puede cancelar el pedido.
          </p>
          <div className="mt-3 flex gap-2">
            <Link href="/admin/facturas" className={clasesBoton("navegar", "sm")}>
              Ir a Facturas
            </Link>
            <button
              type="button"
              onClick={() => setPidiendoMotivoCancelacion(false)}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-tinta-media hover:text-tinta"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {pidiendoMotivoCancelacion && !facturaVigente && (
        <div className="mt-3 rounded-xl border border-peligro/25 bg-peligro-luz p-3">
          <p className="text-sm text-tinta">
            ¿Por qué se cancela este pedido? Es obligatorio, queda en el historial.
          </p>
          <textarea
            value={motivoCancelacion}
            onChange={(e) => setMotivoCancelacion(e.target.value)}
            placeholder="Motivo: se cargó mal, el cliente se arrepintió, producto equivocado…"
            rows={2}
            className="mt-2 w-full rounded-lg border border-linea px-3 py-2 text-sm"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending || !motivoCancelacion.trim()}
              onClick={confirmarCancelacion}
              className="rounded-full border border-peligro/30 bg-peligro px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Cancelando…" : "Sí, cancelar este pedido"}
            </button>
            <button
              type="button"
              onClick={() => setPidiendoMotivoCancelacion(false)}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-tinta-media hover:text-tinta"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {avisoDespacho && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
          onClick={() => setAvisoDespacho(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pedido en despacho"
            className="w-full max-w-sm rounded-t-xl bg-white p-5 text-center shadow-alta sm:rounded-xl"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span aria-hidden="true" className="mb-2 block text-3xl">
              🛵
            </span>
            <p className="text-[0.95rem] font-semibold text-tinta">Ya salió a entregar</p>
            <p className="mt-1.5 text-[0.85rem] text-tinta-media">
              El repartidor tiene que confirmar la entrega y el cobro desde su propio enlace. No
              hace falta que marques &quot;Entregado&quot; acá, salvo que él no pueda hacerlo.
            </p>
            <button
              type="button"
              onClick={() => setAvisoDespacho(false)}
              className="mt-4 w-full rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
