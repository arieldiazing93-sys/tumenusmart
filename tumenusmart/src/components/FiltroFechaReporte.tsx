import Link from "next/link";

/**
 * El filtro de fechas de un reporte: los atajos (Hoy, Ayer, Este mes…) y, aparte, un rango "desde – hasta". Pensado para el celular:
 * el dueño mira los reportes desde donde esté.
 *
 *  - En el celular los atajos van en UNA fila que se desliza con el dedo (no se parten en tres líneas) y el rango es un cuadro con los dos
 *    campos de fecha lado a lado, con su rótulo, y el botón "Filtrar" a lo ancho. Las fechas usan letra de 16 px: con menos, el iPhone
 *    amplía la pantalla al tocar el campo.
 *  - En una pantalla más ancha vuelve a ser una sola fila: atajos, y el rango en su píldora.
 *
 * No necesita JavaScript: los atajos son enlaces y el rango es un formulario GET a `accion`. `conservar` son otros filtros de la pantalla
 * que tienen que seguir al cambiar de fecha (se mandan en cada enlace y como campos ocultos).
 */
export function FiltroFechaReporte({
  accion,
  opciones,
  activa,
  desde,
  hasta,
  conservar = {},
  conHora = false,
  parametro = "fecha",
}: {
  /** La dirección de la pantalla ("/admin/estadisticas"). */
  accion: string;
  opciones: { value: string; label: string }[];
  /** El atajo elegido ("hoy", "mes"…) o "rango". */
  activa: string;
  desde?: string;
  hasta?: string;
  conservar?: Record<string, string | undefined>;
  /** El rango con hora (fecha y hora de cada extremo), no solo con día. */
  conHora?: boolean;
  /** Cómo se llama en la dirección el atajo elegido ("fecha" en casi todas; "vista" en Reservas). */
  parametro?: string;
}) {
  const otros = Object.entries(conservar).filter((par): par is [string, string] => typeof par[1] === "string" && par[1] !== "");
  const hrefDe = (valor: string) => {
    const params = new URLSearchParams();
    params.set(parametro, valor);
    for (const [k, v] of otros) params.set(k, v);
    return `${accion}?${params.toString()}`;
  };
  const enRango = activa === "rango";

  return (
    <div className="mb-5 flex flex-col gap-2.5 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      {/* Los atajos: en el celular, una fila que se desliza hacia el costado. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
        {opciones.map((o) => (
          <Link
            key={o.value}
            href={hrefDe(o.value)}
            className={`flex-none whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium sm:px-3 sm:py-1.5 ${
              activa === o.value && !enRango
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {o.label}
          </Link>
        ))}
      </div>

      {/* El rango de fechas: dos campos lado a lado y el botón a lo ancho (en el celular); una píldora en una fila (en pantalla ancha). */}
      <form
        method="get"
        action={accion}
        className={`grid grid-cols-2 items-end gap-2 rounded-xl border p-2.5 sm:flex sm:items-center sm:gap-1.5 sm:rounded-full sm:px-2 sm:py-1 ${
          enRango ? "border-brand bg-brand-light" : "border-linea"
        }`}
      >
        <input type="hidden" name={parametro} value="rango" />
        {otros.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="flex min-w-0 flex-col gap-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-tinta-suave sm:block sm:text-[0.7rem]">
          <span className="sm:sr-only">Desde</span>
          <input
            type={conHora ? "datetime-local" : "date"}
            name="desde"
            defaultValue={enRango ? desde : ""}
            required
            aria-label="Desde"
            className="w-full min-w-0 rounded-lg border border-linea bg-superficie px-2 py-2 text-[16px] font-normal normal-case text-tinta sm:w-auto sm:rounded-md sm:px-1.5 sm:py-1 sm:text-xs"
          />
        </label>
        <span aria-hidden="true" className="hidden text-tinta-suave sm:inline">
          –
        </span>
        <label className="flex min-w-0 flex-col gap-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-tinta-suave sm:block sm:text-[0.7rem]">
          <span className="sm:sr-only">Hasta</span>
          <input
            type={conHora ? "datetime-local" : "date"}
            name="hasta"
            defaultValue={enRango ? hasta : ""}
            required
            aria-label="Hasta"
            className="w-full min-w-0 rounded-lg border border-linea bg-superficie px-2 py-2 text-[16px] font-normal normal-case text-tinta sm:w-auto sm:rounded-md sm:px-1.5 sm:py-1 sm:text-xs"
          />
        </label>
        <button
          type="submit"
          className="col-span-2 rounded-lg bg-noche-panel px-3 py-2.5 text-sm font-medium text-white hover:bg-noche-panel sm:col-auto sm:rounded-full sm:py-1 sm:text-xs"
        >
          Filtrar
        </button>
      </form>
    </div>
  );
}
