import { Fragment } from "react";
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
            <TarjetaTotal color="volumen" etiqueta="Unidades vendidas" valor={String(reporte.totalGeneral.cantidad)} />
            <TarjetaTotal color="dinero" etiqueta="Venta total" valor={formatearGuarani(Math.round(reporte.totalGeneral.venta))} />
            <TarjetaTotal
              color="costo"
              etiqueta="Costo total"
              valor={reporte.totalGeneral.costo != null ? formatearGuarani(Math.round(reporte.totalGeneral.costo)) : "—"}
            />
            <TarjetaTotal
              color="ganancia"
              etiqueta="Ganancia total"
              valor={reporte.totalGeneral.ganancia != null ? formatearGuarani(Math.round(reporte.totalGeneral.ganancia)) : "—"}
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
                        <Fragment key={f.nombre}>
                          <tr
                            className={f.ventaAgregados > 0 ? "border-linea-fina" : "border-b border-linea-fina last:border-0"}
                          >
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
                          {/*
                            Lo que aportaron los agregados (papas, extras...) vendidos junto con
                            este producto, aparte — para que no se lea como si el producto en sí
                            vendiera más caro o dejara más ganancia de lo que en realidad es suya.
                            Los valores son TOTALES del período, no por unidad como la fila de
                            arriba (un agregado no tiene un "precio por unidad de producto").
                          */}
                          {f.ventaAgregados > 0 && (
                            <tr key={`${f.nombre}-agregados`} className="border-b border-linea-fina bg-papel-suave/60 text-xs last:border-0">
                              <td className="px-3 py-1.5 pl-6 text-tinta-suave">+ agregados vendidos con este producto</td>
                              <td />
                              <td className="cifra px-3 py-1.5 text-right text-tinta-suave">
                                {formatearGuarani(Math.round(f.ventaAgregados))}
                              </td>
                              <td className="cifra px-3 py-1.5 text-right text-tinta-suave">
                                {f.costoAgregados != null ? formatearGuarani(Math.round(f.costoAgregados)) : "—"}
                              </td>
                              <td />
                              <td className="cifra px-3 py-1.5 text-right text-tinta-suave">
                                {f.gananciaAgregados != null ? formatearGuarani(Math.round(f.gananciaAgregados)) : "—"}
                              </td>
                            </tr>
                          )}
                        </Fragment>
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

// Mismo criterio que en Estadísticas: el color agrupa por significado, no
// decora. Volumen (azul) es cuánto se movió. Dinero (verde) es lo que entró.
// Costo (ámbar) es lo que salió — atención, no error, por eso no es rojo.
// Ganancia (verde fuerte) es la única que importa de verdad en esta
// pantalla, así que se destaca más que el resto.
const COLORES_TOTAL = {
  volumen: { caja: "border-azul/25 bg-azul-luz", rotulo: "text-azul-oscuro", cifra: "text-azul-oscuro" },
  dinero: { caja: "border-exito/25 bg-exito-luz", rotulo: "text-exito", cifra: "text-exito" },
  costo: { caja: "border-aviso/30 bg-aviso-luz", rotulo: "text-aviso", cifra: "text-aviso" },
  // Fondo sólido y no el mismo verde tenue de "Venta total": es el único
  // número por el que existe esta pantalla, tiene que ganarle al resto de
  // un vistazo, no confundirse con "venta" por usar el mismo tono.
  ganancia: { caja: "border-exito bg-exito", rotulo: "text-white/80", cifra: "text-white" },
} as const;

function TarjetaTotal({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: string;
  color: keyof typeof COLORES_TOTAL;
}) {
  const c = COLORES_TOTAL[color];
  return (
    <div className={`rounded-xl border p-4 ${c.caja}`}>
      <p className={`text-[0.68rem] font-semibold uppercase tracking-rotulo ${c.rotulo}`}>{etiqueta}</p>
      <p className={`cifra mt-1.5 text-[1.3rem] font-semibold leading-none ${c.cifra}`}>{valor}</p>
    </div>
  );
}
