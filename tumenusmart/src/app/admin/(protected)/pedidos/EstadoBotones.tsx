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
  // Impresión automática (QZ Tray) que no salió sola — link manual, nunca
  // un window.open ciego (ver src/lib/impresion-comprobantes.ts: entre el
  // clic y este momento pasaron varios `await`, un popup automático se
  // bloquea en silencio en la mayoría de los navegadores).
  const [fallback, setFallback] = useState<{ label: string; url: string }[]>([]);

  const faltaRepartidor = tipoEntrega === "delivery" && !repartidorId;
  // Retiro/mesa se cobra en el mostrador: si hay un turno de caja abierto,
  // marcarlo "entregado" tiene que decir con qué se cobró para que entre en
  // ese mismo cierre. El delivery sigue su propio camino (Rendición).
  const pideFormaPago = tipoEntrega !== "delivery" && turnoAbiertoId != null;
  const esFactura = comprobanteTipo === "factura" && !!facturaNumero;

  /**
   * Comanda al pasar a "en preparación" (una por Área de Impresión presente
   * en el pedido, resueltas por el propio cambiarEstadoPedido) y
   * ticket/factura al pasar a "en despacho" (delivery) o "entregado" (no
   * delivery) — los mismos dos casos donde cambiarEstadoPedido YA emite el
   * número de factura, así que nunca se imprime dos veces el mismo pedido.
   */
  function imprimirSegunEstado(estado: string, resultado: Extract<ResultadoPedidoAccion, { ok: true }>) {
    const tareas: Promise<{ label: string; url: string; ok: boolean }>[] = [];

    for (const areaId of resultado.areasImpresion ?? []) {
      const url = `/admin/pedidos/${orderId}/comanda?area=${areaId}`;
      tareas.push(
        imprimirComprobante(url, impresorasPorArea[areaId] ?? null, 72).then((r) => ({
          label: "Comanda de cocina",
          url,
          ok: r.ok,
        }))
      );
    }

    const tocaTicket =
      (estado === "en_despacho" && tipoEntrega === "delivery") ||
      (estado === "entregado" && tipoEntrega !== "delivery");
    if (tocaTicket) {
      const url = `/admin/pedidos/${orderId}/ticket`;
      tareas.push(
        imprimirComprobante(url, nombreImpresoraTicket, 67).then((r) => ({
          label: "Ticket/factura",
          url,
          ok: r.ok,
        }))
      );
    }

    if (tareas.length === 0) return;
    Promise.all(tareas).then((resultados) => {
      const fallos = resultados.filter((r) => !r.ok).map(({ label, url }) => ({ label, url }));
      if (fallos.length > 0) setFallback((actual) => [...actual, ...fallos]);
    });
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
            Se suma al cierre del turno que está abierto ahora en el Punto de Venta.
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
    </div>
  );
}
