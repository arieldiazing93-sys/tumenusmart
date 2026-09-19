"use client";

import { useState, useTransition } from "react";
import { cambiarEstadoPedido, type ResultadoPedidoAccion } from "./actions";
import { ESTADOS_PEDIDO } from "@/lib/estados-pedido";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";
import { imprimirComprobante } from "@/lib/impresion-comprobantes";

export function EstadoBotones({
  orderId,
  estadoActual,
  tipoEntrega,
  repartidorId,
  turnoAbiertoId,
  comprobanteTipo,
  facturaNumero,
  nombreImpresoraTicket,
  impresorasPorArea,
}: {
  orderId: string;
  estadoActual: string;
  tipoEntrega: string;
  repartidorId: string | null;
  /** Id del turno de caja del Punto de Venta abierto ahora, o null si no hay. */
  turnoAbiertoId: string | null;
  comprobanteTipo: string;
  facturaNumero: string | null;
  /** Impresora QZ Tray para el ticket/factura, en esta estación — null = sin configurar, cae al manual. */
  nombreImpresoraTicket: string | null;
  /** Mapa Área de Impresión → impresora QZ Tray, en esta estación. */
  impresorasPorArea: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pidiendoPago, setPidiendoPago] = useState(false);
  const [pidiendoMotivoCancelacion, setPidiendoMotivoCancelacion] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");
  // Se muestra una vez, justo al pasar a "En despacho" — un recordatorio
  // corto, no un bloqueo: el cajero puede perfectamente marcar "Entregado"
  // él mismo después (por ejemplo si el repartidor no tiene el teléfono a
  // mano), y en ese caso ya queda cubierto por pideFormaPago más abajo.
  const [avisoDespacho, setAvisoDespacho] = useState(false);
  // Impresión automática (QZ Tray) que no salió sola — link manual, nunca
  // un window.open ciego (ver src/lib/impresion-comprobantes.ts: entre el
  // clic y este momento pasaron varios `await`, un popup automático se
  // bloquea en silencio en la mayoría de los navegadores).
  const [fallback, setFallback] = useState<{ label: string; url: string }[]>([]);

  const faltaRepartidor = tipoEntrega === "delivery" && !repartidorId;
  // Retiro/mesa se cobra en el mostrador: si hay un turno de caja abierto,
  // marcarlo "entregado" tiene que decir con qué se cobró para que entre en
  // ese mismo cierre. Delivery pregunta SIEMPRE, aunque lo normal sea
  // confirmarlo desde la pantalla del repartidor (/repartidor/[id]) — si el
  // cajero lo marca entregado desde acá (por ejemplo porque el repartidor
  // no tiene el teléfono a mano), igual tiene que quedar con qué se cobró:
  // si no, el pedido queda invisible en Rendición (ver cambiarEstadoPedido).
  const pideFormaPago = tipoEntrega === "delivery" || turnoAbiertoId != null;
  const esFactura = comprobanteTipo === "factura" && !!facturaNumero;

  /**
   * Comanda al pasar a "en preparación" (una por Área de Impresión presente
   * en el pedido, resueltas por el propio cambiarEstadoPedido) y
   * ticket/factura al pasar a "en despacho" (delivery) o "entregado" (no
   * delivery) — los mismos dos casos donde cambiarEstadoPedido YA emite el
   * número de factura, así que nunca se imprime dos veces el mismo pedido.
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

  function confirmarEntregado(formaPago: FormaPagoPos) {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const resultado = await cambiarEstadoPedido(orderId, "entregado", formaPago);
      if (!resultado.ok) setError(resultado.error);
      else {
        setPidiendoPago(false);
        if (resultado.aviso) setAviso(resultado.aviso);
        imprimirSegunEstado("entregado", resultado);
      }
    });
  }

  // Mismo criterio que CancelarVentaBoton del POS: motivo obligatorio,
  // queda quién y cuándo — para cualquier pedido, tenga factura o no.
  function confirmarCancelacion() {
    if (!motivoCancelacion.trim()) return;
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const resultado = await cambiarEstadoPedido(orderId, "cancelado", undefined, motivoCancelacion);
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
    if (estado === "en_despacho" && faltaRepartidor) {
      setError("Asigná un repartidor antes de pasar el pedido a \"En despacho\".");
      return;
    }
    if (estado === "entregado" && estadoActual !== "entregado" && pideFormaPago) {
      setPidiendoPago(true);
      return;
    }
    if (estado === "cancelado") {
      setPidiendoMotivoCancelacion(true);
      return;
    }
    startTransition(async () => {
      const resultado = await cambiarEstadoPedido(orderId, estado);
      if (!resultado.ok) setError(resultado.error);
      else {
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
          const bloqueado = e.value === "en_despacho" && faltaRepartidor;
          return (
            <button
              key={e.value}
              type="button"
              disabled={pending}
              title={bloqueado ? "Asigná un repartidor primero" : undefined}
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
      {faltaRepartidor && !error && (
        <p className="mt-2 text-xs text-tinta-suave">
          Este pedido es delivery y todavía no tiene repartidor asignado.
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

      {pidiendoPago && (
        <div className="mt-3 rounded-lg border border-linea bg-papel-suave p-3">
          <p className="mb-2 text-sm text-tinta">¿Con qué se cobró este pedido?</p>
          <div className="flex flex-wrap gap-2">
            {FORMAS_PAGO_POS.map((f) => (
              <button
                key={f.valor}
                type="button"
                disabled={pending}
                onClick={() => confirmarEntregado(f.valor)}
                className="rounded-full border border-linea px-3 py-1.5 text-sm font-medium text-tinta-media hover:border-brand hover:text-brand disabled:opacity-50"
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPidiendoPago(false)}
            className="mt-2 text-xs font-medium text-tinta-suave hover:text-peligro"
          >
            Cancelar
          </button>
          <p className="mt-2 text-xs text-tinta-suave">
            {tipoEntrega === "delivery"
              ? "Queda pendiente de rendir en Cierre, igual que si lo confirmara el repartidor."
              : "Se suma al cierre del turno que está abierto ahora en el Punto de Venta."}
          </p>
        </div>
      )}

      {pidiendoMotivoCancelacion && (
        <div className="mt-3 rounded-xl border border-peligro/25 bg-peligro-luz p-3">
          <p className="text-sm text-tinta">
            {esFactura
              ? `Este pedido es una FACTURA (N° ${facturaNumero}) con timbrado real — al cancelarlo, ese número queda consumido para siempre, no se puede reutilizar. Vas a tener que rehacer el pedido con los datos correctos. ¿Por qué se cancela?`
              : "¿Por qué se cancela este pedido? Es obligatorio, queda en el historial."}
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
