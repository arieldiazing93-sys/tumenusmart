import { Fragment } from "react";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularReporteProductosVendidos } from "@/lib/reporte-productos";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

export default async function ImprimirProductosVendidosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteProductosVendidos(storeId, rango),
  ]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-linea pb-6">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={local.logoUrl}
            alt={local.nombre}
            className="h-16 w-16 flex-none rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Rentabilidad</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
            {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
          </p>
        </div>
      </div>

      {reporte.categorias.length === 0 ? (
        <p className="text-sm text-tinta-suave">Sin ventas en este período.</p>
      ) : (
        <>
          <table className="mb-10 w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Unidades vendidas</td>
                <td className="py-2 text-right font-semibold text-tinta">{reporte.totalGeneral.cantidad}</td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Venta total</td>
                <td className="py-2 text-right font-semibold text-tinta">
                  {formatearGuarani(Math.round(reporte.totalGeneral.venta))}
                </td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Costo total</td>
                <td className="py-2 text-right font-semibold text-tinta">
                  {reporte.totalGeneral.costo != null
                    ? formatearGuarani(Math.round(reporte.totalGeneral.costo))
                    : "—"}
                </td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Ganancia total</td>
                <td className="py-2 text-right font-semibold text-tinta">
                  {reporte.totalGeneral.ganancia != null
                    ? formatearGuarani(Math.round(reporte.totalGeneral.ganancia))
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>

          {reporte.totalGeneral.costoIncompleto && (
            <p className="mb-8 text-xs text-tinta-suave">
              Hay productos vendidos sin costo cargado — esos totales de costo y ganancia están
              incompletos, no son cero.
            </p>
          )}

          {reporte.categorias.map((cat) => (
            <div key={cat.categoriaId ?? "combos"} className="mb-10 break-inside-avoid">
              <h2 className="mb-2 font-semibold text-tinta">
                {cat.categoriaNombre}
                <span className="ml-2 text-xs font-normal text-tinta-suave">
                  {cat.totalCantidad} {cat.totalCantidad === 1 ? "unidad" : "unidades"} ·{" "}
                  {formatearGuarani(Math.round(cat.totalVenta))}
                </span>
              </h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Producto</th>
                    <th className="py-1.5 text-right">Cantidad</th>
                    <th className="py-1.5 text-right">Precio venta</th>
                    <th className="py-1.5 text-right">Costo</th>
                    <th className="py-1.5 text-right">Margen</th>
                    <th className="py-1.5 text-right">Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.filas.map((f) => (
                    <Fragment key={f.nombre}>
                      <tr className="border-b border-linea-fina break-inside-avoid">
                        <td className="py-1.5 text-tinta">{f.nombre}</td>
                        <td className="py-1.5 text-right text-tinta-media">{f.cantidad}</td>
                        <td className="py-1.5 text-right text-tinta-media">
                          {formatearGuarani(Math.round(f.precioVentaUnitario))}
                        </td>
                        <td className="py-1.5 text-right text-tinta-media">
                          {f.costoUnitario != null ? formatearGuarani(Math.round(f.costoUnitario)) : "—"}
                        </td>
                        <td className="py-1.5 text-right text-tinta-media">
                          {f.margen != null ? `${f.margen.toFixed(0)}%` : "—"}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-tinta">
                          {f.ganancia != null ? formatearGuarani(Math.round(f.ganancia)) : "—"}
                        </td>
                      </tr>
                      {/* Lo que aportaron los agregados vendidos junto con este producto,
                          aparte — una fila por combinación exacta, totales del período. */}
                      {f.agregadosDetalle.map((d) => (
                        <tr key={`${f.nombre}-${d.texto}`} className="border-b border-linea-fina break-inside-avoid text-xs">
                          <td className="py-1 pl-4 text-tinta-suave">+ {d.texto}</td>
                          <td className="py-1 text-right text-tinta-suave">{d.cantidad}</td>
                          <td className="py-1 text-right text-tinta-suave">
                            {formatearGuarani(Math.round(d.venta))}
                          </td>
                          <td className="py-1 text-right text-tinta-suave">
                            {d.costo != null ? formatearGuarani(Math.round(d.costo)) : "—"}
                          </td>
                          <td className="py-1 text-right text-tinta-suave">
                            {d.margen != null ? `${d.margen.toFixed(0)}%` : "—"}
                          </td>
                          <td className="py-1 text-right text-tinta-suave">
                            {d.ganancia != null ? formatearGuarani(Math.round(d.ganancia)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
