"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { Segmentado } from "@/components/Segmentado";
import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { limpiarTexto, revisarRuc, validarDatosFiscales } from "@/lib/datos-fiscales";
import { emitirFacturaPedido, resolverPedidoSinFactura } from "./actions";

/**
 * La factura de un pedido de la carta digital. El cliente la pidió y mandó sus datos por WhatsApp, pero esos datos no están en el
 * sistema: la caja los consulta en la DNIT, los tipea acá y emite la factura. Es el filtro de seguridad: si hay un error, es de
 * tipeo de la caja y no un dato mal escrito por el cliente apurado.
 *
 * Con la factura pedida y sin emitir, el pedido no pasa a "En despacho" (delivery) ni a "Entregado". La salida alternativa es
 * dejarlo sin factura, con motivo (no se ofrece en un local que factura todas las ventas).
 */
export function FacturaPedida({
  orderId,
  numeroPedido,
  tipoEntrega,
  facturaObligatoria,
  pendiente,
}: {
  orderId: string;
  numeroPedido: string;
  tipoEntrega: string;
  /** El local factura TODAS las ventas: no hay "sin factura", la salida es emitirla "sin nombre". */
  facturaObligatoria: boolean;
  /** El cliente pidió factura y todavía no se emitió. */
  pendiente: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, iniciar] = useTransition();

  function dejarSinFactura() {
    setError(null);
    iniciar(async () => {
      try {
        const r = await resolverPedidoSinFactura(orderId, motivo);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setDescartando(false);
        router.refresh();
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  return (
    <>
      {pendiente && (
        <div className="mt-2.5 rounded-lg border-2 border-amarillo/60 bg-amarillo-luz p-3">
          <p className="text-[0.88rem] font-semibold text-amarillo-oscuro">El cliente pidió factura — datos pendientes</p>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Sus datos llegaron en el mensaje de WhatsApp y no están cargados en el sistema. Consultá la razón social y el RUC en la
            DNIT y cargalos a mano con “Emitir factura”. Hasta entonces el pedido no pasa a{" "}
            {tipoEntrega === "delivery" ? "“En despacho”" : "“Entregado”"}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setAbierto(true)} className={clasesBoton("principal", "sm")}>
              Emitir factura
            </button>
            {!facturaObligatoria && (
              <button type="button" onClick={() => setDescartando(true)} className={clasesBoton("peligro", "sm")}>
                Entregar sin factura
              </button>
            )}
          </div>

          {descartando && (
            <div className="mt-2.5 flex flex-col gap-2 rounded-lg border-2 border-peligro/40 bg-peligro-luz p-2.5">
              <p className="text-[0.8rem] text-tinta">
                El pedido sigue como ticket. ¿Por qué se entrega sin la factura que pidió el cliente? Queda en el historial.
              </p>
              <Entrada
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo: el cliente se arrepintió, no tenía los datos…"
                maxLength={200}
              />
              {error && <MensajeError>{error}</MensajeError>}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={trabajando || motivo.trim().length < 3}
                  onClick={dejarSinFactura}
                  className={clasesBoton("peligro", "sm")}
                >
                  {trabajando ? "Guardando…" : "Sí, sin factura"}
                </button>
                <button
                  type="button"
                  disabled={trabajando}
                  onClick={() => {
                    setDescartando(false);
                    setError(null);
                  }}
                  className={clasesBoton("navegar", "sm")}
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {abierto && (
        <PanelEmitirFactura
          orderId={orderId}
          numeroPedido={numeroPedido}
          tipoEntrega={tipoEntrega}
          onCerrar={() => {
            setAbierto(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

type Paso = "datos" | "revisar" | "listo";

const FILA_RESUMEN = "flex items-baseline justify-between gap-3";
const ROTULO_RESUMEN = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";

/**
 * Tres pasos: (1) cargar los datos tal como figuran en la DNIT; (2) revisarlos en un resumen y confirmar que se verificaron
 * (y, si el dígito verificador del RUC no coincide con el cálculo, confirmarlo aparte); (3) la factura emitida. El servidor vuelve
 * a validar todo: lo de acá es para avisar a tiempo, no para dar nada por bueno.
 */
function PanelEmitirFactura({
  orderId,
  numeroPedido,
  tipoEntrega,
  onCerrar,
}: {
  orderId: string;
  numeroPedido: string;
  tipoEntrega: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("datos");
  const [modo, setModo] = useState<"con" | "sin">("con");
  const [tipo, setTipo] = useState<string>(TIPOS_IDENTIFICACION_FISCAL[0].valor);
  const [numero, setNumero] = useState("");
  const [razon, setRazon] = useState("");
  const [email, setEmail] = useState("");
  const [verificado, setVerificado] = useState(false);
  const [dvConfirmado, setDvConfirmado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numeroEmitido, setNumeroEmitido] = useState("");
  const [emitiendo, iniciar] = useTransition();

  const modoServidor = modo === "con" ? "con_registro" : "sin_nombre";
  const revisionRuc = modo === "con" && tipo === "ruc" ? revisarRuc(numero) : null;
  const dvDistinto = revisionRuc?.estado === "dv_distinto";

  function pasarARevisar() {
    setError(null);
    // El dígito verificador se confirma en el paso siguiente: acá solo se frena lo que seguro está mal.
    const r = validarDatosFiscales({
      modo: modoServidor,
      tipoIdentificacion: tipo,
      numeroIdentificacion: numero,
      razonSocial: razon,
      email,
      dvConfirmado: true,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setVerificado(false);
    setDvConfirmado(false);
    setPaso("revisar");
  }

  function emitir() {
    setError(null);
    iniciar(async () => {
      try {
        const r = await emitirFacturaPedido(orderId, {
          modo: modoServidor,
          tipoIdentificacion: tipo,
          numeroIdentificacion: numero,
          razonSocial: razon,
          email,
          dvConfirmado,
          verificadoEnDnit: verificado,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setNumeroEmitido(r.numero);
        setPaso("listo");
        router.refresh();
      } catch {
        setError("No se pudo emitir la factura. Revisá la conexión y probá de nuevo: no se consumió ningún número.");
      }
    });
  }

  const puedeEmitir = !emitiendo && (modo === "sin" || (verificado && (!dvDistinto || dvConfirmado)));

  return (
    <PanelLateral titulo={`Emitir factura · pedido ${numeroPedido}`} onCerrar={onCerrar}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {paso === "datos" && (
          <>
            <div className="flex flex-col gap-2 rounded-lg border-2 border-azul/50 bg-azul-luz/40 p-3">
              <p className="text-[0.82rem] leading-snug text-tinta">
                Los datos del cliente llegaron por WhatsApp. <strong className="font-semibold">Antes de cargarlos, consultá la razón
                social y el RUC en la DNIT</strong> y escribí acá lo que figura ahí, no lo que escribió el cliente.
              </p>
              <div>
                <a
                  href="https://www.dnit.gov.py"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clasesBoton("navegar", "sm")}
                >
                  Abrir el sitio de la DNIT
                </a>
              </div>
            </div>

            <Segmentado<"con" | "sin">
              opciones={[
                { value: "con", label: "Con datos del cliente" },
                { value: "sin", label: "Sin nombre" },
              ]}
              valor={modo}
              onChange={(v) => {
                setModo(v);
                setError(null);
              }}
              color="tinta"
            />

            {modo === "sin" ? (
              <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.82rem] text-tinta-media">
                Se factura a Consumidor Final ({SIN_REGISTRO_FISCAL.etiquetaDisplay}): sin razón social ni número de documento.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <Campo etiqueta="Tipo de documento">
                  <Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPOS_IDENTIFICACION_FISCAL.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Número" ayuda={tipo === "ruc" ? "Con su dígito verificador: 80012345-6" : undefined}>
                  <Entrada
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder={tipo === "ruc" ? "80012345-6" : ""}
                    maxLength={30}
                    autoComplete="off"
                    invalido={revisionRuc?.estado === "formato" || revisionRuc?.estado === "dv_distinto"}
                  />
                  {revisionRuc?.estado === "formato" && (
                    <p className="mt-1.5 text-[0.78rem] font-medium text-peligro">{revisionRuc.mensaje}</p>
                  )}
                  {revisionRuc?.estado === "dv_distinto" && (
                    <p className="mt-1.5 text-[0.78rem] font-medium text-peligro">{revisionRuc.mensaje}</p>
                  )}
                  {revisionRuc?.estado === "ok" && (
                    <p className="mt-1.5 text-[0.78rem] font-medium text-exito">El dígito verificador coincide.</p>
                  )}
                </Campo>
                <Campo etiqueta="Razón social" ayuda="Tal como figura en la DNIT">
                  <Entrada value={razon} onChange={(e) => setRazon(e.target.value)} maxLength={120} autoComplete="off" />
                </Campo>
                <Campo etiqueta="Correo (opcional)">
                  <Entrada
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={120}
                    autoComplete="off"
                  />
                </Campo>
              </div>
            )}
            {error && <MensajeError>{error}</MensajeError>}
          </>
        )}

        {paso === "revisar" && (
          <>
            <p className="text-[0.85rem] text-tinta">
              Revisá los datos: una vez emitida, la factura no se corrige (hay que anularla y hacer otra).
            </p>
            <div className="flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-azul-luz/30 p-3">
              {modo === "sin" ? (
                <p className="text-[0.95rem] font-semibold text-tinta">Consumidor Final ({SIN_REGISTRO_FISCAL.etiquetaDisplay})</p>
              ) : (
                <>
                  <div className={FILA_RESUMEN}>
                    <span className={ROTULO_RESUMEN}>{etiquetaTipoIdentificacion(tipo)}</span>
                    <span className="cifra text-[1rem] font-semibold text-tinta">{limpiarTexto(numero)}</span>
                  </div>
                  <div className={FILA_RESUMEN}>
                    <span className={ROTULO_RESUMEN}>Razón social</span>
                    <span className="text-right text-[1rem] font-semibold text-tinta">{limpiarTexto(razon)}</span>
                  </div>
                  {limpiarTexto(email) && (
                    <div className={FILA_RESUMEN}>
                      <span className={ROTULO_RESUMEN}>Correo</span>
                      <span className="text-right text-[0.9rem] text-tinta">{limpiarTexto(email)}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {modo === "con" && (
              <div className="flex flex-col gap-2.5">
                {dvDistinto && revisionRuc?.estado === "dv_distinto" && (
                  <label className="flex items-start gap-2 rounded-lg border-2 border-peligro/50 bg-peligro-luz p-2.5 text-[0.82rem] text-tinta">
                    <input
                      type="checkbox"
                      checked={dvConfirmado}
                      onChange={(e) => setDvConfirmado(e.target.checked)}
                      className="mt-0.5 h-4 w-4 flex-none accent-peligro"
                    />
                    <span>
                      <strong className="font-semibold text-peligro">El dígito verificador no coincide</strong> con el cálculo (debería
                      ser {revisionRuc.esperado}). Si en la DNIT figura exactamente así, marcá esta casilla; si no, volvé y corregilo.
                    </span>
                  </label>
                )}
                <label className="flex items-start gap-2 rounded-lg border border-linea bg-papel-suave p-2.5 text-[0.82rem] text-tinta">
                  <input
                    type="checkbox"
                    checked={verificado}
                    onChange={(e) => setVerificado(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-none accent-azul"
                  />
                  <span>Revisé la razón social y el número en la consulta de la DNIT y coinciden con lo que cargué.</span>
                </label>
              </div>
            )}
            {error && <MensajeError>{error}</MensajeError>}
          </>
        )}

        {paso === "listo" && (
          <div className="flex flex-col gap-2 rounded-xl border-2 border-exito/50 bg-exito-luz p-4">
            <p className="text-[1rem] font-semibold text-exito">Factura emitida</p>
            <p className="cifra text-[1.1rem] font-semibold text-tinta">N° {numeroEmitido}</p>
            <p className="text-[0.82rem] leading-snug text-tinta-media">
              Se imprime sola al pasar el pedido a {tipoEntrega === "delivery" ? "“En despacho”" : "“Entregado”"}. Ya se puede
              seguir con el pedido.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-none flex-wrap justify-end gap-2 border-t border-linea bg-superficie px-4 py-3">
        {paso === "datos" && (
          <>
            <button type="button" onClick={onCerrar} className={clasesBoton("peligro", "md")}>
              Cancelar
            </button>
            <button type="button" onClick={pasarARevisar} className={clasesBoton("principal", "md")}>
              Revisar datos
            </button>
          </>
        )}
        {paso === "revisar" && (
          <>
            <button
              type="button"
              disabled={emitiendo}
              onClick={() => {
                setPaso("datos");
                setError(null);
              }}
              className={clasesBoton("navegar", "md")}
            >
              Corregir
            </button>
            <button type="button" disabled={!puedeEmitir} onClick={emitir} className={clasesBoton("principal", "md")}>
              {emitiendo ? "Emitiendo…" : "Emitir factura"}
            </button>
          </>
        )}
        {paso === "listo" && (
          <button type="button" onClick={onCerrar} className={clasesBoton("navegar", "md")}>
            Listo
          </button>
        )}
      </div>
    </PanelLateral>
  );
}
