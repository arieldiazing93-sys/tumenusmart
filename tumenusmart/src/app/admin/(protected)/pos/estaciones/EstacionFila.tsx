"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  renombrarEstacion,
  alternarActivaEstacion,
  vincularEstacion,
  asignarPuntoExpedicion,
  asignarImpresoraDeArea,
  asignarAreaTicket,
} from "./actions";
import { Boton, clasesBoton } from "@/components/ui";
import { listarImpresoras } from "@/lib/qz-tray";

type PuntoExpedicionOpcion = {
  id: string;
  nombre: string;
  establecimiento: string;
  puntoExpedicion: string;
};

type AreaImpresionOpcion = { id: string; nombre: string };
type ImpresoraAsignada = { areaImpresionId: string; nombreImpresora: string };

export function EstacionFila({
  id,
  nombre,
  activa,
  cantidadTurnos,
  esEstaComputadora,
  puntoExpedicionId,
  puntosExpedicion,
  areaTicketId,
  impresoras,
  areasImpresion,
}: {
  id: string;
  nombre: string;
  activa: boolean;
  cantidadTurnos: number;
  /** Si la cookie de ESTE navegador ya apunta a esta estación. */
  esEstaComputadora: boolean;
  puntoExpedicionId: string | null;
  /** Puntos de expedición activos del local, para elegir a cuál queda atada. */
  puntosExpedicion: PuntoExpedicionOpcion[];
  /** Qué Área de Impresión maneja el ticket/factura en esta estación. */
  areaTicketId: string | null;
  /** Mapeo YA guardado de área → impresora, para esta estación. */
  impresoras: ImpresoraAsignada[];
  /** Áreas de impresión activas del local (catálogo). */
  areasImpresion: AreaImpresionOpcion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [asignandoTicket, setAsignandoTicket] = useState(false);
  const [impresorasDetectadas, setImpresorasDetectadas] = useState<string[]>([]);
  const [buscandoImpresoras, setBuscandoImpresoras] = useState(false);
  const [errorQz, setErrorQz] = useState<string | null>(null);
  const [asignandoArea, setAsignandoArea] = useState<string | null>(null);

  const mapaImpresoras = new Map(impresoras.map((i) => [i.areaImpresionId, i.nombreImpresora]));

  async function cambiarPuntoExpedicion(valor: string) {
    setAsignando(true);
    setError(null);
    const resultado = await asignarPuntoExpedicion(id, valor || null);
    setAsignando(false);
    if (!resultado.ok) setError(resultado.error);
  }

  async function cambiarAreaTicket(valor: string) {
    setAsignandoTicket(true);
    setError(null);
    const resultado = await asignarAreaTicket(id, valor || null);
    setAsignandoTicket(false);
    if (!resultado.ok) setError(resultado.error);
  }

  async function buscarImpresoras() {
    setBuscandoImpresoras(true);
    setErrorQz(null);
    try {
      setImpresorasDetectadas(await listarImpresoras());
    } catch {
      setErrorQz("No se pudo conectar con QZ Tray en esta computadora. ¿Está instalado y corriendo?");
    }
    setBuscandoImpresoras(false);
  }

  async function cambiarImpresoraDeArea(areaImpresionId: string, valor: string) {
    setAsignandoArea(areaImpresionId);
    setErrorQz(null);
    const resultado = await asignarImpresoraDeArea(id, areaImpresionId, valor || null);
    setAsignandoArea(null);
    if (!resultado.ok) setErrorQz(resultado.error);
  }

  function guardarNombre() {
    setError(null);
    startTransition(async () => {
      const resultado = await renombrarEstacion(id, nombreEditado);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    });
  }

  async function vincular() {
    if (
      !confirm(
        `¿Vincular ESTA computadora a "${nombre}"? De ahora en más, cualquier cajero que use este navegador va a operar bajo esta estación.`
      )
    ) {
      return;
    }
    setVinculando(true);
    setError(null);
    const resultado = await vincularEstacion(id);
    setVinculando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className={`rounded-lg border bg-white px-4 py-3 ${
        activa ? "border-linea" : "border-linea opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editando ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              className="flex-1 rounded-lg border border-linea px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={pending}
              onClick={guardarNombre}
              className={clasesBoton("principal", "sm")}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setNombreEditado(nombre);
                setEditando(false);
                setError(null);
              }}
              className="text-sm text-tinta-media hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <span className="font-medium">
            {nombre}
            {!activa && <span className="ml-2 text-xs font-normal text-tinta-suave">(desactivada)</span>}
            {esEstaComputadora && (
              <span className="ml-2 text-xs font-semibold text-exito">✓ Esta computadora</span>
            )}
            {guardado && <span className="ml-2 text-xs font-normal text-exito">✓ Guardado</span>}
          </span>
        )}

        {!editando && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-tinta-media">{cantidadTurnos} turno(s)</span>
            <label className="flex items-center gap-1.5 text-tinta-media">
              Punto de expedición
              <select
                value={puntoExpedicionId ?? ""}
                disabled={asignando}
                onChange={(e) => cambiarPuntoExpedicion(e.target.value)}
                className="rounded-lg border border-linea px-2 py-1 text-sm text-tinta"
              >
                <option value="">Sin asignar — solo tickets</option>
                {puntosExpedicion.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.establecimiento}-{p.puntoExpedicion})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-tinta-media">
              Área del ticket/factura
              <select
                value={areaTicketId ?? ""}
                disabled={asignandoTicket}
                onChange={(e) => cambiarAreaTicket(e.target.value)}
                className="rounded-lg border border-linea px-2 py-1 text-sm text-tinta"
              >
                <option value="">Sin asignar — imprime manual</option>
                {areasImpresion.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </label>
            {activa && !esEstaComputadora && (
              <Boton tono="navegar" tam="sm" onClick={vincular} disabled={vinculando}>
                {vinculando ? "Vinculando…" : "Vincular esta computadora"}
              </Boton>
            )}
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-tinta-media hover:underline"
            >
              Renombrar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivaEstacion(id, !activa))}
              className="text-tinta-media hover:underline disabled:opacity-50"
            >
              {activa ? "Desactivar" : "Reactivar"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}

      {!editando && areasImpresion.length > 0 && (
        <div className="mt-3 border-t border-linea-fina pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tinta-media">
            Impresoras por área — impresión automática (QZ Tray)
          </p>

          {esEstaComputadora ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={buscarImpresoras}
                  disabled={buscandoImpresoras}
                  className={clasesBoton("navegar", "sm")}
                >
                  {buscandoImpresoras ? "Buscando…" : "Buscar impresoras"}
                </button>
                {errorQz && <span className="text-xs text-peligro">{errorQz}</span>}
              </div>
              <div className="flex flex-col gap-2">
                {areasImpresion.map((a) => {
                  const actual = mapaImpresoras.get(a.id) ?? "";
                  return (
                    <label key={a.id} className="flex items-center gap-2 text-sm text-tinta-media">
                      <span className="w-24 flex-none">{a.nombre}</span>
                      <select
                        value={actual}
                        disabled={asignandoArea === a.id}
                        onChange={(e) => cambiarImpresoraDeArea(a.id, e.target.value)}
                        className="rounded-lg border border-linea px-2 py-1 text-sm text-tinta"
                      >
                        <option value="">Sin asignar — imprime manual</option>
                        {actual && !impresorasDetectadas.includes(actual) && (
                          <option value={actual}>{actual} (guardada)</option>
                        )}
                        {impresorasDetectadas.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <ul className="flex flex-col gap-0.5 text-xs text-tinta-media">
              {areasImpresion.map((a) => (
                <li key={a.id}>
                  {a.nombre}: {mapaImpresoras.get(a.id) ?? "sin asignar"}
                </li>
              ))}
              <li className="mt-1 text-tinta-suave">
                Para configurar impresoras, entrá a esta pantalla desde ESA computadora.
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
