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
 * La vista de Mes: una casilla por día. Tocar un día lleva a su vista de Día.
 *
 * Las casillas son blancas (solo cambia el color de hoy, en azul); lo único con color
 * son los turnos. En pantalla grande cada casilla lista la hora y el nombre de los
 * primeros turnos; en el celular no hay lugar para texto, así que quedan puntitos con
 * el color del estado de cada turno.
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
              href={urlAgenda(parametros, { vista: "dia", fecha: c.fecha })}
              scroll={false}
              aria-label={`${diaLargo(c.fecha)}: ${
                lista.length === 0 ? "sin turnos" : lista.length === 1 ? "1 turno" : `${lista.length} turnos`
              }`}
              className={`flex min-h-[4.75rem] min-w-0 flex-col gap-1 p-1 transition-colors sm:min-h-[7rem] sm:p-1.5 ${
                esHoy
                  ? "bg-azul-luz hover:bg-azul-tinte/60"
                  : c.enMes
                    ? "bg-superficie hover:bg-papel-suave"
                    : "bg-papel-suave hover:bg-papel-hundido"
              }`}
            >
              <span
                className={`ml-auto flex h-6 min-w-6 flex-none items-center justify-center rounded-full px-1 text-[0.78rem] font-semibold ${
                  esHoy ? "bg-azul text-white" : c.enMes ? "text-tinta" : "text-tinta-suave"
                }`}
              >
                {c.dia}
              </span>

              {/* Pantalla grande: la hora y el nombre de los primeros turnos. */}
              <ul className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {lista.slice(0, TURNOS_POR_DIA).map((t) => {
                  const estado = estadoDeCita(t.estado);
                  return (
                    <li
                      key={t.id}
                      className={`flex min-w-0 items-center gap-1.5 text-[0.7rem] ${
                        estado.valor === "cancelada" ? "text-tinta-suave line-through" : "text-tinta"
                      }`}
                    >
                      <span className={`h-2 w-2 flex-none rounded-full ${estado.punto}`} />
                      <span className="cifra flex-none text-tinta-media">
                        {horaDeMinutos(partesLocales(t.inicio).minutos)}
                      </span>
                      <span className="truncate font-medium">{t.clienteNombre}</span>
                    </li>
                  );
                })}
                {lista.length > TURNOS_POR_DIA && (
                  <li className="text-[0.68rem] font-semibold text-azul-oscuro">
                    +{lista.length - TURNOS_POR_DIA} más
                  </li>
                )}
              </ul>

              {/* Celular: puntitos con el color de cada turno. */}
              {lista.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 sm:hidden">
                  {lista.slice(0, PUNTOS_POR_DIA).map((t) => (
                    <span key={t.id} className={`h-2 w-2 rounded-full ${estadoDeCita(t.estado).punto}`} />
                  ))}
                  {lista.length > PUNTOS_POR_DIA && (
                    <span className="text-[0.62rem] font-semibold text-tinta-media">
                      +{lista.length - PUNTOS_POR_DIA}
                    </span>
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
