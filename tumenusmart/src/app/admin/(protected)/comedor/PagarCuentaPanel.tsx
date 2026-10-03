"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, MensajeError, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { textoPorcentaje } from "@/lib/descuento-venta";
import type { PagoCobro } from "@/lib/pago-venta";
import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL, etiquetaCortaTipoIdentificacion } from "@/lib/tipo-cliente";
import { imprimirComprobante, type ResultadoImpresion } from "@/lib/impresion-comprobantes";
import { CobrarPanel } from "../pos/CobrarPanel";
import { EntradaConLupa } from "../pos/EntradaConLupa";
import { ClienteFiscalModal, type DatosClienteFiscal } from "../pos/ClienteFiscalModal";
import { buscarClientePorIdentificacion } from "../pos/actions";
import { pagarCuenta } from "./actions";
import type { ContextoCaja, CuentaCajaFila } from "./ComedorCaja";

type Cobro = Extract<ContextoCaja["cobro"], { ok: true }>;

function textoImpresion(r: ResultadoImpresion): string {
  if (r.ok) return "El ticket salió en la impresora.";
  if (r.motivo === "sin_impresora") return "Esta estación no tiene una impresora asignada al ticket.";
  if (r.motivo === "sin_qz") return "QZ Tray no está conectado en esta computadora.";
  return "No se pudo imprimir solo.";
}

/**
 * Cobrar la cuenta de una mesa. Primero el comprobante —ticket o factura, según el punto de expedición de la estación y si
 * el local factura todo—, con los datos del cliente si es una factura con registro fiscal; después el mismo panel de cobro del
 * Punto de Venta (una forma de pago, o dividido). Al cobrar se genera la venta, la cuenta se cierra y sale el ticket.
 *
 * Vive fuera del detalle de la cuenta: al cobrarse, la cuenta desaparece de la lista, y este panel tiene que seguir ahí
 * para mostrar el comprobante.
 */
