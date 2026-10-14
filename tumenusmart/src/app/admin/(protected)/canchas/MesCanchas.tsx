import Link from "next/link";
import { construirGrillaMes, DIAS_SEMANA } from "@/lib/calendario";
import { diaLargo, estadoDeCita, horaDeMinutos, partesLocales } from "@/lib/agenda";
import { urlCanchas, type ParametrosCanchas } from "@/lib/canchas";
import type { ReservaGrilla } from "./GrillaCanchas";

const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** Cuántas reservas se listan por día en pantalla grande, y cuántos puntitos en el celular. */
const RESERVAS_POR_DIA = 3;
const PUNTOS_POR_DIA = 4;

/**
 * La vista de Mes del calendario de canchas: una casilla por día. Tocar un día lleva a su vista de Día (donde cada cancha
 * tiene su columna y se anotan reservas).
 *
 * Las casillas son blancas (solo cambia el color de hoy, en azul); lo único con color son las reservas, con el color de su
 * estado. En pantalla grande cada casilla lista la hora y el cliente de las primeras reservas y cuántas hay en total; en el
 * celular no hay lugar para texto, así que quedan puntitos con el color del estado de cada reserva.
 */
export function MesCanchas({
  fecha,
  reservas,
  nombres,
  hoy,
  parametros,
}: {
  /** Un día cualquiera del mes que se está viendo. */
  fecha: string;
  reservas: ReservaGrilla[];
  /** El nombre de cada cancha por su id (se ve al apoyar el mouse en una reserva). */
  nombres: Record<string, string>;
  hoy: string;
  parametros: ParametrosCanchas;
}) {
  const [anio, mes] = fecha.split("-").map(Number);
  const celdas = construirGrillaMes(anio, mes - 1);

  const porDia = new Map<string, ReservaGrilla[]>();
  for (const r of reservas) {
    const { dia } = partesLocales(r.inicio);
    const lista = porDia.get(dia) ?? [];
    lista.push(r);
    porDia.set(dia, lista);
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-linea bg-superficie text-center text-[0.68rem] font-semibold uppercase tracking-wide text-tinta-suave">
        {DIAS_CORTOS.map((corto, i) => (
          <div key={corto} className="py-2">
            <span className="sm:hidden">{DIAS_SEMANA[i]}</span>
            <span className="hidden sm:inline">{corto}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-linea">
        {celdas.map((c) => {
          const lista = porDia.get(c.fecha) ?? [];
          const esHoy = c.fecha === hoy;
          return (
            <Link
              key={c.fecha}
              href={urlCanchas(parametros, { vista: "dia", fecha: c.fecha })}
              scroll={false}
              aria-label={`${diaLargo(c.fecha)}: ${
                lista.length === 0 ? "sin reservas" : lista.length === 1 ? "1 reserva" : `${lista.length} reservas`
              }`}
              className={`flex min-h-[4.75rem] min-w-0 flex-col gap-1 p-1 transition-colors sm:min-h-[8rem] sm:p-2 ${
                esHoy
                  ? "bg-azul-luz hover:bg-azul-tinte/60"
                  : c.enMes
                    ? "bg-superficie hover:bg-papel-suave"
                    : "bg-papel-suave hover:bg-papel-hundido"
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span
                  className={`flex h-7 min-w-7 flex-none items-center justify-center rounded-full px-1 text-[0.85rem] font-semibold ${
                    esHoy ? "bg-azul text-white shadow-sm" : c.enMes ? "text-tinta" : "text-tinta-suave/70"
                  }`}
                >
                  {c.dia}
                </span>
                {/* Cuántas reservas hay ese día (en pantalla grande; en el celular están los puntitos). */}
                {lista.length > 0 && (
                  <span className="hidden flex-none text-[0.68rem] font-semibold text-tinta-media sm:inline">
                    {lista.length === 1 ? "1 reserva" : `${lista.length} reservas`}
                  </span>
                )}
              </div>

              {/* Pantalla grande: la hora y el cliente de las primeras reservas. */}
              <ul className="hidden min-w-0 flex-col gap-1 sm:flex">
                {lista.slice(0, RESERVAS_POR_DIA).map((r) => {
                  const estado = estadoDeCita(r.estado);
                  return (
                    <li
                      key={r.id}
                      title={`${r.clienteNombre} · ${nombres[r.canchaId] ?? "Cancha"} · ${estado.etiqueta}`}
                      className={`flex min-w-0 items-center gap-1.5 rounded-md border border-l-[3px] px-1.5 py-0.5 text-[0.7rem] leading-tight ${estado.bloque}`}
                    >
                      <span className="flex-none font-semibold tabular-nums">{horaDeMinutos(partesLocales(r.inicio).minutos)}</span>
                      <span className="truncate font-medium">{r.clienteNombre}</span>
                    </li>
                  );
                })}
                {lista.length > RESERVAS_POR_DIA && (
                  <li className="w-fit rounded-md bg-azul-luz px-1.5 py-0.5 text-[0.68rem] font-semibold text-azul-oscuro">
                    +{lista.length - RESERVAS_POR_DIA} más
                  </li>
                )}
              </ul>

              {/* Celular: puntitos con el color de cada reserva. */}
              {lista.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 sm:hidden">
                  {lista.slice(0, PUNTOS_POR_DIA).map((r) => (
                    <span key={r.id} className={`h-2 w-2 rounded-full ${estadoDeCita(r.estado).punto}`} />
                  ))}
                  {lista.length > PUNTOS_POR_DIA && (
                    <span className="text-[0.62rem] font-semibold text-tinta-media">+{lista.length - PUNTOS_POR_DIA}</span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
