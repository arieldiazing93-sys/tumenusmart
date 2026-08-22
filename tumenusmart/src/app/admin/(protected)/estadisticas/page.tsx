import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
import {
  calcularEstadisticas,
  calcularEstadisticasReservas,
  calcularRankingProductos,
} from "@/lib/estadisticas";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaTurno } from "@/lib/reservas";
import { VentasPorDiaChart } from "@/components/VentasPorDiaChart";
import { MapaCalor } from "@/components/MapaCalor";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
];

function Tarjeta({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-neutral-400">{detalle}</p>}
    </div>
  );
}

export default async function AdminEstadisticasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "30dias";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ??
    calcularRangoFecha("30dias", undefined, undefined)!;

  function hrefFecha(nuevaFecha: FiltroFecha) {
    return `/admin/estadisticas?fecha=${nuevaFecha}`;
  }

  function querystringActual() {
    const params = new URLSearchParams();
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    return params.toString();
  }

  const [stats, statsReservas, ranking] = await Promise.all([
    calcularEstadisticas(rango),
    calcularEstadisticasReservas(rango),
    calcularRankingProductos(rango),
  ]);

  const datosChart = stats.dias.map((d) => ({
    etiqueta: d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO }),
    total: stats.totalesPorDia.get(claveDia(d)) ?? 0,
  }));

  const datosChartReservas = statsReservas.dias.map((d) => ({
    etiqueta: d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO }),
    total: statsReservas.totalesPorDia.get(claveDia(d)) ?? 0,
  }));

  const maxPorTurno = Math.max(1, statsReservas.porTurno.dia, statsReservas.porTurno.tarde, statsReservas.porTurno.noche);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">Estadísticas</h1>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/admin/estadisticas/exportar?${querystringActual()}`}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-brand hover:text-brand"
          >
            ⬇ Descargar CSV (Excel)
          </a>
          <a
            href={`/admin/estadisticas/imprimir?${querystringActual()}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-brand hover:text-brand"
          >
            🖨 Ver reporte / Guardar como PDF
          </a>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={hrefFecha(f.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value && fechaActiva !== "rango"
                ? "border-brand bg-brand text-white"
                : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form
          method="get"
          action="/admin/estadisticas"
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-sm ${
            fechaActiva === "rango" ? "border-brand bg-brand-light" : "border-neutral-300"
          }`}
        >
          <input type="hidden" name="fecha" value="rango" />
          <input
            type="date"
            name="desde"
            defaultValue={fechaActiva === "rango" ? desde : ""}
            required
            className="rounded-md border border-neutral-300 px-1.5 py-1 text-xs"
          />
          <span className="text-neutral-400">–</span>
          <input
            type="date"
            name="hasta"
            defaultValue={fechaActiva === "rango" ? hasta : ""}
            required
            className="rounded-md border border-neutral-300 px-1.5 py-1 text-xs"
          />
          <button
            type="submit"
            className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Tarjeta etiqueta="Ingresos" valor={formatearGuarani(stats.ingresos)} detalle="Sin contar cancelados" />
        <Tarjeta etiqueta="Pedidos" valor={String(stats.pedidosTotales)} detalle={`${stats.pedidosValidos} válidos`} />
        <Tarjeta etiqueta="Ticket promedio" valor={formatearGuarani(Math.round(stats.ticketPromedio))} />
        <Tarjeta etiqueta="Clientes únicos" valor={String(stats.clientesUnicos)} />
        <Tarjeta etiqueta="Unidades vendidas" valor={String(stats.unidadesVendidas)} />
        <Tarjeta etiqueta="Productos por pedido" valor={stats.productosPorPedido.toFixed(1)} />
        <Tarjeta etiqueta="Clientes nuevos" valor={String(stats.clientesNuevos)} detalle="Su primer pedido fue en este período" />
        <Tarjeta etiqueta="Cancelados" valor={String(stats.cancelados)} />
      </div>

      <div className="mb-8">
        <h2 className="mb-3 font-semibold text-neutral-800">Ventas por día</h2>
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <VentasPorDiaChart datos={datosChart} />
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 font-semibold text-neutral-800">Productos más vendidos</h2>

        {ranking.masVendidos.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Todavía no hay ventas en este período.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white lg:col-span-2">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 w-8">#</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Unidades</th>
                    <th className="px-3 py-2 text-right">Facturación</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.masVendidos.map((fila, i) => (
                    <tr key={fila.nombre} className="border-b border-neutral-100 last:border-0">
                      <td className="px-3 py-2 font-semibold text-neutral-400">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-neutral-900">{fila.nombre}</p>
                        {/* Barra proporcional al más vendido, para ver de un
                            vistazo cuánto se despega el primero del resto. */}
                        <div className="mt-1 h-1.5 w-full max-w-[220px] rounded-full bg-neutral-100">
                          <div
                            className="h-1.5 rounded-full bg-brand"
                            style={{
                              width: `${
                                (fila.unidades / ranking.masVendidos[0].unidades) * 100
                              }%`,
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-semibold text-neutral-900">{fila.unidades}</span>
                        <span className="block text-xs text-neutral-400">
                          {fila.porcentaje.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-neutral-700">
                        {formatearGuarani(Math.round(fila.facturacion))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="mb-1 text-sm font-medium text-neutral-700">Sin ventas</p>
              <p className="mb-3 text-xs text-neutral-500">
                Productos visibles en el menú que no vendieron ni una unidad en este período.
              </p>
              {ranking.sinVentas.length === 0 ? (
                <p className="text-sm text-green-700">
                  Todos los productos del menú vendieron al menos una vez. 👏
                </p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm text-neutral-600">
                  {ranking.sinVentas.slice(0, 12).map((nombre) => (
                    <li key={nombre} className="truncate">
                      · {nombre}
                    </li>
                  ))}
                  {ranking.sinVentas.length > 12 && (
                    <li className="text-xs text-neutral-400">
                      y {ranking.sinVentas.length - 12} más
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-neutral-800">Reservas</h2>
          <Link
            href="/admin/reservas"
            className="text-sm text-brand hover:underline"
          >
            Ver calendario →
          </Link>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tarjeta etiqueta="Reservas" valor={String(statsReservas.total)} detalle="En este período" />
          <Tarjeta etiqueta="Personas esperadas" valor={String(statsReservas.personasTotales)} />
          <Tarjeta etiqueta="Confirmadas" valor={String(statsReservas.porEstado.confirmada)} />
          <Tarjeta
            etiqueta="Pendientes / canceladas"
            valor={`${statsReservas.porEstado.pendiente} / ${statsReservas.porEstado.cancelada}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 lg:col-span-2">
            <p className="mb-2 text-sm font-medium text-neutral-700">Reservas por día</p>
            <VentasPorDiaChart datos={datosChartReservas} sufijoTooltip="reservas" color="#0891b2" />
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="mb-3 text-sm font-medium text-neutral-700">Por turno</p>
            <div className="flex flex-col gap-3">
              {(["dia", "tarde", "noche"] as const).map((t) => (
                <div key={t}>
                  <div className="mb-1 flex justify-between text-xs text-neutral-500">
                    <span>{etiquetaTurno(t)}</span>
                    <span>{statsReservas.porTurno[t]}</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100">
                    <div
                      className="h-2 rounded-full bg-cyan-600"
                      style={{ width: `${(statsReservas.porTurno[t] / maxPorTurno) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {statsReservas.total === 0 && (
                <p className="text-xs text-neutral-400">Sin reservas en este período.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-neutral-800">Dónde se están pidiendo los deliveries</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Cada pedido con entrega a domicilio se marca como un círculo — donde se
          superponen varios, se ve más oscuro, mostrando las zonas con más pedidos.
        </p>
        {stats.puntosCalor.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Todavía no hay pedidos de delivery con ubicación en este período.
          </p>
        ) : (
          <MapaCalor
            storeLat={stats.store?.lat ?? null}
            storeLng={stats.store?.lng ?? null}
            puntos={stats.puntosCalor}
          />
        )}
      </div>
    </div>
  );
}
