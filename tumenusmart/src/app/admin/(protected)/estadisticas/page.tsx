import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularEstadisticas } from "@/lib/estadisticas";
import { ZONA_NEGOCIO } from "@/lib/timezone";
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

  const stats = await calcularEstadisticas(rango);

  const datosChart = stats.dias.map((d) => ({
    etiqueta: d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", timeZone: ZONA_NEGOCIO }),
    total: stats.totalesPorDia.get(claveDia(d)) ?? 0,
  }));

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
