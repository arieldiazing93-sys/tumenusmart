import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, listarDias, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
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

  const [store, pedidos, primerPedidoPorCliente] = await Promise.all([
    prisma.store.findFirst(),
    prisma.order.findMany({
      where: { createdAt: rango },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.groupBy({ by: ["clienteTelefono"], _min: { createdAt: true } }),
  ]);

  const validos = pedidos.filter((p) => p.estado !== "cancelado");
  const cancelados = pedidos.filter((p) => p.estado === "cancelado");

  const ingresos = validos.reduce((s, p) => s + Number(p.total), 0);
  const pedidosTotales = pedidos.length;
  const pedidosValidos = validos.length;
  const ticketPromedio = pedidosValidos > 0 ? ingresos / pedidosValidos : 0;

  const unidadesVendidas = validos.reduce(
    (s, p) => s + p.items.reduce((si, it) => si + it.cantidad, 0),
    0
  );
  const productosPorPedido = pedidosValidos > 0 ? unidadesVendidas / pedidosValidos : 0;

  const clientesUnicos = new Set(pedidos.map((p) => p.clienteTelefono)).size;

  const clientesNuevos = primerPedidoPorCliente.filter((c) => {
    const primera = c._min.createdAt;
    return primera && primera >= rango.gte && primera < rango.lt;
  }).length;

  const dias = listarDias(rango.gte, rango.lt);
  const totalesPorDia = new Map<string, number>();
  for (const d of dias) totalesPorDia.set(claveDia(d), 0);
  for (const p of validos) {
    const clave = claveDia(new Date(p.createdAt));
    totalesPorDia.set(clave, (totalesPorDia.get(clave) ?? 0) + Number(p.total));
  }
  const datosChart = dias.map((d) => ({
    etiqueta: d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit" }),
    total: totalesPorDia.get(claveDia(d)) ?? 0,
  }));

  const puntosCalor = pedidos
    .filter((p) => p.tipoEntrega === "delivery" && p.clienteLat != null && p.clienteLng != null)
    .map((p) => ({ lat: p.clienteLat as number, lng: p.clienteLng as number }));

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Estadísticas</h1>

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
        <Tarjeta etiqueta="Ingresos" valor={formatearGuarani(ingresos)} detalle="Sin contar cancelados" />
        <Tarjeta etiqueta="Pedidos" valor={String(pedidosTotales)} detalle={`${pedidosValidos} válidos`} />
        <Tarjeta etiqueta="Ticket promedio" valor={formatearGuarani(Math.round(ticketPromedio))} />
        <Tarjeta etiqueta="Clientes únicos" valor={String(clientesUnicos)} />
        <Tarjeta etiqueta="Unidades vendidas" valor={String(unidadesVendidas)} />
        <Tarjeta etiqueta="Productos por pedido" valor={productosPorPedido.toFixed(1)} />
        <Tarjeta etiqueta="Clientes nuevos" valor={String(clientesNuevos)} detalle="Su primer pedido fue en este período" />
        <Tarjeta etiqueta="Cancelados" valor={String(cancelados.length)} />
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
        {puntosCalor.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Todavía no hay pedidos de delivery con ubicación en este período.
          </p>
        ) : (
          <MapaCalor storeLat={store?.lat ?? null} storeLng={store?.lng ?? null} puntos={puntosCalor} />
        )}
      </div>
    </div>
  );
}
