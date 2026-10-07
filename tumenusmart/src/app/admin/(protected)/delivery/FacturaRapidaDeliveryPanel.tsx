"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, MensajeError, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL, etiquetaCortaTipoIdentificacion } from "@/lib/tipo-cliente";
import { imprimirComprobante, type ResultadoImpresion } from "@/lib/impresion-comprobantes";
import { EntradaConLupa } from "../pos/EntradaConLupa";
import { ClienteFiscalModal, type DatosClienteFiscal } from "../pos/ClienteFiscalModal";
import { buscarClientePorIdentificacion } from "../pos/actions";
import { emitirFacturaDelivery } from "./actions";
import type { CuentaDeliveryFila } from "./tipos-delivery";

/** Lo que se le dice a la persona sobre cómo salió la impresión de la factura. */
export function textoImpresionFactura(r: ResultadoImpresion): string {
  if (r.ok) {
    return r.omitida
      ? "Esta estación está configurada para no imprimir la factura (0 copias)."
      : "La factura salió en la impresora.";
  }
  if (r.motivo === "sin_impresora") return "Esta estación no tiene una impresora asignada a la factura.";
  if (r.motivo === "sin_qz") return "QZ Tray no está conectado en esta computadora.";
  return "No se pudo imprimir sola.";
}

/** La dirección de donde sale la factura de una cuenta de delivery, en texto plano para la impresora. */
export function rutaCrudoFactura(cuentaId: string): string {
  return `/admin/delivery/${cuentaId}/factura/crudo`;
}

/**
 * "Factura rápida" de una cuenta de delivery: emite e imprime SOLO la factura, con los datos del cliente (ya vienen de la ficha que se
 * cargó al abrir la cuenta), sin cobrar y sin registrar la venta. Sirve para que el repartidor salga con todos los documentos. Después, al
 * cobrar la cuenta, la venta usa esta misma factura.
 *
 * Vive fuera del detalle de la cuenta por la misma razón que el panel de cobro: al emitirse la factura la lista se actualiza y este panel
 * tiene que seguir ahí para mostrar cómo salió la impresión.
 */
