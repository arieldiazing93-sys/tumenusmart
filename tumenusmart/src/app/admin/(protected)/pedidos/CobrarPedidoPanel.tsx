"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, MensajeError, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { textoPorcentaje } from "@/lib/descuento-venta";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { normalizarFormaPagoPos } from "@/lib/turno-pos";
import { CamposFiscalesCliente, fichaVacia, type FichaFiscal } from "./CamposFiscalesCliente";
import { cobrarPedido } from "./actions";
import type { ContextoPedidos, PedidoFila } from "./tipos-pedido";

const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";
const CAJA = "flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-superficie p-3.5";

const ICONOS_PAGO: Record<string, string> = {
  efectivo: "💵",
  transferencia: "🏦",
  tarjeta_debito: "💳",
  tarjeta_credito: "💳",
};

/** Una forma de pago: blanca con borde, y en azul la elegida — igual que en el cobro del Punto de Venta. */
function claseMetodo(elegido: boolean): string {
  return `flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[0.85rem] font-medium leading-tight transition-colors active:scale-[0.98] ${
    elegido ? "border-azul bg-azul-luz text-azul-oscuro" : "border-linea text-tinta-media hover:border-azul/40 hover:bg-papel-suave"
  }`;
}

/**
 * Cobrar el pedido: el último paso, a la derecha de la pantalla. Se elige con qué se cobra (efectivo, transferencia, tarjeta) y el
 * comprobante: ticket, o factura con registro fiscal (con los datos del cliente, que ya vienen de la ficha que se cargó al crear el
 * pedido) o sin registro fiscal. Al confirmar, el pedido entra a la caja del turno abierto y, si es con factura, se emite en el acto
 * con el descuento del pedido. Después ya no se puede modificar.
 */
