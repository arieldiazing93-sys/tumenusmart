"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import { RefrescarCada } from "@/components/RefrescarCada";
import { clasesBoton } from "@/components/ui";

/** Un pedido de la ruta, listo para mostrar (todo texto y números: viene del servidor ya armado). */
export type TarjetaRepartidor = {
  id: string;
  /** "abierta" | "por_cobrar" (la caja todavía no cobró) | "pagada" | "anulada" (la caja ya la cerró). */
  estado: string;
  cliente: string;
  telefono: string;
  direccion: string | null;
  linkMapa: string | null;
  productos: string;
  notas: string | null;
  /** La hora en que se le asignó (o, si la caja ya la cerró, la hora en que se cerró), en hora de Asunción. */
  horaTexto: string;
  esNuevo: boolean;
  total: number;
  envio: number;
  /** Cómo se cobró ("Efectivo", "Efectivo Gs. 50.000 + Tarjeta débito Gs. 20.000"…), si la caja ya la cobró. */
  pago: string | null;
  /** La caja cancelaba un cobro ya hecho (no una cuenta que nunca se cobró). */
  cobroCancelado: boolean;
};

/** Una cuenta cerrada por la caja, en el historial. */
export type FilaHistorial = {
  id: string;
  cliente: string;
  fechaTexto: string;
  direccion: string | null;
  linkMapa: string | null;
  cancelada: boolean;
  cobroCancelado: boolean;
  pago: string | null;
  total: number | null;
};

export type ResumenHistorial = {
  cobradas: number;
  total: number;
  porForma: { etiqueta: string; monto: number }[];
  canceladas: number;
};

export type TramoHistorial = {
  /** "hoy" o "rango" (o cualquier otro atajo que llegue en la dirección). */
  activo: string;
  desde: string;
  hasta: string;
  texto: string;
  truncado: boolean;
  /** Cuántas cuentas cerradas de este tramo están arriba, entre los pedidos de la ruta (no se repiten abajo). */
  arriba: number;
};

/**
 * La pantalla del repartidor. Arriba, fijo mientras se desplaza la pantalla: el saludo y el filtro de fechas del historial.
 *
 * Después, los pedidos de su ruta: los que la caja le asignó y siguen abiertos, y los que la caja ya cerró hace poco. Un pedido
 * cobrado NO desaparece: sigue con todos sus datos (el teléfono del cliente, el mapa) hasta que el repartidor lo da por entregado.
 * "Entregado" no cambia nada en el sistema ni en la caja: solo MINIMIZA el pedido en esta pantalla (queda guardado en este celular),
 * y con "Ver datos" se vuelve a abrir. Abajo, el historial de las cuentas cerradas del tramo elegido.
 */
