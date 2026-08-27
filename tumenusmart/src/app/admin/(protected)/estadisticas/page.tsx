import { Cabecera, clasesBoton } from "@/components/ui";
import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import { idLocalActual } from "@/lib/local-actual";
import { calcularRangoFecha, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
import {
  calcularEstadisticas,
  calcularEstadisticasReservas,
  calcularRankingProductos,
} from "@/lib/estadisticas";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaTurno } from "@/lib/reservas";
import { VentasPorDiaChart } from "@/components/VentasPorDiaChart";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
];

/**
 * El color de cada tarjeta no es decorativo: agrupa.
 *
 * Verde es la plata que entró. Azul es volumen (cuántos pedidos, cuántas
 * unidades). Violeta son los promedios. Naranja son los clientes. Rojo es lo
 * que se perdió. Dos tarjetas del mismo color se leen como parientes, y con
 * ocho números en pantalla eso ahorra la mitad del trabajo de entenderlas.
 *
 * Ocho colores distintos habrían sido ocho cosas gritando lo mismo.
 */
const COLORES_TARJETA = {
  dinero: { caja: "border-exito/25 bg-exito-luz", rotulo: "text-exito", cifra: "text-exito" },
  volumen: { caja: "border-azul/25 bg-azul-luz", rotulo: "text-azul-oscuro", cifra: "text-azul-oscuro" },
  promedio: { caja: "border-violeta/25 bg-violeta-luz", rotulo: "text-violeta-oscuro", cifra: "text-violeta-oscuro" },
  // Ámbar y no naranja: el naranja de marca queda al lado del rojo de
  // cancelados en la grilla, y a un metro de distancia se confunden. El ámbar
  // se despega, y de paso deja el naranja libre para lo que de verdad es un
  // acento —el botón de descargar—, que es donde tiene que llamar la atención.
  clientes: { caja: "border-aviso/30 bg-aviso-luz", rotulo: "text-aviso", cifra: "text-aviso" },
  perdido: { caja: "border-peligro/25 bg-peligro-luz", rotulo: "text-peligro", cifra: "text-peligro" },
} as const;

