import { calcularRangoFecha, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularEstadisticas } from "@/lib/estadisticas";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "./ImprimirBoton";

export const dynamic = "force-dynamic";

export default async function ImprimirEstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "30dias";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ??
    calcularRangoFecha("30dias", undefined, undefined)!;

  const stats = await calcularEstadisticas(rango);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };

  const filasKpi: [string, string][] = [
    ["Ingresos", formatearGuarani(stats.ingresos)],
    ["Pedidos totales", String(stats.pedidosTotales)],
    ["Pedidos válidos", String(stats.pedidosValidos)],
    ["Ticket promedio", formatearGuarani(Math.round(stats.ticketPromedio))],
    ["Clientes únicos", String(stats.clientesUnicos)],
    ["Unidades vendidas", String(stats.unidadesVendidas)],
    ["Productos por pedido", stats.productosPorPedido.toFixed(1)],
    ["Clientes nuevos", String(stats.clientesNuevos)],
    ["Cancelados", String(stats.cancelados)],
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-neutral-200 pb-6">
        {stats.store?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stats.store.logoUrl}
            alt={stats.store.nombre}
            className="h-16 w-16 flex-none rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            {stats.store?.nombre ?? "Reporte de estadísticas"}
          </h1>
          {stats.store?.direccion && (
            <p className="text-sm text-neutral-500">{stats.store.direccion}</p>
          )}
          <p className="mt-1 text-sm text-neutral-500">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
            {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
          </p>
        </div>
      </div>

      <table className="mb-10 w-full border-collapse text-sm">
        <tbody>
          {filasKpi.map(([etiqueta, valor]) => (
            <tr key={etiqueta} className="border-b border-neutral-200">
              <td className="py-2 text-neutral-600">{etiqueta}</td>
              <td className="py-2 text-right font-semibold text-neutral-900">{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-3 font-semibold text-neutral-800">Ventas por día</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="py-1.5">Fecha</th>
            <th className="py-1.5 text-right">Ventas</th>
          </tr>
        </thead>
        <tbody>
          {stats.dias.map((d) => {
            const clave = claveDia(d);
            return (
              <tr key={clave} className="border-b border-neutral-100">
                <td className="py-1.5 text-neutral-600">
                  {d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO })}
                </td>
                <td className="py-1.5 text-right text-neutral-900">
                  {formatearGuarani(Math.round(stats.totalesPorDia.get(clave) ?? 0))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
