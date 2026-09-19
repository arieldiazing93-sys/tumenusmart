"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Entrada, Selector, MensajeError, Area } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { buscarParaRemision, remitirFactura, type ResumenParaRemision } from "../actions";

/**
 * "Remisión a facturar" (buscar y adjuntar la cuenta) + "Datos del cliente"
 * (precargados con lo que decía la factura anulada, para corregir solo lo
 * que estaba mal) + motivo → genera la factura nueva y abre el ticket para
 * imprimir.
 */
export function NuevaFacturaForm() {
  const router = useRouter();
  const [origen, setOrigen] = useState<"pedido" | "venta">("pedido");
  const [numeroBusqueda, setNumeroBusqueda] = useState("");
  const [buscando, startBusqueda] = useTransition();
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenParaRemision | null>(null);

  const [tipoIdentificacion, setTipoIdentificacion] = useState(TIPOS_IDENTIFICACION_FISCAL[0].valor as string);
  const [numeroIdentificacion, setNumeroIdentificacion] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [email, setEmail] = useState("");
  const [motivo, setMotivo] = useState("");

  const [enviando, startEnvio] = useTransition();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  function limpiarAdjunto() {
    setResumen(null);
    setTipoIdentificacion(TIPOS_IDENTIFICACION_FISCAL[0].valor);
    setNumeroIdentificacion("");
    setRazonSocial("");
    setEmail("");
    setMotivo("");
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
      setTipoIdentificacion(r.resumen.tipoIdentificacion || TIPOS_IDENTIFICACION_FISCAL[0].valor);
      setNumeroIdentificacion(r.resumen.numeroIdentificacion);
      setRazonSocial(r.resumen.razonSocial);
      setEmail(r.resumen.email);
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

  const puedeGenerar = !!resumen && !!razonSocial.trim() && !!numeroIdentificacion.trim() && !!motivo.trim();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-[0.78rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
          Remisión a facturar
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
              <button
                type="button"
                onClick={limpiarAdjunto}
                className="flex-none text-[0.78rem] font-medium text-tinta-suave underline hover:text-peligro"
              >
                Buscar otro
              </button>
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

      {resumen && (
        <>
          <div className="flex flex-col gap-3 border-t border-linea pt-4">
            <p className="text-[0.78rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Datos del cliente
            </p>
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
              <Entrada value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
            </Campo>
            {resumen.origen === "pedido" && (
              <Campo etiqueta="Correo electrónico">
                <Entrada
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@correo.com"
                />
              </Campo>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[0.78rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Motivo
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