export function PantallaRepartidor({
  repartidorId,
  nombre,
  tarjetas,
  historial,
  resumen,
  tramo,
  segundos,
}: {
  repartidorId: string;
  nombre: string;
  tarjetas: TarjetaRepartidor[];
  historial: FilaHistorial[];
  resumen: ResumenHistorial;
  tramo: TramoHistorial;
  segundos: number;
}) {
  const clave = `repartidor-entregados-${repartidorId}`;
  /** Los pedidos que el repartidor dio por entregados (se minimizan). Solo vive en este celular. */
  const [entregados, setEntregados] = useState<string[]>([]);
  /** Los entregados que se abrieron otra vez con "Ver datos". */
  const [abiertos, setAbiertos] = useState<string[]>([]);

  useEffect(() => {
    try {
      const crudo = window.localStorage.getItem(clave);
      const guardados: unknown = crudo ? JSON.parse(crudo) : [];
      if (Array.isArray(guardados)) setEntregados(guardados.filter((x): x is string => typeof x === "string"));
    } catch {
      // Sin almacenamiento (navegación privada, etc.): la pantalla anda igual, solo no recuerda qué se minimizó.
    }
  }, [clave]);

  function guardar(ids: string[]) {
    // Solo se guardan los que siguen en la ruta: así la lista no crece para siempre.
    const vigentes = new Set(tarjetas.map((t) => t.id));
    const recortados = ids.filter((id) => vigentes.has(id));
    setEntregados(recortados);
    try {
      window.localStorage.setItem(clave, JSON.stringify(recortados));
    } catch {
      // idem: anda sin recordar.
    }
  }

  function marcarEntregado(id: string) {
    setAbiertos((a) => a.filter((x) => x !== id));
    guardar([...new Set([...entregados, id])]);
  }

  const porEntregar = tarjetas.filter((t) => t.estado !== "anulada" && !entregados.includes(t.id)).length;

  return (
    <main className="mx-auto max-w-md px-4 pb-6">
      {/* ------------------------------------------------------------------ cabecera fija: saludo y filtro de fechas */}
      <header className="sticky top-0 z-20 -mx-4 border-b border-neutral-200 bg-white px-4 pb-2.5 pt-3 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="min-w-0 truncate text-lg font-bold text-neutral-900">Hola, {nombre} 👋</h1>
          <p className="flex-none text-xs text-neutral-500">
            {porEntregar === 0 ? "Sin pedidos por entregar" : `${porEntregar} por entregar`}
          </p>
        </div>
        {/* Se actualiza sola cada minuto (y en el acto al volver a la pantalla): cuando la caja te asigna un pedido, aparece acá sin
            que hagas nada. A propósito sin contador ni botón a la vista. */}
        <RefrescarCada segundos={segundos} />
        <form method="get" className="mt-2 flex flex-wrap items-end gap-x-2 gap-y-1.5">
          <input type="hidden" name="fecha" value="rango" />
          <Link href={`/repartidor/${repartidorId}?fecha=hoy`} className={clasesBoton(tramo.activo === "hoy" ? "principal" : "suave", "sm")}>
            Hoy
          </Link>
          <label className="flex min-w-0 flex-1 flex-col text-[0.62rem] font-semibold uppercase text-neutral-500">
            Desde
            <input
              type="date"
              name="desde"
              required
              defaultValue={tramo.activo === "rango" ? tramo.desde : undefined}
              className="mt-0.5 w-full min-w-[7.5rem] rounded-lg border border-neutral-300 px-1.5 py-1 text-[0.8rem] font-normal normal-case text-neutral-900"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col text-[0.62rem] font-semibold uppercase text-neutral-500">
            Hasta
            <input
              type="date"
              name="hasta"
              required
              defaultValue={tramo.activo === "rango" ? tramo.hasta : undefined}
              className="mt-0.5 w-full min-w-[7.5rem] rounded-lg border border-neutral-300 px-1.5 py-1 text-[0.8rem] font-normal normal-case text-neutral-900"
            />
          </label>
          <button type="submit" className={clasesBoton("principal", "sm")}>
            Ver tramo
          </button>
        </form>
      </header>

      {/* ---------------------------------------------------------------------------------- los pedidos de la ruta */}
      <div className="mt-4 flex flex-col gap-3">
        {tarjetas.length === 0 && (
          <p className="rounded-lg bg-neutral-50 px-3 py-3 text-sm text-neutral-500">No tenés pedidos asignados en este momento.</p>
        )}
        {tarjetas.map((t) => {
          const entregado = entregados.includes(t.id);
          const abierto = abiertos.includes(t.id);

          // Entregado y minimizado: una fila corta, como las del historial.
          if (entregado && !abierto) {
            return (
              <div key={t.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-neutral-900">{t.cliente}</span>
                  <span className="text-xs text-neutral-400">{t.horaTexto}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-exito-luz px-2 py-0.5 text-xs font-semibold text-exito">
                    {t.estado === "anulada"
                      ? "Cancelada"
                      : t.pago
                        ? `Entregado · Cobrado: ${t.pago}`
                        : "Entregado · falta cobrar"}
                  </span>
                  <span className="flex items-center gap-3">
                    {t.estado !== "anulada" && <span className="font-semibold text-neutral-900">{formatearGuarani(t.total)}</span>}
                    <button
                      type="button"
                      onClick={() => setAbiertos((a) => [...a, t.id])}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      Ver datos
                    </button>
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div key={t.id} className={`rounded-xl border bg-white p-4 shadow-sm ${t.esNuevo ? "border-2 border-aviso" : "border-brand"}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-semibold text-neutral-900">{t.cliente}</span>
                <span className="flex items-center gap-2 text-xs text-neutral-400">
                  {t.esNuevo && <span className="rounded-full bg-aviso px-2 py-0.5 text-[0.7rem] font-bold uppercase text-white">Nuevo</span>}
                  {t.horaTexto}
                </span>
              </div>

              <a href={`tel:${t.telefono}`} className="mb-2 block text-sm text-brand">
                📞 {t.telefono}
              </a>

              {t.direccion ? (
                <p className="mb-2 text-sm text-neutral-700">📍 {t.direccion}</p>
              ) : (
                !t.linkMapa && <p className="mb-2 text-sm text-neutral-700">📍 Sin referencia de dirección</p>
              )}

              {/* Botón grande: con un toque abre el mapa con la ubicación del cliente. */}
              {t.linkMapa && (
                <a
                  href={t.linkMapa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  📍 Abrir la ubicación del cliente en el mapa
                </a>
              )}

              <div className="mb-3 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">{t.productos || "Sin productos cargados todavía."}</div>
              {t.notas && <p className="mb-3 text-xs text-neutral-600">Nota: {t.notas}</p>}

              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-neutral-900">{formatearGuarani(t.total)}</span>
                <span className="text-xs text-neutral-500">incluye {formatearGuarani(t.envio)} de envío</span>
              </div>

              {/* Solo se avisa lo que cambia lo que hay que hacer: que la caja ya cobró (no cobrar de nuevo) o que canceló. Mientras la
                  caja no cobró no hay leyenda: el total ya está arriba. */}
              {t.estado === "pagada" && (
                <p className="mb-3 rounded-md bg-exito-luz px-2.5 py-2 text-[0.82rem] font-medium text-exito">
                  La caja ya la cobró{t.pago ? `: ${t.pago}` : ""}. No cobres nada: solo entregá.
                </p>
              )}
              {t.estado === "anulada" && (
                <p className="mb-3 rounded-md bg-peligro-luz px-2.5 py-2 text-[0.82rem] font-medium text-peligro">
                  {t.cobroCancelado ? "La caja canceló el cobro de este pedido." : "La caja canceló este pedido."}
                </p>
              )}

              {/* No cambia nada en el sistema: solo minimiza el pedido en esta pantalla (y "Ver datos" lo vuelve a abrir). */}
              {entregado ? (
                <button type="button" onClick={() => setAbiertos((a) => a.filter((x) => x !== t.id))} className={`${clasesBoton("suave", "md")} w-full`}>
                  Minimizar
                </button>
              ) : (
                <button type="button" onClick={() => marcarEntregado(t.id)} className={`${clasesBoton("exito", "md")} w-full`}>
                  {t.estado === "anulada" ? "Entendido" : "Entregado"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* --------------------------------------------------------------------------------------------- historial */}
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-700">Mi historial</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Cuentas cerradas por la caja · {tramo.texto}
          {tramo.truncado && " · se muestran las últimas"}
          {tramo.arriba > 0 && ` · ${tramo.arriba} ${tramo.arriba === 1 ? "está arriba, con tus pedidos" : "están arriba, con tus pedidos"}`}
        </p>

        {resumen.cobradas === 0 && resumen.canceladas === 0 ? (
          <p className="rounded-lg bg-neutral-50 px-3 py-3 text-sm text-neutral-500">No hay cuentas cerradas en este tramo.</p>
        ) : (
          <>
            {/* El resumen del tramo: cuánto se cobró en total y con qué forma de pago. */}
            <div className="mb-3 rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900">
                  {resumen.cobradas} {resumen.cobradas === 1 ? "pedido cobrado" : "pedidos cobrados"}
                </p>
                <p className="text-sm font-bold text-neutral-900">{formatearGuarani(resumen.total)}</p>
              </div>
              {resumen.porForma.length > 0 && (
                <ul className="mt-2 flex flex-col gap-0.5 border-t border-neutral-100 pt-2">
                  {resumen.porForma.map((f) => (
                    <li key={f.etiqueta} className="flex items-center justify-between text-xs text-neutral-600">
                      <span>{f.etiqueta}</span>
                      <span className="font-medium text-neutral-900">{formatearGuarani(f.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {resumen.canceladas > 0 && (
                <p className="mt-2 text-xs text-neutral-400">
                  {resumen.canceladas} {resumen.canceladas === 1 ? "cuenta se canceló" : "cuentas se cancelaron"} sin cobrarse (no suman).
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {historial.map((c) => (
                <div key={c.id} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-neutral-900">{c.cliente}</span>
                    <span className="text-xs text-neutral-400">{c.fechaTexto}</span>
                  </div>
                  {c.direccion && <p className="truncate text-xs text-neutral-500">📍 {c.direccion}</p>}
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    {c.cancelada ? (
                      <span className="rounded-full bg-peligro-luz px-2 py-0.5 text-xs font-semibold text-peligro">
                        {c.cobroCancelado ? "Cobro cancelado" : "Cuenta cancelada"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-exito-luz px-2 py-0.5 text-xs font-semibold text-exito">
                        {c.pago ? `Cobrado: ${c.pago}` : "Cobrado"}
                      </span>
                    )}
                    {!c.cancelada && c.total !== null && <span className="font-semibold text-neutral-900">{formatearGuarani(c.total)}</span>}
                  </div>
                  {c.linkMapa && !c.cancelada && (
                    <a
                      href={c.linkMapa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs font-medium text-brand hover:underline"
                    >
                      Ver la ubicación en el mapa
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
