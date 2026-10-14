import Link from "next/link";
import { VISTAS_AGENDA, fechaVecina, tituloAgenda } from "@/lib/agenda";
import { urlCanchas, type ParametrosCanchas } from "@/lib/canchas";
import { clasesBoton } from "@/components/ui";

/**
 * La barra de arriba del calendario de canchas: ir a hoy, moverse entre períodos, elegir la vista (Día, Semana, Mes) e ir
 * a una fecha cualquiera. Es la misma barra que la Agenda de turnos, en su versión sin JavaScript: todo son enlaces y un
 * formulario común, y lo que se elige queda en la dirección de la página (se puede volver atrás, recargar o compartir).
 *
 * En el celular se parte sola en dos filas: arriba Hoy, las flechas y el título; abajo Día/Semana/Mes a lo ancho.
 */
export function BarraCanchas({
  parametros,
  hoy,
}: {
  parametros: ParametrosCanchas;
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
}) {
  const vista = parametros.vista ?? "dia";
  const titulo = tituloAgenda(vista, parametros.fecha);
  const alrededor = { dia: ["Día anterior", "Día siguiente"], semana: ["Semana anterior", "Semana siguiente"], mes: ["Mes anterior", "Mes siguiente"] }[vista];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ---------- ir a hoy y moverse entre períodos ---------- */}
      <div className="flex items-center gap-1">
        <Link
          href={urlCanchas(parametros, { fecha: hoy })}
          scroll={false}
          aria-current={parametros.fecha === hoy ? "date" : undefined}
          className={clasesBoton("navegar", "sm")}
        >
          Hoy
        </Link>
        <Link
          href={urlCanchas(parametros, { fecha: fechaVecina(vista, parametros.fecha, -1) })}
          scroll={false}
          aria-label={alrededor[0]}
          className={clasesBoton("suave", "sm")}
        >
          ‹
        </Link>
        <Link
          href={urlCanchas(parametros, { fecha: fechaVecina(vista, parametros.fecha, 1) })}
          scroll={false}
          aria-label={alrededor[1]}
          className={clasesBoton("suave", "sm")}
        >
          ›
        </Link>
      </div>

      {/* El título del período: el día, la semana o el mes que se está mirando. */}
      <h2 className="order-2 min-w-0 flex-1 truncate text-[0.95rem] capitalize font-semibold tracking-titular text-tinta sm:order-none sm:min-w-[10rem]">
        {titulo}
      </h2>

      {/* ---------- Día / Semana / Mes: tres botones juntos, el elegido resaltado en azul ---------- */}
      <div role="tablist" aria-label="Ver por" className="order-4 flex w-full rounded-lg bg-papel-hundido p-1 sm:order-none sm:w-auto">
        {VISTAS_AGENDA.map((v) => {
          const elegida = v.valor === vista;
          return (
            <Link
              key={v.valor}
              href={urlCanchas(parametros, { vista: v.valor })}
              scroll={false}
              role="tab"
              aria-selected={elegida}
              className={`flex h-9 flex-1 items-center justify-center rounded-md px-4 text-[0.85rem] font-semibold transition-colors duration-150 sm:h-7 ${
                elegida ? "bg-superficie text-azul-oscuro shadow-sm ring-1 ring-azul/25" : "text-tinta-media hover:text-tinta"
              }`}
            >
              {v.etiqueta}
            </Link>
          );
        })}
      </div>

      {/* ---------- ir a otro día: un formulario común (sin JavaScript), igual que los filtros de los reportes ---------- */}
      <form method="get" action="/admin/canchas" className="order-3 flex items-center gap-1.5 sm:order-none">
        {vista !== "dia" && <input type="hidden" name="vista" value={vista} />}
        {parametros.tipo && <input type="hidden" name="tipo" value={parametros.tipo} />}
        {parametros.solo && <input type="hidden" name="solo" value={parametros.solo} />}
        {parametros.canceladas && <input type="hidden" name="canceladas" value="1" />}
        <input
          type="date"
          name="fecha"
          defaultValue={parametros.fecha}
          aria-label="Ir a un día"
          className="cifra h-9 rounded-lg border border-linea bg-superficie px-2 text-[0.84rem] text-tinta"
        />
        <button type="submit" className={clasesBoton("navegar", "sm")}>
          Ir
        </button>
      </form>
    </div>
  );
}