export function FacturaRapidaDeliveryPanel({
  cuenta,
  diasParaVencerTimbrado,
  nombreImpresora,
  onCerrar,
}: {
  cuenta: CuentaDeliveryFila;
  diasParaVencerTimbrado: number | null;
  nombreImpresora: string | null;
  onCerrar: () => void;
}) {
  const router = useRouter();

  // La ficha que se cargó al abrir la cuenta: la factura arranca con esos datos y, con ellos, "con registro fiscal".
  const ficha = cuenta.ficha;
  const [registroFiscal, setRegistroFiscal] = useState<"con" | "sin">("con");
  const [numero, setNumero] = useState(ficha?.numero ?? "");
  const [razonSocial, setRazonSocial] = useState(ficha?.razon ?? "");
  const [tipoId, setTipoId] = useState<string>(ficha?.tipo ?? TIPOS_IDENTIFICACION_FISCAL[0].valor);
  const [email, setEmail] = useState(ficha?.email ?? "");
  const [encontrado, setEncontrado] = useState(!!ficha);
  const [esNuevo, setEsNuevo] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [modalCliente, setModalCliente] = useState(false);

  const [emitiendo, setEmitiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ numero: string; impresion: ResultadoImpresion | null } | null>(null);
  const [reimprimiendo, setReimprimiendo] = useState(false);

  const conRegistro = registroFiscal === "con";

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

  async function emitir() {
    setError(null);
    if (conRegistro && (!numero.trim() || !razonSocial.trim())) {
      setError("Para factura con registro fiscal hacen falta el número y la razón social.");
      return;
    }
    setEmitiendo(true);
    // Si el servidor falla por algo inesperado la llamada lanza en vez de devolver {ok:false}: sin este try la pantalla se quedaría
    // para siempre en "Emitiendo…".
    let r: Awaited<ReturnType<typeof emitirFacturaDelivery>>;
    try {
      r = await emitirFacturaDelivery(cuenta.id, {
        facturaTipoIdentificacion: conRegistro ? tipoId : SIN_REGISTRO_FISCAL.tipo,
        facturaNumeroIdentificacion: conRegistro ? numero.trim() : undefined,
        facturaRazonSocial: conRegistro ? razonSocial : undefined,
        facturaEmail: conRegistro ? email.trim() || undefined : undefined,
        // Para que el servidor avise si la cuenta cambió mientras se emitía.
        totalMostrado: cuenta.totales.total,
      });
    } catch {
      setEmitiendo(false);
      setError("No se pudo emitir la factura. Antes de volver a intentar, fijate en el detalle de la cuenta si la factura quedó emitida.");
      return;
    }
    setEmitiendo(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setHecho({ numero: r.numero, impresion: null });
    // La factura sale sola en la impresora de esta estación; si no se puede, se avisa y queda para verla e imprimirla a mano.
    const impresion = await imprimirComprobante(rutaCrudoFactura(cuenta.id), nombreImpresora);
    setHecho({ numero: r.numero, impresion });
  }

  async function reimprimir() {
    if (!hecho) return;
    setReimprimiendo(true);
    const impresion = await imprimirComprobante(rutaCrudoFactura(cuenta.id), nombreImpresora);
    setHecho({ ...hecho, impresion });
    setReimprimiendo(false);
  }

  function terminar() {
    onCerrar();
    router.refresh();
  }

  // ------------------------------------------------------------------------------------------------ ya salió la factura
  if (hecho) {
    return (
      <PanelLateral titulo="Factura emitida" onCerrar={terminar}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-5 py-10 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-exito text-[2.5rem] text-white">✓</span>
            <div>
              <p className="text-[1.2rem] font-semibold tracking-titular text-tinta">Factura {hecho.numero}</p>
              <p className="cifra mt-1 text-[1.8rem] font-bold text-tinta">{formatearGuarani(cuenta.totales.total)}</p>
              <p className="mt-1 text-[0.82rem] text-tinta-media">
                Delivery {formatearNumero(cuenta.numero)} · todavía sin cobrar
              </p>
            </div>
            <p className="max-w-xs text-[0.85rem] leading-snug text-tinta-media">
              {hecho.impresion === null ? "Imprimiendo la factura…" : textoImpresionFactura(hecho.impresion)}
              {hecho.impresion && !hecho.impresion.ok && " Podés verla e imprimirla a mano desde el botón de abajo."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a href={`/admin/delivery/${cuenta.id}/factura`} target="_blank" rel="noopener noreferrer" className={clasesBoton("navegar", "md")}>
                Ver / imprimir factura
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

  // ------------------------------------------------------------------------------- a quién se factura
  return (
    <>
      <PanelLateral
        titulo={`Factura rápida · delivery ${formatearNumero(cuenta.numero)}`}
        // Escape cierra el cuadro de encima (crear cliente), no este panel.
        onCerrar={() => {
          if (!modalCliente && !emitiendo) onCerrar();
        }}
        ancho="ancho"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-azul/50 bg-superficie p-3.5 shadow-sm">
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">A facturar</p>
                <p className="truncate text-[0.85rem] text-tinta-media">{cuenta.clienteNombre}</p>
              </div>
              <p className="cifra flex-none text-[1.7rem] font-bold leading-none text-tinta">{formatearGuarani(cuenta.totales.total)}</p>
            </div>

            <p className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.8rem] font-medium text-aviso">
              Sale solo la factura: no se cobra ni se registra la venta. La cuenta queda sin cambios hasta cobrarla.
            </p>

            <div className="flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Factura a nombre de</p>
              {diasParaVencerTimbrado != null && diasParaVencerTimbrado <= 30 && (
                <p className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.78rem] font-medium text-aviso">
                  El timbrado de esta estación vence en {diasParaVencerTimbrado} día{diasParaVencerTimbrado === 1 ? "" : "s"}.
                </p>
              )}
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
                    <div className="flex flex-col items-start gap-1 rounded-lg bg-papel-suave px-3 py-2">
                      <DatoDelCliente etiqueta="Razón social" valor={razonSocial} />
                      <DatoDelCliente etiqueta={etiquetaCortaTipoIdentificacion(tipoId)} valor={numero.trim()} />
                      {email && <DatoDelCliente etiqueta="Correo" valor={email} />}
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
                      <div className="flex flex-col items-start gap-1 rounded-lg bg-papel-suave px-3 py-2">
                        <DatoDelCliente etiqueta="Razón social" valor={razonSocial} />
                        <DatoDelCliente etiqueta={etiquetaCortaTipoIdentificacion(tipoId)} valor={numero.trim()} />
                        {email && <DatoDelCliente etiqueta="Correo" valor={email} />}
                        <button type="button" onClick={() => setModalCliente(true)} className="text-[0.76rem] font-medium text-brand-texto underline">
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
                    <p className="text-[0.74rem] text-tinta-suave">Tocá la lupa (o Enter) para completar los datos si ya es cliente.</p>
                  )}
                </>
              )}
            </div>

            {error && <MensajeError>{error}</MensajeError>}
          </div>

          <div className="flex flex-none gap-2 border-t border-linea px-4 py-3">
            <button type="button" onClick={onCerrar} disabled={emitiendo} className={clasesBoton("peligro", "lg")}>
              Cancelar
            </button>
            <Boton tono="principal" tam="lg" className="flex-1" disabled={emitiendo} onClick={() => void emitir()}>
              {emitiendo ? "Emitiendo…" : "Emitir e imprimir factura"}
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
    </>
  );
}

/** Una línea "Etiqueta: dato" del cliente, con la etiqueta apagada y el dato resaltado. */
function DatoDelCliente({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="text-[0.85rem] text-tinta">
      <span className="text-tinta-suave">{etiqueta}:</span> <span className="font-medium">{valor}</span>
    </p>
  );
}