export function CobrarPedidoPanel({
  pedido,
  contexto,
  onCerrar,
}: {
  pedido: PedidoFila;
  contexto: ContextoPedidos;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const { metodosPago, facturaObligatoria, puedeFacturar, motivoSinFactura, diasParaVencerTimbrado } = contexto;
  // Si el local factura todo y esta computadora puede, no hay "Ticket" que elegir; si factura todo y no puede, no se cobra.
  const facturaForzada = facturaObligatoria && puedeFacturar;
  const bloqueadoSinFacturar = facturaObligatoria && !puedeFacturar;
  const textoBloqueo =
    "Este local exige facturar todas las ventas y esta computadora no tiene un punto de expedición vigente asignado. " +
    "No se puede cobrar hasta que el dueño le asigne uno en Puntos de expedición." +
    (motivoSinFactura ? ` ${motivoSinFactura}` : "");

  // La ficha del cliente que se cargó al crear el pedido (o la de su última factura): el cobro arranca con esos datos.
  const fichaDelPedido: FichaFiscal =
    pedido.facturaRuc && pedido.facturaTipoIdentificacion !== SIN_REGISTRO_FISCAL.tipo
      ? {
          tipo: pedido.facturaTipoIdentificacion ?? fichaVacia().tipo,
          numero: pedido.facturaRuc,
          razon: pedido.facturaRazonSocial ?? "",
          email: pedido.facturaEmail ?? "",
        }
      : fichaVacia();
  const tieneFicha = !!fichaDelPedido.numero.trim() && !!fichaDelPedido.razon.trim();

  // La forma con la que se había hablado (si el pedido la trae anotada) arranca elegida, mientras el local la tenga habilitada.
  const formaInicial = metodosPago.some((m) => m.value === pedido.metodoPagoReferencia)
    ? normalizarFormaPagoPos(pedido.metodoPagoReferencia)
    : (metodosPago[0]?.value ?? "efectivo");

  const [forma, setForma] = useState<string>(formaInicial);
  // Con la ficha del cliente cargada, el comprobante arranca en "Factura con registro fiscal" (se puede cambiar).
  const [comprobante, setComprobante] = useState<"ticket" | "factura">(
    facturaForzada || (puedeFacturar && (tieneFicha || pedido.comprobanteTipo === "factura")) ? "factura" : "ticket"
  );
  const [registro, setRegistro] = useState<"con" | "sin">(pedido.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo ? "sin" : "con");
  const [ficha, setFicha] = useState<FichaFiscal>(fichaDelPedido);
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ total: number; facturaNumero: string | null } | null>(null);

  // Sin un punto de expedición vigente en esta computadora no se ofrece factura: siempre ticket.
  const comprobanteEfectivo = puedeFacturar ? comprobante : "ticket";
  const esFactura = comprobanteEfectivo === "factura";
  const conRegistro = esFactura && registro === "con";
  const cantidadProductos = pedido.items.reduce((s, i) => s + i.cantidad, 0);
  const esDelivery = pedido.tipoEntrega === "delivery";

  async function cobrar() {
    if (cobrando) return;
    setError(null);
    if (bloqueadoSinFacturar) {
      setError(textoBloqueo);
      return;
    }
    if (conRegistro && (!ficha.numero.trim() || !ficha.razon.trim())) {
      setError("Para factura con registro fiscal hacen falta el número y la razón social.");
      return;
    }
    setCobrando(true);
    // Si el servidor falla por algo inesperado la llamada lanza en vez de devolver {ok:false}: sin este try la pantalla se
    // quedaría para siempre en "Cobrando…".
    let r: Awaited<ReturnType<typeof cobrarPedido>>;
    try {
      r = await cobrarPedido(pedido.id, {
        forma,
        comprobante: comprobanteEfectivo,
        registroFiscal: esFactura ? registro : undefined,
        facturaTipoIdentificacion: conRegistro ? ficha.tipo : undefined,
        facturaRuc: conRegistro ? ficha.numero.trim() : undefined,
        facturaRazonSocial: conRegistro ? ficha.razon.trim() : undefined,
        facturaEmail: conRegistro ? ficha.email.trim() || undefined : undefined,
        // Para que el servidor avise si el pedido cambió mientras se cobraba.
        totalMostrado: pedido.total,
      });
    } catch {
      setCobrando(false);
      setError("No se pudo confirmar el cobro. Antes de volver a intentar, fijate en Pedidos si el pedido quedó cobrado.");
      return;
    }
    setCobrando(false);
    if (!r.ok) {
      // El turno no está abierto: sin turno no se cobra, se va a abrir uno y se vuelve a este pedido (sigue abierto).
      if (r.sinTurno) {
        router.push(rutaParaAbrirTurno(`/admin/pedidos/${pedido.id}`));
        return;
      }
      setError(r.error);
      return;
    }
    setHecho({ total: r.total, facturaNumero: r.facturaNumero });
  }

  function terminar() {
    onCerrar();
    router.refresh();
  }

  // ------------------------------------------------------------------------------------------------ ya se cobró
  if (hecho) {
    return (
      <PanelLateral titulo="Pedido cobrado" onCerrar={terminar}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-5 py-10 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-exito text-[2.5rem] text-white">✓</span>
            <div>
              <p className="text-[1.2rem] font-semibold tracking-titular text-tinta">Pedido {formatearNumero(pedido.numero)} cobrado</p>
              <p className="cifra mt-1 text-[1.8rem] font-bold text-tinta">{formatearGuarani(hecho.total)}</p>
              <p className="mt-1 text-[0.82rem] text-tinta-media">
                {hecho.facturaNumero ? `Factura N° ${hecho.facturaNumero}` : "Con ticket"} · entró a la caja del turno
              </p>
            </div>
            <p className="max-w-xs text-[0.85rem] leading-snug text-tinta-media">
              El pedido ya no se puede modificar. Seguí con su recorrido: preparación{esDelivery ? ", repartidor, despacho" : ""} y entrega.
              El {hecho.facturaNumero ? "papel de la factura" : "ticket"} sale al despachar o entregar el pedido.
            </p>
            <a
              href={`/admin/pedidos/${pedido.id}/ticket`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "md")}
            >
              {hecho.facturaNumero ? "Ver / imprimir factura" : "Ver / imprimir ticket"}
            </a>
          </div>
          <div className="flex-none border-t border-linea px-4 py-3">
            <Boton tono="principal" tam="lg" className="w-full" onClick={terminar}>
              Listo
            </Boton>
          </div>
        </div>
      </PanelLateral>
    );
  }

  // ------------------------------------------------------------------- la forma de pago y el comprobante
  return (
    <PanelLateral
      titulo={`Cobrar el pedido ${formatearNumero(pedido.numero)}`}
      onCerrar={() => {
        if (!cobrando) onCerrar();
      }}
      ancho="ancho"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-azul/50 bg-superficie p-3.5 shadow-sm">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">A cobrar</p>
              <p className="truncate text-[0.85rem] text-tinta-media">
                {pedido.clienteNombre} · {cantidadProductos} {cantidadProductos === 1 ? "producto" : "productos"}
              </p>
              {pedido.descuento > 0 && (
                <p className="text-[0.76rem] text-tinta-suave">
                  {formatearGuarani(pedido.subtotal)} − descuento {formatearGuarani(pedido.descuento)}
                  {pedido.descuentoTipo === "porcentaje" && pedido.descuentoValor != null
                    ? ` (${textoPorcentaje(pedido.descuentoValor)}%)`
                    : ""}
                  {esDelivery && pedido.costoEnvio > 0 ? ` + envío ${formatearGuarani(pedido.costoEnvio)}` : ""}
                </p>
              )}
            </div>
            <p className="cifra flex-none text-[1.7rem] font-bold leading-none text-tinta">{formatearGuarani(pedido.total)}</p>
          </div>

          <div className={CAJA}>
            <p className={ROTULO}>Forma de pago</p>
            <div className="grid grid-cols-2 gap-2">
              {metodosPago.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setForma(m.value)}
                  aria-pressed={forma === m.value}
                  className={claseMetodo(forma === m.value)}
                >
                  <span aria-hidden="true" className="text-base leading-none">
                    {ICONOS_PAGO[m.value] ?? "💰"}
                  </span>
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[0.76rem] leading-snug text-tinta-suave">
              El pedido entra a la caja del turno abierto con la forma que elijas.
              {esDelivery && forma === "efectivo" ? " En efectivo, el repartidor tiene que traer esa plata de vuelta (Rendiciones)." : ""}
            </p>
          </div>

          {/* Solo se pregunta por factura si esta computadora puede emitirla (tiene un punto de expedición vigente), igual que en
              el Punto de Venta: sin folio no hay factura que ofrecer. */}
          {puedeFacturar && (
            <div className={CAJA}>
              <p className={ROTULO}>Comprobante</p>
              {diasParaVencerTimbrado != null && diasParaVencerTimbrado <= 30 && (
                <p className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.78rem] font-medium text-aviso">
                  El timbrado de esta estación vence en {diasParaVencerTimbrado} día{diasParaVencerTimbrado === 1 ? "" : "s"}.
                </p>
              )}
              {facturaObligatoria ? (
                <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.78rem] text-tinta-media">
                  Este local factura todas las ventas — no se puede cobrar con ticket.
                </p>
              ) : (
                <Segmentado<"ticket" | "factura">
                  opciones={[
                    { value: "ticket", label: "Ticket" },
                    { value: "factura", label: "Factura" },
                  ]}
                  valor={comprobante}
                  onChange={setComprobante}
                />
              )}
              {comprobante === "factura" && (
                <div className="flex flex-col gap-2 rounded-lg border border-linea bg-papel-suave p-3">
                  <Segmentado<"con" | "sin">
                    opciones={[
                      { value: "con", label: "Con registro fiscal" },
                      { value: "sin", label: "Sin registro fiscal" },
                    ]}
                    valor={registro}
                    onChange={setRegistro}
                    color="tinta"
                  />
                  {registro === "sin" ? (
                    <p className="text-[0.8rem] text-tinta-media">Se factura a Consumidor Final (Sin Nombre).</p>
                  ) : (
                    <CamposFiscalesCliente idBase="cobro-pedido-numero" ficha={ficha} onCambiar={setFicha} />
                  )}
                </div>
              )}
            </div>
          )}

          {!puedeFacturar && !facturaObligatoria && (
            <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.8rem] text-tinta-media">
              Esta computadora no tiene un punto de expedición vigente: se cobra con ticket.
            </p>
          )}
          {bloqueadoSinFacturar && (
            <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">{textoBloqueo}</p>
          )}

          {error && <MensajeError>{error}</MensajeError>}
        </div>

        <div className="flex flex-none gap-2 border-t border-linea px-4 py-3">
          <button type="button" onClick={onCerrar} disabled={cobrando} className={clasesBoton("peligro", "lg")}>
            Cancelar
          </button>
          <Boton tono="principal" tam="lg" className="flex-1" disabled={cobrando || bloqueadoSinFacturar} onClick={() => void cobrar()}>
            {cobrando ? "Cobrando…" : `Cobrar ${formatearGuarani(pedido.total)}`}
          </Boton>
        </div>
      </div>
    </PanelLateral>
  );
}