export function PagarCuentaPanel({
  cuenta,
  cobro,
  onCerrar,
}: {
  cuenta: CuentaCajaFila;
  cobro: Cobro;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const { puedeFacturar, diasParaVencerTimbrado, facturaObligatoria, nombreImpresoraTicket } = cobro;
  // Si el local factura todo y esta estación puede, no hay "Ticket" que elegir; si factura todo y no puede, no se cobra.
  const facturaForzada = facturaObligatoria && puedeFacturar;
  const bloqueadoSinFacturar = facturaObligatoria && !puedeFacturar;

  const [comprobanteTipo, setComprobanteTipo] = useState<"ticket" | "factura">(facturaForzada ? "factura" : "ticket");
  const [registroFiscal, setRegistroFiscal] = useState<"con" | "sin">("con");
  const [numero, setNumero] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [tipoId, setTipoId] = useState<string>(TIPOS_IDENTIFICACION_FISCAL[0].valor);
  const [email, setEmail] = useState("");
  const [encontrado, setEncontrado] = useState(false);
  const [esNuevo, setEsNuevo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [modalCliente, setModalCliente] = useState(false);

  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ ventaId: string; total: number; impresion: ResultadoImpresion | null } | null>(null);
  const [reimprimiendo, setReimprimiendo] = useState(false);

  const total = cuenta.totales.total;
  const cantidadProductos = cuenta.items.filter((i) => !i.anulado).reduce((s, i) => s + i.cantidad, 0);
  const esFactura = comprobanteTipo === "factura";
  const conRegistro = esFactura && registroFiscal === "con";

  async function buscarCliente() {
    const n = numero.trim();
    if (!n) return;
    setBuscando(true);
    setEsNuevo(false);
    setEncontrado(false);
    try {
      const r = await buscarClientePorIdentificacion(n);
      if (r.ok) {
        setRazonSocial(r.nombre);
        setTipoId(r.tipoIdentificacion);
        setEmail("");
        setEncontrado(true);
      } else {
        setRazonSocial("");
        setEsNuevo(true);
      }
    } catch {
      setError("No se pudo buscar el cliente. Probá de nuevo.");
    }
    setBuscando(false);
  }

  function continuarAlCobro() {
    setError(null);
    if (conRegistro && (!numero.trim() || !razonSocial.trim())) {
      setError("Para factura con registro fiscal hacen falta el número y la razón social.");
      return;
    }
    setErrorCobro(null);
    setMostrarCobro(true);
  }

  async function confirmarCobro(pagos: PagoCobro[]) {
    setCobrando(true);
    setErrorCobro(null);
    const sinRegistro = esFactura && registroFiscal === "sin";
    // Si el servidor falla por algo inesperado la llamada lanza en vez de devolver {ok:false}: sin este try la pantalla se
    // quedaría para siempre en "Cobrando…".
    let r: Awaited<ReturnType<typeof pagarCuenta>>;
    try {
      r = await pagarCuenta(cuenta.id, {
        pagos,
        comprobanteTipo,
        facturaTipoIdentificacion: esFactura ? (sinRegistro ? SIN_REGISTRO_FISCAL.tipo : tipoId) : undefined,
        facturaNumeroIdentificacion: conRegistro ? numero.trim() : undefined,
        facturaRazonSocial: conRegistro ? razonSocial : undefined,
        facturaEmail: conRegistro ? email.trim() || undefined : undefined,
      });
    } catch {
      setCobrando(false);
      setErrorCobro(
        "No se pudo confirmar el cobro. Antes de volver a intentar, fijate en el Historial de cuentas si la venta quedó registrada."
      );
      return;
    }
    setCobrando(false);
    if (!r.ok) {
      setErrorCobro(r.error);
      return;
    }
    setMostrarCobro(false);
    setHecho({ ventaId: r.ventaId, total: r.total, impresion: null });
    // El ticket sale solo en la impresora de esta estación; si no se puede, se avisa y queda para verlo e imprimirlo a mano.
    const impresion = await imprimirComprobante(`/admin/pos/venta/${r.ventaId}/ticket/crudo`, nombreImpresoraTicket);
    setHecho({ ventaId: r.ventaId, total: r.total, impresion });
  }

  async function reimprimir() {
    if (!hecho) return;
    setReimprimiendo(true);
    const impresion = await imprimirComprobante(`/admin/pos/venta/${hecho.ventaId}/ticket/crudo`, nombreImpresoraTicket);
    setHecho({ ...hecho, impresion });
    setReimprimiendo(false);
  }

  function terminar() {
    onCerrar();
    router.refresh();
  }

  // ------------------------------------------------------------------------------------------------ ya se cobró
  if (hecho) {
    return (
      <PanelLateral titulo="Cuenta cobrada" onCerrar={terminar}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-5 py-10 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-exito text-[2.5rem] text-white">✓</span>
            <div>
              <p className="text-[1.2rem] font-semibold tracking-titular text-tinta">Mesa {cuenta.mesa} cobrada</p>
              <p className="cifra mt-1 text-[1.8rem] font-bold text-tinta">{formatearGuarani(hecho.total)}</p>
              <p className="mt-1 text-[0.82rem] text-tinta-media">
                {esFactura ? "Con factura" : "Con ticket"} · la mesa quedó libre
              </p>
            </div>
            <p className="max-w-xs text-[0.85rem] leading-snug text-tinta-media">
              {hecho.impresion === null ? "Imprimiendo el ticket…" : textoImpresion(hecho.impresion)}
              {hecho.impresion && !hecho.impresion.ok && " Podés verlo e imprimirlo a mano desde el botón de abajo."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={`/admin/pos/venta/${hecho.ventaId}/ticket`}
                target="_blank"
                rel="noopener noreferrer"
                className={clasesBoton("navegar", "md")}
              >
                Ver / imprimir ticket
              </a>
              <button
                type="button"
                disabled={reimprimiendo || hecho.impresion === null}
                onClick={() => void reimprimir()}
                className={clasesBoton("suave", "md")}
              >
                {reimprimiendo ? "Imprimiendo…" : "Imprimir de nuevo"}
              </button>
            </div>
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

  // ------------------------------------------------------------------------------- el comprobante y a quién se factura
  return (
    <>
      <PanelLateral
        titulo={`Cobrar la mesa ${cuenta.mesa}`}
        // Escape cierra el cuadro de encima (crear cliente), no este panel.
        onCerrar={() => {
          if (!modalCliente && !mostrarCobro) onCerrar();
        }}
        ancho="ancho"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-azul/50 bg-superficie p-3.5 shadow-sm">
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">A cobrar</p>
                <p className="text-[0.85rem] text-tinta-media">
                  Mesa {cuenta.mesa} · Cuenta {formatearNumero(cuenta.numero)} · {cantidadProductos}{" "}
                  {cantidadProductos === 1 ? "producto" : "productos"}
                </p>
                {cuenta.totales.descuento > 0 && (
                  <p className="text-[0.76rem] text-tinta-suave">
                    {formatearGuarani(cuenta.totales.subtotal)} − descuento {formatearGuarani(cuenta.totales.descuento)}
                    {cuenta.totales.porcentaje != null ? ` (${textoPorcentaje(cuenta.totales.porcentaje)}%)` : ""}
                  </p>
                )}
              </div>
              <p className="cifra flex-none text-[1.7rem] font-bold leading-none text-tinta">{formatearGuarani(total)}</p>
            </div>

            {puedeFacturar && (
              <div className="flex flex-col gap-2">
                <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Comprobante</p>
                {diasParaVencerTimbrado != null && diasParaVencerTimbrado <= 30 && (
                  <p className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.78rem] font-medium text-aviso">
                    El timbrado de esta estación vence en {diasParaVencerTimbrado} día{diasParaVencerTimbrado === 1 ? "" : "s"}.
                  </p>
                )}
                {facturaObligatoria ? (
                  <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.78rem] text-tinta-media">
                    Este local factura todas las ventas — no se puede cobrar como ticket.
                  </p>
                ) : (
                  <Segmentado
                    opciones={[
                      { value: "ticket", label: "Ticket" },
                      { value: "factura", label: "Factura" },
                    ]}
                    valor={comprobanteTipo}
                    onChange={setComprobanteTipo}
                  />
                )}
                {esFactura && (
                  <div className="flex flex-col gap-2 rounded-lg border border-linea bg-papel-suave p-3">
                    <Segmentado
                      opciones={[
                        { value: "con", label: "Con registro fiscal" },
                        { value: "sin", label: "Sin registro fiscal" },
                      ]}
                      valor={registroFiscal}
                      onChange={setRegistroFiscal}
                      color="tinta"
                    />
                    {registroFiscal === "sin" ? (
                      <p className="text-[0.8rem] text-tinta-media">Se factura a Consumidor Final (Sin Nombre).</p>
                    ) : (
                      <>
                        <Campo etiqueta="N° de RUC / Cédula / etc.">
                          <EntradaConLupa
                            value={numero}
                            onChange={(e) => {
                              setNumero(e.target.value);
                              setEsNuevo(false);
                              setEncontrado(false);
                              setEmail("");
                            }}
                            onBuscar={() => void buscarCliente()}
                            buscando={buscando}
                            etiquetaBoton="Buscar cliente por RUC o cédula"
                            placeholder="80012345-6"
                          />
                        </Campo>
                        {encontrado ? (
                          <div className="flex flex-col items-start gap-1 rounded-lg bg-white px-3 py-2">
                            <DatoDelCliente etiqueta="Razón social" valor={razonSocial} />
                            <DatoDelCliente etiqueta={etiquetaCortaTipoIdentificacion(tipoId)} valor={numero.trim()} />
                            <button
                              type="button"
                              onClick={() => {
                                setEncontrado(false);
                                setEsNuevo(true);
                              }}
                              className="text-[0.76rem] font-medium text-brand-texto underline"
                            >
                              ¿No es este cliente?
                            </button>
                          </div>
                        ) : buscando ? (
                          <p className="text-[0.74rem] text-tinta-suave">Buscando…</p>
                        ) : esNuevo ? (
                          razonSocial.trim() ? (
                            <div className="flex flex-col items-start gap-1 rounded-lg bg-white px-3 py-2">
                              <DatoDelCliente etiqueta="Razón social" valor={razonSocial} />
                              <DatoDelCliente etiqueta={etiquetaCortaTipoIdentificacion(tipoId)} valor={numero.trim()} />
                              {email && <DatoDelCliente etiqueta="Correo" valor={email} />}
                              <button
                                type="button"
                                onClick={() => setModalCliente(true)}
                                className="text-[0.76rem] font-medium text-brand-texto underline"
                              >
                                Editar datos
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-[0.74rem] font-medium text-aviso">No existe ningún cliente con ese número.</p>
                              <Boton tono="nuevo" tam="sm" onClick={() => setModalCliente(true)}>
                                Crear cliente
                              </Boton>
                            </>
                          )
                        ) : (
                          <p className="text-[0.74rem] text-tinta-suave">
                            Tocá la lupa (o Enter) para completar los datos si ya es cliente.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {!puedeFacturar && !facturaObligatoria && (
              <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.8rem] text-tinta-media">
                Esta estación no tiene un punto de expedición vigente: se cobra con ticket.
              </p>
            )}

            {bloqueadoSinFacturar && (
              <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
                Este local exige facturar todas las ventas y esta estación no tiene un punto de expedición vigente asignado. No
                se puede cobrar hasta que el dueño le asigne uno en Puntos de expedición.
              </p>
            )}

            {error && <MensajeError>{error}</MensajeError>}
          </div>

          <div className="flex flex-none gap-2 border-t border-linea px-4 py-3">
            <button type="button" onClick={onCerrar} className={clasesBoton("peligro", "lg")}>
              Cancelar
            </button>
            <Boton tono="principal" tam="lg" className="flex-1" disabled={bloqueadoSinFacturar} onClick={continuarAlCobro}>
              Continuar al cobro
            </Boton>
          </div>
        </div>
      </PanelLateral>

      {modalCliente && (
        <ClienteFiscalModal
          numeroInicial={numero}
          tipoInicial={tipoId}
          onCerrar={() => setModalCliente(false)}
          onGuardar={(datos: DatosClienteFiscal) => {
            setNumero(datos.numeroIdentificacion);
            setTipoId(datos.tipoIdentificacion);
            setRazonSocial(datos.razonSocial);
            setEmail(datos.email);
            setModalCliente(false);
          }}
        />
      )}

      {mostrarCobro && (
        <CobrarPanel
          clienteNombre={conRegistro ? razonSocial : ""}
          cantidadItems={cantidadProductos}
          total={total}
          cobrando={cobrando}
          error={errorCobro}
          personal={[]}
          permiteCredito={false}
          bloqueClienteCredito={null}
          creditoListo={false}
          hayModalEncima={false}
          onCerrar={() => setMostrarCobro(false)}
          onCobrar={(pagos) => void confirmarCobro(pagos)}
        />
      )}
    </>
  );
}

/** Una línea "Etiqueta: dato" del cliente fiscal, con la etiqueta apagada y el dato resaltado. */
function DatoDelCliente({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="text-[0.85rem] text-tinta">
      <span className="text-tinta-suave">{etiqueta}:</span> <span className="font-medium">{valor}</span>
    </p>
  );
}
