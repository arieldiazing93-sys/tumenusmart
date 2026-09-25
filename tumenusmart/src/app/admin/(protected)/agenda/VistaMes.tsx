import Link from "next/link";
import { construirGrillaMes, DIAS_SEMANA } from "@/lib/calendario";
import {
  diaLargo,
  estadoDeCita,
  horaDeMinutos,
  partesLocales,
  urlAgenda,
  type CitaAgenda,
  type ParametrosAgenda,
} from "@/lib/agenda";

const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

/** Cuántos turnos se listan por día en pantalla grande, y cuántos puntitos en el celular. */
const TURNOS_POR_DIA = 3;
const PUNTOS_POR_DIA = 4;

/**
 * El color de fondo de un día según cuánto trabajo tiene: un mapa de calor. Sin turnos
 * queda blanco; con pocos, un naranja suave; con muchos, un naranja franco. Así se ve
 * de lejos qué días están llenos y cuáles tienen lugar.
 */
function calor(cantidad: number): string {
  if (cantidad === 0) return "bg-superficie";
  if (cantidad <= 2) return "bg-brand-light/50";
  if (cantidad <= 4) return "bg-brand-light";
  return "bg-brand-tinte";
}

/**
 * La vista de Mes: una casilla por día. Tocar un día lleva a su vista de Día.
 *
 * Cada casilla es una tarjeta con borde propio. En pantalla grande lista la hora y el
 * nombre de los primeros turnos con el color de su estado; en el celular no hay lugar
 * para texto, así que quedan puntitos con el color de cada turno. El fondo se va
 * llenando de naranja cuanto más turnos tiene el día, y hoy se destaca con su anillo.
 */
export function VistaMes({
  fecha,
  citas,
  hoy,
  parametros,
}: {
  /** Un día cualquiera del mes que se está viendo. */
  fecha: string;
  citas: CitaAgenda[];
  hoy: string;
  parametros: ParametrosAgenda;
}) {
  const [anio, mes] = fecha.split("-").map(Number);
  const celdas = construirGrillaMes(anio, mes - 1);

  const porDia = new Map<string, CitaAgenda[]>();
  for (const c of citas) {
    const { dia } = partesLocales(c.inicio);
    const lista = porDia.get(dia) ?? [];
    lista.push(c);
    porDia.set(dia, lista);
  }

  return (
    <div className="bg-papel-suave p-2 sm:p-3">
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[0.68rem] font-bold uppercase tracking-wide">
        {DIAS_CORTOS.map((corto, i) => (
          <div key={corto} className={`py-1.5 ${i >= 5 ? "text-violet-500" : "text-tinta-suave"}`}>
            <span className="sm:hidden">{DIAS_SEMANA[i]}</span>
            <span className="hidden sm:inline">{corto}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {celdas.map((c, indice) => {
          const lista = porDia.get(c.fecha) ?? [];
          const esHoy = c.fecha === hoy;
          const finDeSemana = indice % 7 >= 5;
          return (
            <Link
              key={c.fecha}
              href={urlAgenda(parametros, { vista: "dia", fecha: c.fecha })}
              scroll={false}
              aria-label={`${diaLargo(c.fecha)}: ${
                lista.length === 0 ? "sin turnos" : lista.length === 1 ? "1 turno" : `${lista.length} turnos`
              }`}
              className={`animate-bloque group relative flex min-h-[4.75rem] min-w-0 flex-col gap-1 rounded-xl border p-1.5 transition-[transform,box-shadow,border-color] duration-200 hover:z-10 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[7rem] ${
                esHoy
                  ? "border-brand bg-gradient-to-br from-brand-light to-superficie ring-2 ring-brand/30"
                  : c.enMes
                    ? `${finDeSemana && lista.length === 0 ? "bg-violet-50/60" : calor(lista.length)} border-linea hover:border-brand/60`
                    : "border-transparent bg-papel-hundido/60 hover:border-linea"
              }`}
              // Las casillas entran en ola, de a poquito.
              style={{ animationDelay: `${Math.min(indice, 41) * 12}ms` }}
            >
              <div className="flex items-center justify-between gap-1">
                {lista.length > 0 ? (
                  <span className="rounded-full bg-brand px-1.5 py-px text-[0.62rem] font-bold text-white shadow-sm">
                    {lista.length}
                  </span>
                ) : (
                  <span />
                )}
                <span
                  className={`flex h-6 min-w-6 flex-none items-center justify-center rounded-full px-1 text-[0.78rem] font-bold transition-transform duration-200 group-hover:scale-110 ${
                    esHoy
                      ? "bg-gradient-to-br from-brand to-brand-dark text-white shadow-md shadow-brand/30"
                      : c.enMes
                        ? "text-tinta"
                        : "text-tinta-suave"
                  }`}
                >
                  {c.dia}
                </span>
              </div>

              {/* Pantalla grande: la hora y el nombre de los primeros turnos, cada uno con el color de su estado. */}
              <ul className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {lista.slice(0, TURNOS_POR_DIA).map((t) => {
                  const estado = estadoDeCita(t.estado);
                  return (
                    <li
                      key={t.id}
                      className={`flex min-w-0 items-center gap-1 rounded-md border border-l-[3px] px-1 py-px text-[0.68rem] leading-tight ${estado.bloque}`}
                    >
                      <span className="cifra flex-none font-bold">{horaDeMinutos(partesLocales(t.inicio).minutos)}</span>
                      <span className="truncate font-semibold">{t.clienteNombre}</span>
                    </li>
                  );
                })}
                {lista.length > TURNOS_POR_DIA && (
                  <li className="text-[0.68rem] font-bold text-brand-texto">+{lista.length - TURNOS_POR_DIA} más</li>
                )}
              </ul>

              {/* Celular: puntitos con el color de cada turno. */}
              {lista.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 sm:hidden">
                  {lista.slice(0, PUNTOS_POR_DIA).map((t) => (
                    <span
                      key={t.id}
                      className={`h-2.5 w-2.5 rounded-full ring-1 ring-white ${estadoDeCita(t.estado).punto}`}
                    />
                  ))}
                  {lista.length > PUNTOS_POR_DIA && (
                    <span className="text-[0.62rem] font-bold text-tinta-media">+{lista.length - PUNTOS_POR_DIA}</span>
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
