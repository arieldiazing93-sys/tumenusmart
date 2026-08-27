import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { calcularRangoFecha, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
import {
  calcularEstadisticas,
  calcularEstadisticasReservas,
  calcularRankingProductos,
} from "@/lib/estadisticas";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaTurno } from "@/lib/reservas";
import { ImprimirBoton } from "./ImprimirBoton";

export const dynamic = "force-dynamic";

export default async function ImprimirEstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "30dias";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ??
    calcularRangoFecha("30dias", undefined, undefined)!;

  const storeId = await idLocalActual();

  const [stats, statsReservas, ranking] = await Promise.all([
    calcularEstadisticas(storeId, rango),
    calcularEstadisticasReservas(storeId, rango),
    calcularRankingProductos(storeId, rango, 20),
  ]);

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

  const filasKpiReservas: [string, string][] = [
    ["Reservas totales", String(statsReservas.total)],
    ["Personas esperadas", String(statsReservas.personasTotales)],
    ["Confirmadas", String(statsReservas.porEstado.confirmada)],
    ["Pendientes", String(statsReservas.porEstado.pendiente)],
    ["Canceladas", String(statsReservas.porEstado.cancelada)],
    [`Turno ${etiquetaTurno("dia")}`, String(statsReservas.porTurno.dia)],
    [`Turno ${etiquetaTurno("tarde")}`, String(statsReservas.porTurno.tarde)],
    [`Turno ${etiquetaTurno("noche")}`, String(statsReservas.porTurno.noche)],
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-linea pb-6">
        {stats.store?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stats.store.logoUrl}
            alt={stats.store.nombre}
            className="h-16 w-16 flex-none rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">
            {stats.store?.nombre ?? "Reporte de estadísticas"}
          </h1>
          {stats.store?.direccion && (
            <p className="text-sm text-tinta-media">{stats.store.direccion}</p>
          )}
          <p className="mt-1 text-sm text-tinta-media">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
            {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
          </p>
        </div>
      </div>

      <table className="mb-10 w-full border-collapse text-sm">
        <tbody>
          {filasKpi.map(([etiqueta, valor]) => (
            <tr key={etiqueta} className="border-b border-linea">
              <td className="py-2 text-tinta-media">{etiqueta}</td>
              <td className="py-2 text-right font-semibold text-tinta">{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-3 font-semibold text-tinta">Ventas por día</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
            <th className="py-1.5">Fecha</th>
            <th className="py-1.5 text-right">Ventas</th>
          </tr>
        </thead>
        <tbody>
          {stats.dias.map((d) => {
            const clave = claveDia(d);
            return (
              <tr key={clave} className="border-b border-linea-fina">
                <td className="py-1.5 text-tinta-media">
                  {d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO })}
                </td>
                <td className="py-1.5 text-right text-tinta">
                  {formatearGuarani(Math.round(stats.totalesPorDia.get(clave) ?? 0))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="mb-3 mt-10 font-semibold text-tinta">Productos más vendidos</h2>
      {ranking.masVendidos.length === 0 ? (
        <p className="mb-10 text-sm text-tinta-suave">Sin ventas en este período.</p>
      ) : (
        <table className="mb-10 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">#</th>
              <th className="py-1.5">Producto</th>
              <th className="py-1.5 text-right">Unidades</th>
              <th className="py-1.5 text-right">Facturación</th>
            </tr>
          </thead>
          <tbody>
            {ranking.masVendidos.map((fila, i) => (
              <tr key={fila.nombre} className="border-b border-linea-fina">
                <td className="py-1.5 text-tinta-suave">{i + 1}</td>
                <td className="py-1.5 text-tinta">{fila.nombre}</td>
                <td className="py-1.5 text-right font-semibold text-tinta">
                  {fila.unidades}
                </td>
                <td className="py-1.5 text-right text-tinta-media">
                  {formatearGuarani(Math.round(fila.facturacion))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {ranking.sinVentas.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-2 font-semibold text-tinta">Sin ventas en el período</h2>
          <p className="text-sm text-tinta-media">{ranking.sinVentas.join(" · ")}</p>
        </div>
      )}

      <h2 className="mb-3 mt-10 font-semibold text-tinta">Reservas</h2>
      <table className="mb-10 w-full border-collapse text-sm">
        <tbody>
          {filasKpiReservas.map(([etiqueta, valor]) => (
            <tr key={etiqueta} className="border-b border-linea">
              <td className="py-2 text-tinta-media">{etiqueta}</td>
              <td className="py-2 text-right font-semibold text-tinta">{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-3 font-semibold text-tinta">Reservas por día</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
            <th className="py-1.5">Fecha</th>
            <th className="py-1.5 text-right">Reservas</th>
          </tr>
        </thead>
        <tbody>
          {statsReservas.dias.map((d) => {
            const clave = claveDia(d);
            return (
              <tr key={clave} className="border-b border-linea-fina">
                <td className="py-1.5 text-tinta-media">
                  {d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO })}
                </td>
                <td className="py-1.5 text-right text-tinta">
                  {statsReservas.totalesPorDia.get(clave) ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
