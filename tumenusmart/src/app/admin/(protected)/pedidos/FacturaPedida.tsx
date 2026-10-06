"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { Segmentado } from "@/components/Segmentado";
import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { limpiarTexto, validarDatosFiscales } from "@/lib/datos-fiscales";
import {
  buscarClienteFiscalPorNumero,
  emitirFacturaPedido,
  resolverPedidoSinFactura,
  type ClienteFiscalEncontrado,
} from "./actions";

/**
 * La factura de un pedido de la carta digital. El cliente la pidió y mandó sus datos por WhatsApp, pero esos datos no están en el
 * sistema: la caja los compara antes en la página de la DNIT (y lo resuelve con el cliente por WhatsApp o por llamada), los tipea
 * acá y emite la factura. Es el filtro de seguridad: si hay un error, es de tipeo de la caja y no un dato mal escrito por el
 * cliente apurado.
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
            Sus datos llegaron en el mensaje de WhatsApp y no están cargados en el sistema: cargalos a mano con “Emitir factura”.
            Hasta entonces el pedido no pasa a {tipoEntrega === "delivery" ? "“En despacho”" : "“Entregado”"}.
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

/** Lo que dijo la lupa: el cliente ya existe (uno o varios parecidos), no existe (se crea al emitir) o falló la búsqueda. */
type Busqueda =
  | { estado: "existe" | "varios"; resultados: ClienteFiscalEncontrado[] }
  | { estado: "nuevo" }
  | { estado: "error"; mensaje: string };

const FILA_RESUMEN = "flex items-baseline justify-between gap-3";
const ROTULO_RESUMEN = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";

/**
 * Tres pasos: (1) cargar los datos (la caja ya los comparó en la DNIT y los resolvió con el cliente por WhatsApp o por llamada:
 * acá no se vuelve a pedir esa verificación); (2) un resumen para revisar antes de emitir; (3) la factura emitida. El servidor
 * vuelve a validar lo mínimo: lo de acá es para avisar a tiempo, no para dar nada por bueno.
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
  const [error, setError] = useState<string | null>(null);
  const [numeroEmitido, setNumeroEmitido] = useState("");
  const [emitiendo, iniciar] = useTransition();
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null);
  const [buscando, setBuscando] = useState(false);

  /** Trae al formulario los datos de un cliente que ya estaba en el sistema. */
  function aplicar(c: ClienteFiscalEncontrado) {
    setNumero(c.numeroIdentificacion);
    setTipo(TIPOS_IDENTIFICACION_FISCAL.some((t) => t.valor === c.tipoIdentificacion) ? c.tipoIdentificacion : "ruc");
    setRazon(c.razonSocial);
    setEmail(c.email ?? "");
  }

  /** La lupa: ¿ya existe este número en el sistema? Si existe se cargan sus datos; si no, se crea al emitir. */
  function buscar() {
    const texto = limpiarTexto(numero);
    if (texto.length < 3 || buscando) return;
    setBusqueda(null);
    setBuscando(true);
    buscarClienteFiscalPorNumero(texto)
      .then((r) => {
        const exactos = r.filter((c) => c.numeroIdentificacion.toLowerCase() === texto.toLowerCase());
        if (r.length === 0) {
          setBusqueda({ estado: "nuevo" });
        } else if (exactos.length === 1) {
          aplicar(exactos[0]);
          setBusqueda({ estado: "existe", resultados: exactos });
        } else {
          setBusqueda({ estado: "varios", resultados: r });
        }
      })
      .catch(() => setBusqueda({ estado: "error", mensaje: "No se pudo buscar. Revisá la conexión y probá de nuevo." }))
      .finally(() => setBuscando(false));
  }

  const modoServidor = modo === "con" ? "con_registro" : "sin_nombre";

  function pasarARevisar() {
    setError(null);
    const r = validarDatosFiscales({
      modo: modoServidor,
      tipoIdentificacion: tipo,
      numeroIdentificacion: numero,
      razonSocial: razon,
      email,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
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

  return (
    <PanelLateral titulo={`Emitir factura · pedido ${numeroPedido}`} onCerrar={onCerrar}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {paso === "datos" && (
          <>
            <Segmentado<"con" | "sin">
              opciones={[
                { value: "con", label: "Con registro fiscal" },
                { value: "sin", label: "Sin registro fiscal" },
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
                {/* Primero el número, con la lupa: si el cliente ya está en el sistema se traen sus datos; si no, se crea al emitir. */}
                <div>
                  <label htmlFor="factura-numero" className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">
                    Número de documento
                  </label>
                  <span className="mb-1.5 block text-[0.78rem] text-tinta-suave">
                    {tipo === "ruc" ? "Con su dígito verificador: 80012345-6" : "Tocá la lupa para ver si ya está en el sistema"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Entrada
                      id="factura-numero"
                      value={numero}
                      onChange={(e) => {
                        setNumero(e.target.value);
                        setBusqueda(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          buscar();
                        }
                      }}
                      placeholder={tipo === "ruc" ? "80012345-6" : ""}
                      maxLength={30}
                      autoComplete="off"
                      className="min-w-0 flex-1"
                    />
                    <button
                      type="button"
                      onClick={buscar}
                      disabled={buscando || limpiarTexto(numero).length < 3}
                      aria-label="Buscar en el sistema si ya existe"
                      title="Buscar en el sistema si ya existe"
                      className={`${clasesBoton("navegar", "md")} flex-none !px-3`}
                    >
                      {buscando ? (
                        "…"
                      ) : (
                        <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.5-3.5" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {busqueda?.estado === "existe" && (
                    <p className="mt-1.5 rounded-lg border border-exito/40 bg-exito-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-exito">
                      Ya existe en el sistema: se cargaron su tipo de documento, razón social y correo. Revisalos.
                    </p>
                  )}
                  {busqueda?.estado === "nuevo" && (
                    <p className="mt-1.5 rounded-lg border border-amarillo/60 bg-amarillo-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-amarillo-oscuro">
                      No existe en el sistema: cargá la razón social y se crea al emitir la factura.
                    </p>
                  )}
                  {busqueda?.estado === "varios" && (
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      <p className="text-[0.78rem] font-medium text-tinta-media">Hay varios parecidos: elegí el que corresponde.</p>
                      {busqueda.resultados.map((c) => (
                        <button
                          key={`${c.tipoIdentificacion}-${c.numeroIdentificacion}`}
                          type="button"
                          onClick={() => {
                            aplicar(c);
                            setBusqueda({ estado: "existe", resultados: [c] });
                          }}
                          className="rounded-lg border-2 border-azul/50 bg-azul-luz/40 px-2.5 py-1.5 text-left hover:bg-azul-luz"
                        >
                          <span className="cifra block text-[0.86rem] font-semibold text-tinta">{c.numeroIdentificacion}</span>
                          <span className="block text-[0.8rem] text-tinta-media">
                            {c.razonSocial} · {etiquetaTipoIdentificacion(c.tipoIdentificacion)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {busqueda?.estado === "error" && (
                    <p className="mt-1.5 text-[0.78rem] font-medium text-peligro">{busqueda.mensaje}</p>
                  )}
                </div>
                <Campo etiqueta="Tipo de documento">
                  <Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    {TIPOS_IDENTIFICACION_FISCAL.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Razón social">
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
            <button type="button" disabled={emitiendo} onClick={emitir} className={clasesBoton("principal", "md")}>
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
