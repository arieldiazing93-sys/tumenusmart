"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Entrada, Selector, MensajeError, Area } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { TIPOS_IDENTIFICACION_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import {
  buscarClientesFiscales,
  buscarParaRemision,
  remitirFactura,
  type ClienteEncontrado,
  type ResumenParaRemision,
} from "../actions";

/**
 * Orden del protocolo: primero se asigna el cliente (buscarlo por razón
 * social/nombre o RUC/Cédula; si no existe, se cargan sus datos acá mismo
 * y se crea solo al guardar), recién DESPUÉS se adjunta el N° de pedido o
 * de venta a remitir, y por último el motivo. Guardar genera la factura
 * nueva y abre el ticket para imprimir.
 *
 * A propósito el cliente NO se precarga con lo que decía la factura
 * anulada: partir de un dato que puede estar mal (es justo lo que se está
 * por corregir) es lo que se quiere evitar buscando al cliente de cero.
 */
export function NuevaFacturaForm() {
  const router = useRouter();

  // --- Paso 1: cliente ---
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [buscandoCliente, startBusquedaCliente] = useTransition();
  const [resultadosCliente, setResultadosCliente] = useState<ClienteEncontrado[] | null>(null);
  const [clienteAsignado, setClienteAsignado] = useState<ClienteEncontrado | null>(null);
  const [cargandoClienteNuevo, setCargandoClienteNuevo] = useState(false);

  const [tipoIdentificacion, setTipoIdentificacion] = useState(TIPOS_IDENTIFICACION_FISCAL[0].valor as string);
  const [numeroIdentificacion, setNumeroIdentificacion] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [email, setEmail] = useState("");

  // --- Paso 2: pedido/venta a remitir ---
  const [origen, setOrigen] = useState<"pedido" | "venta">("pedido");
  const [numeroBusqueda, setNumeroBusqueda] = useState("");
  const [buscando, startBusqueda] = useTransition();
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenParaRemision | null>(null);

  // --- Paso 3 ---
  const [motivo, setMotivo] = useState("");
  const [enviando, startEnvio] = useTransition();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  function elegirCliente(c: ClienteEncontrado) {
    setClienteAsignado(c);
    setTipoIdentificacion(c.tipoIdentificacion || TIPOS_IDENTIFICACION_FISCAL[0].valor);
    setNumeroIdentificacion(c.numeroIdentificacion ?? "");
    setRazonSocial(c.nombre);
    setEmail(c.email ?? "");
    setResultadosCliente(null);
    setCargandoClienteNuevo(false);
  }

  function buscarOtroCliente() {
    setClienteAsignado(null);
    setResultadosCliente(null);
    setCargandoClienteNuevo(false);
    setTipoIdentificacion(TIPOS_IDENTIFICACION_FISCAL[0].valor);
    setNumeroIdentificacion("");
    setRazonSocial("");
    setEmail("");
  }

  function buscarCliente() {
    const texto = busquedaCliente.trim();
    if (!texto) return;
    startBusquedaCliente(async () => {
      const r = await buscarClientesFiscales(texto);
      setResultadosCliente(r);
      // Ninguna coincidencia: se pasa derecho a cargar los datos de un
      // cliente nuevo, sin un paso de más para confirmarlo.
      if (r.length === 0) setCargandoClienteNuevo(true);
    });
  }

  function limpiarCuenta() {
    setResumen(null);
    setErrorEnvio(null);
  }

  function buscar() {
    const numero = parseInt(numeroBusqueda, 10);
    if (!Number.isFinite(numero) || numero <= 0) {
      setErrorBusqueda("Escribí un número de pedido o de venta válido.");
      return;
    }
    setErrorBusqueda(null);
    startBusqueda(async () => {
      const r = await buscarParaRemision(origen, numero);
      if (!r.ok) {
        setErrorBusqueda(r.error);
        setResumen(null);
        return;
      }
      setResumen(r.resumen);
    });
  }

  function generar() {
    if (!resumen) return;
    setErrorEnvio(null);
    startEnvio(async () => {
      const r = await remitirFactura(
        resumen.origen,
        resumen.id,
        { tipoIdentificacion, numeroIdentificacion, razonSocial, email },
        motivo
      );
      if (!r.ok) {
        setErrorEnvio(r.error);
        return;
      }
      router.push(r.url);
    });
  }

  const clienteListo = !!razonSocial.trim() && !!numeroIdentificacion.trim();
  const puedeGenerar = clienteListo && !!resumen && !!motivo.trim();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-[0.78rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
          1. Cliente
        </p>

        {clienteListo && !cargandoClienteNuevo ? (
          <div className="rounded-lg border border-brand/25 bg-brand-light p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[0.9rem] font-semibold text-brand-texto">{razonSocial}</p>
                <p className="text-[0.82rem] text-tinta-media">
                  {etiquetaTipoIdentificacion(tipoIdentificacion)}: {numeroIdentificacion}
                  {clienteAsignado?.numero != null && ` · Clave ${formatearNumero(clienteAsignado.numero)}`}
                  {!clienteAsignado && " · cliente nuevo"}
                </p>
              </div>
              <Boton tono="fantasma" tam="sm" onClick={buscarOtroCliente} className="flex-none">
                Buscar otro
              </Boton>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Entrada
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") buscarCliente();
                }}
                placeholder="Razón social, nombre o N° de RUC/Cédula"
              />
              <Boton onClick={buscarCliente} disabled={buscandoCliente} tono="navegar">
                {buscandoCliente ? "Buscando…" : "Buscar"}
              </Boton>
            </div>

            {resultadosCliente && resultadosCliente.length > 0 && (
              <div className="mt-2 flex flex-col gap-1.5">
                {resultadosCliente.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => elegirCliente(c)}
                    className="rounded-lg border border-linea bg-white px-3 py-2 text-left text-[0.85rem] transition-colors hover:border-brand hover:bg-papel-suave"
                  >
                    <span className="font-medium text-tinta">{c.nombre}</span>
                    <span className="ml-2 text-tinta-suave">
                      {c.tipoIdentificacion
                        ? `${etiquetaTipoIdentificacion(c.tipoIdentificacion)}: ${c.numeroIdentificacion}`
                        : "sin identificación fiscal"}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCargandoClienteNuevo(true)}
                  className="rounded-lg border border-dashed border-brand/40 bg-brand-light/40 px-3 py-2 text-left text-[0.85rem] font-medium text-brand-texto transition-colors hover:border-brand hover:bg-brand-light"
                >
                  + Ninguno de estos — crear cliente nuevo
                </button>
              </div>
            )}

            {cargandoClienteNuevo && (
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-linea bg-papel-suave p-3">
                <p className="text-[0.78rem] font-medium text-tinta-media">Cliente nuevo</p>
                <Campo etiqueta="Tipo">
                  <Selector value={tipoIdentificacion} onChange={(e) => setTipoIdentificacion(e.target.value)}>
                    {TIPOS_IDENTIFICACION_FISCAL.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="N° de RUC / Cédula / etc.">
                  <Entrada value={numeroIdentificacion} onChange={(e) => setNumeroIdentificacion(e.target.value)} />
                </Campo>
                <Campo etiqueta="Razón social">
                  <Entrada value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} autoFocus />
                </Campo>
                <Campo etiqueta="Correo electrónico">
                  <Entrada
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@correo.com"
                  />
                </Campo>
                {clienteListo && (
                  <Boton tono="suave" tam="sm" onClick={() => setCargandoClienteNuevo(false)} className="self-start">
                    Listo, seguir
                  </Boton>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {clienteListo && !cargandoClienteNuevo && (
        <div className="border-t border-linea pt-4">
          <p className="mb-2 text-[0.78rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            2. Cuenta a remitir
          </p>

          {resumen ? (
            <div className="rounded-lg border border-brand/25 bg-brand-light p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.9rem] font-semibold text-brand-texto">
                    {resumen.origen === "pedido" ? "Pedido" : "Venta"} {formatearNumero(resumen.numero)} —{" "}
                    {resumen.cliente}
                  </p>
                  <p className="text-[0.85rem] text-tinta-media">{formatearGuarani(resumen.total)}</p>
                </div>
                <Boton tono="fantasma" tam="sm" onClick={limpiarCuenta} className="flex-none">
                  Buscar otra
                </Boton>
              </div>
              <p className="mt-2 text-[0.78rem] text-tinta-media">
                Factura N° {resumen.facturaNumeroAnterior} anulada el{" "}
                {resumen.facturaAnuladaEn.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}
                {resumen.facturaMotivoAnulacion && <> — &quot;{resumen.facturaMotivoAnulacion}&quot;</>}
              </p>
            </div>
          ) : (
            <>
              <Segmentado
                opciones={[
                  { value: "pedido", label: "Pedido" },
                  { value: "venta", label: "Venta mostrador" },
                ]}
                valor={origen}
                onChange={setOrigen}
                className="mb-2"
              />
              <div className="flex gap-2">
                <Entrada
                  value={numeroBusqueda}
                  onChange={(e) => setNumeroBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") buscar();
                  }}
                  placeholder="N° de pedido o de venta"
                  inputMode="numeric"
                />
                <Boton onClick={buscar} disabled={buscando} tono="navegar">
                  {buscando ? "Buscando…" : "Buscar"}
                </Boton>
              </div>
              {errorBusqueda && <MensajeError>{errorBusqueda}</MensajeError>}
            </>
          )}
        </div>
      )}

      {clienteListo && resumen && (
        <>
          <div>
            <p className="mb-1.5 text-[0.78rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              3. Motivo
            </p>
            <Area
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="¿Por qué se remite esta factura? Ej: RUC mal cargado."
              rows={2}
            />
          </div>

          {errorEnvio && <MensajeError>{errorEnvio}</MensajeError>}

          <Boton onClick={generar} disabled={!puedeGenerar || enviando} tam="lg">
            {enviando ? "Generando…" : "Generar factura nueva"}
          </Boton>
        </>
      )}
    </div>
  );
}
