import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera, clasesBoton } from "@/components/ui";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularReporteProductosVendidos } from "@/lib/reporte-productos";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "mes", label: "Este mes" },
  { value: "mesAnterior", label: "Mes anterior" },
  { value: "30dias", label: "Últimos 30 días" },
];

export default async function ProductosVendidosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  function querystringActual() {
    const params = new URLSearchParams();
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    return params.toString();
  }

  const storeId = await idLocalActual();
  const reporte = await calcularReporteProductosVendidos(storeId, rango);

  return (
    <div>
      <Cabecera
        titulo="Rentabilidad"
        bajada="Qué se vendió, por categoría, con el margen de cada producto — para saber qué te conviene empujar y qué te está regalando plata."
        acciones={
          <>
            <a
              href={`/admin/productos-vendidos/exportar?${querystringActual()}`}
              className={clasesBoton("principal", "sm")}
            >
              Descargar Excel
            </a>
            <a
              href={`/admin/productos-vendidos/imprimir?${querystringActual()}`}
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
            href={`/admin/productos-vendidos?fecha=${f.value}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form
          method="get"
          action="/admin/productos-vendidos"
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

      {reporte.categorias.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay ventas en este período.</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TarjetaTotal etiqueta="Unidades vendidas" valor={String(reporte.totalGeneral.cantidad)} />
            <TarjetaTotal etiqueta="Venta total" valor={formatearGuarani(Math.round(reporte.totalGeneral.venta))} />
            <TarjetaTotal
              etiqueta="Costo total"
              valor={reporte.totalGeneral.costo != null ? formatearGuarani(Math.round(reporte.totalGeneral.costo)) : "—"}
            />
            <TarjetaTotal
              etiqueta="Ganancia total"
              valor={reporte.totalGeneral.ganancia != null ? formatearGuarani(Math.round(reporte.totalGeneral.ganancia)) : "—"}
              destacada
            />
          </div>

          {reporte.totalGeneral.costoIncompleto && (
            <p className="mb-6 rounded-lg border border-aviso/30 bg-aviso-luz px-3 py-2 text-xs text-aviso">
              Hay productos vendidos sin costo cargado — el costo y la ganancia de esas filas (y de
              los totales que las incluyen) no están, no son cero. Cargales el costo desde la
              ficha del producto para que el número quede completo.
            </p>
          )}

          <div className="flex flex-col gap-8">
            {reporte.categorias.map((cat) => (
              <div key={cat.categoriaId ?? "combos"}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-tinta">{cat.categoriaNombre}</h2>
                  <p className="text-xs text-tinta-suave">
                    {cat.totalCantidad} {cat.totalCantidad === 1 ? "unidad" : "unidades"} ·{" "}
                    {formatearGuarani(Math.round(cat.totalVenta))}
                    {cat.totalGanancia != null && (
                      <> · ganancia {formatearGuarani(Math.round(cat.totalGanancia))}</>
                    )}
                  </p>
                </div>

                <div className="overflow-x-auto rounded-lg border border-linea bg-white">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-linea bg-papel-suave text-xs uppercase tracking-wide text-tinta-media">
                      <tr>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2 text-right">Cantidad</th>
                        <th className="px-3 py-2 text-right">Precio venta</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                        <th className="px-3 py-2 text-right">Margen</th>
                        <th className="px-3 py-2 text-right">Ganancia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.filas.map((f) => (
                        <tr key={f.nombre} className="border-b border-linea-fina last:border-0">
                          <td className="px-3 py-2 font-medium text-tinta">{f.nombre}</td>
                          <td className="cifra px-3 py-2 text-right text-tinta-media">{f.cantidad}</td>
                          <td className="cifra px-3 py-2 text-right text-tinta-media">
                            {formatearGuarani(Math.round(f.precioVentaUnitario))}
                          </td>
                          <td className="cifra px-3 py-2 text-right text-tinta-media">
                            {f.costoUnitario != null ? formatearGuarani(Math.round(f.costoUnitario)) : "—"}
                          </td>
                          <td className="cifra px-3 py-2 text-right text-tinta-media">
                            {f.margen != null ? `${f.margen.toFixed(0)}%` : "—"}
                          </td>
                          <td className="cifra px-3 py-2 text-right font-semibold text-tinta">
                            {f.ganancia != null ? formatearGuarani(Math.round(f.ganancia)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TarjetaTotal({
  etiqueta,
  valor,
  destacada,
}: {
  etiqueta: string;
  valor: string;
  destacada?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        destacada ? "border-exito/25 bg-exito-luz" : "border-linea bg-white"
      }`}
    >
      <p
        className={`text-[0.68rem] font-semibold uppercase tracking-rotulo ${
          destacada ? "text-exito" : "text-tinta-media"
        }`}
      >
        {etiqueta}
      </p>
      <p className={`cifra mt-1.5 text-[1.3rem] font-semibold leading-none ${destacada ? "text-exito" : "text-tinta"}`}>
        {valor}
      </p>
    </div>
  );
}