function Tarjeta({
  etiqueta,
  valor,
  detalle,
  color,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  color: keyof typeof COLORES_TARJETA;
}) {
  const c = COLORES_TARJETA[color];
  return (
    <div className={`rounded-xl border p-4 ${c.caja}`}>
      <p className={`text-[0.68rem] font-semibold uppercase tracking-rotulo ${c.rotulo}`}>
        {etiqueta}
      </p>
      <p className={`cifra mt-1.5 text-[1.45rem] font-semibold leading-none ${c.cifra}`}>
        {valor}
      </p>
      {detalle && <p className="mt-1.5 text-[0.72rem] text-tinta-media">{detalle}</p>}
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

  const storeId = await idLocalActual();

  const [stats, statsReservas, ranking] = await Promise.all([
    calcularEstadisticas(storeId, rango),
    calcularEstadisticasReservas(storeId, rango),
    calcularRankingProductos(storeId, rango),
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
      <Cabecera
        titulo="Estadísticas"
        bajada="Cómo viene el negocio en el período que elijas."
        acciones={
          <>
            {/*
              Naranja el que produce algo (el archivo), azul el que lleva a otra
              pantalla. Antes los dos eran de borde gris y no se veía que ahí
              había algo para hacer.
            */}
            <a
              href={`/admin/estadisticas/exportar?${querystringActual()}`}
              className={clasesBoton("principal", "sm")}
            >
              Descargar CSV
            </a>
            <a
              href={`/admin/estadisticas/imprimir?${querystringActual()}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={hrefFecha(f.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value && fechaActiva !== "rango"
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form
          method="get"
          action="/admin/estadisticas"
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-sm ${
            fechaActiva === "rango" ? "border-brand bg-brand-light" : "border-linea"
          }`}
        >
          <input type="hidden" name="fecha" value="rango" />
          <input
            type="date"
            name="desde"
            defaultValue={fechaActiva === "rango" ? desde : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <span className="text-tinta-suave">–</span>
          <input
            type="date"
            name="hasta"
            defaultValue={fechaActiva === "rango" ? hasta : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <button
            type="submit"
            className="rounded-full bg-noche-panel px-3 py-1 text-xs font-medium text-white hover:bg-noche-panel"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Tarjeta color="dinero" etiqueta="Ingresos" valor={formatearGuarani(stats.ingresos)} detalle="Sin contar cancelados" />
        <Tarjeta color="volumen" etiqueta="Pedidos" valor={String(stats.pedidosTotales)} detalle={`${stats.pedidosValidos} válidos`} />
        <Tarjeta color="promedio" etiqueta="Ticket promedio" valor={formatearGuarani(Math.round(stats.ticketPromedio))} />
        <Tarjeta color="clientes" etiqueta="Clientes únicos" valor={String(stats.clientesUnicos)} />
        <Tarjeta color="volumen" etiqueta="Unidades vendidas" valor={String(stats.unidadesVendidas)} />
        <Tarjeta color="promedio" etiqueta="Productos por pedido" valor={stats.productosPorPedido.toFixed(1)} />
        <Tarjeta color="clientes" etiqueta="Clientes nuevos" valor={String(stats.clientesNuevos)} detalle="Su primer pedido fue en este período" />
        <Tarjeta color="perdido" etiqueta="Cancelados" valor={String(stats.cancelados)} />
      </div>

      <div className="mb-8">
        <h2 className="mb-3 font-semibold text-tinta">Ventas por día</h2>
        <div className="rounded-lg border border-linea bg-white p-4">
          <VentasPorDiaChart datos={datosChart} />
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 font-semibold text-tinta">Productos más vendidos</h2>

        {ranking.masVendidos.length === 0 ? (
          <p className="text-sm text-tinta-suave">
            Todavía no hay ventas en este período.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="overflow-hidden rounded-lg border border-linea bg-white lg:col-span-2">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-linea bg-papel-suave text-xs uppercase tracking-wide text-tinta-media">
                  <tr>
                    <th className="px-3 py-2 w-8">#</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Unidades</th>
                    <th className="px-3 py-2 text-right">Facturación</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.masVendidos.map((fila, i) => (
                    <tr key={fila.nombre} className="border-b border-linea-fina last:border-0">
                      <td className="px-3 py-2 font-semibold text-tinta-suave">{i + 1}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-tinta">{fila.nombre}</p>
                        {/* Barra proporcional al más vendido, para ver de un
                            vistazo cuánto se despega el primero del resto. */}
                        <div className="mt-1 h-1.5 w-full max-w-[220px] rounded-full bg-papel-hundido">
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
                        <span className="font-semibold text-tinta">{fila.unidades}</span>
                        <span className="block text-xs text-tinta-suave">
                          {fila.porcentaje.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-tinta-media">
                        {formatearGuarani(Math.round(fila.facturacion))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-linea bg-white p-4">
              <p className="mb-1 text-sm font-medium text-tinta-media">Sin ventas</p>
              <p className="mb-3 text-xs text-tinta-media">
                Productos visibles en el menú que no vendieron ni una unidad en este período.
              </p>
              {ranking.sinVentas.length === 0 ? (
                <p className="text-sm text-exito">
                  Todos los productos del menú vendieron al menos una vez. 👏
                </p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm text-tinta-media">
                  {ranking.sinVentas.slice(0, 12).map((nombre) => (
                    <li key={nombre} className="truncate">
                      · {nombre}
                    </li>
                  ))}
                  {ranking.sinVentas.length > 12 && (
                    <li className="text-xs text-tinta-suave">
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
          <h2 className="font-semibold text-tinta">Reservas</h2>
          <Link
            href="/admin/reservas"
            className="text-sm text-brand hover:underline"
          >
            Ver calendario →
          </Link>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Mismo criterio de color que arriba: azul es volumen, ámbar son
              personas, verde lo confirmado, rojo lo que se cayó. */}
          <Tarjeta color="volumen" etiqueta="Reservas" valor={String(statsReservas.total)} detalle="En este período" />
          <Tarjeta color="clientes" etiqueta="Personas esperadas" valor={String(statsReservas.personasTotales)} />
          <Tarjeta color="dinero" etiqueta="Confirmadas" valor={String(statsReservas.porEstado.confirmada)} />
          <Tarjeta
            color="perdido"
            etiqueta="Pendientes / canceladas"
            valor={`${statsReservas.porEstado.pendiente} / ${statsReservas.porEstado.cancelada}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-linea bg-white p-4 lg:col-span-2">
            <p className="mb-2 text-sm font-medium text-tinta-media">Reservas por día</p>
            <VentasPorDiaChart datos={datosChartReservas} sufijoTooltip="reservas" color="#0891b2" />
          </div>

          <div className="rounded-lg border border-linea bg-white p-4">
            <p className="mb-3 text-sm font-medium text-tinta-media">Por turno</p>
            <div className="flex flex-col gap-3">
              {(["dia", "tarde", "noche"] as const).map((t) => (
                <div key={t}>
                  <div className="mb-1 flex justify-between text-xs text-tinta-media">
                    <span>{etiquetaTurno(t)}</span>
                    <span>{statsReservas.porTurno[t]}</span>
                  </div>
                  <div className="h-2 rounded-full bg-papel-hundido">
                    <div
                      className="h-2 rounded-full bg-cyan-600"
                      style={{ width: `${(statsReservas.porTurno[t] / maxPorTurno) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              {statsReservas.total === 0 && (
                <p className="text-xs text-tinta-suave">Sin reservas en este período.</p>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
