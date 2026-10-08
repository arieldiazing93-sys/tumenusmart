import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearCantidad, formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { calcularReportePromociones } from "@/lib/reporte-promociones-servidor";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

const ETIQUETA_DE_ESTADO = { activa: "Activa", inactiva: "Inactiva", eliminada: "Eliminada" } as const;

/** La versión para imprimir o guardar como PDF del reporte de promociones: lo mismo que la pantalla, con todos los productos. */
export default async function ImprimirPromocionesPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([localActual(), calcularReportePromociones(storeId, rango)]);
  const t = reporte.totales;

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-6 flex items-center gap-4 border-b border-linea pb-5">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-16 w-16 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Promociones</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} – {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
          </p>
        </div>
      </div>

      {reporte.filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">Sin ventas con promoción en este período.</p>
      ) : (
        <>
          <table className="mb-8 w-full max-w-md border-collapse text-sm">
            <tbody>
              {[
                ["Dado a los clientes", formatearGuarani(t.ahorro)],
                ["Descontado", formatearGuarani(t.descontado)],
                ["Regalado (a precio de lista)", formatearGuarani(t.regalado)],
                ["Unidades regaladas", formatearCantidad(t.regaladas)],
                ["Costo de lo regalado", `${formatearGuarani(t.costoRegalado)}${t.costoIncompleto ? " (parcial)" : ""}`],
                ["Vendido con promoción", formatearGuarani(t.cobrado)],
                ["Ventas con promoción", String(t.ventas)],
              ].map(([rotulo, valor]) => (
                <tr key={rotulo} className="border-b border-linea">
                  <td className="py-2 text-tinta-media">{rotulo}</td>
                  <td className="py-2 text-right font-semibold text-tinta">{valor}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-2 text-sm font-semibold text-tinta">Por promoción</h2>
          <table className="mb-8 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-linea text-left uppercase tracking-wide text-tinta-media">
                <th className="py-1.5 pr-2">Promoción</th>
                <th className="py-1.5 pr-2">Estado</th>
                <th className="py-1.5 pr-2 text-right">Ventas</th>
                <th className="py-1.5 pr-2 text-right">Unidades</th>
                <th className="py-1.5 pr-2 text-right">Regaladas</th>
                <th className="py-1.5 pr-2 text-right">Vendido</th>
                <th className="py-1.5 pr-2 text-right">Descontado</th>
                <th className="py-1.5 pr-2 text-right">Regalado</th>
                <th className="py-1.5 text-right">Costo regalado</th>
              </tr>
            </thead>
            <tbody>
              {reporte.filas.map((f) => (
                <tr key={f.promocionId} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 pr-2 text-tinta">
                    {f.nombre}
                    {f.etiqueta ? ` (${f.etiqueta})` : ""}
                  </td>
                  <td className="py-1.5 pr-2 text-tinta-media">{ETIQUETA_DE_ESTADO[f.estado]}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.ventas}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{formatearCantidad(f.unidades)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.regaladas > 0 ? formatearCantidad(f.regaladas) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-tinta">{formatearGuarani(f.cobrado)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.descontado > 0 ? formatearGuarani(f.descontado) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.regalado > 0 ? formatearGuarani(f.regalado) : "—"}</td>
                  <td className="py-1.5 text-right text-tinta-media">
                    {f.regaladas > 0 ? `${formatearGuarani(f.costoRegalado)}${f.costoIncompleto ? " *" : ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-2 text-sm font-semibold text-tinta">Por canal de venta</h2>
          <table className="mb-8 w-full max-w-2xl border-collapse text-xs">
            <thead>
              <tr className="border-b border-linea text-left uppercase tracking-wide text-tinta-media">
                <th className="py-1.5 pr-2">Canal</th>
                <th className="py-1.5 pr-2 text-right">Ventas</th>
                <th className="py-1.5 pr-2 text-right">Unidades</th>
                <th className="py-1.5 pr-2 text-right">Regaladas</th>
                <th className="py-1.5 pr-2 text-right">Vendido</th>
                <th className="py-1.5 text-right">Dado a los clientes</th>
              </tr>
            </thead>
            <tbody>
              {reporte.canales.map((c) => (
                <tr key={c.canal} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 pr-2 text-tinta">{c.nombre}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{c.ventas}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{formatearCantidad(c.unidades)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{c.regaladas > 0 ? formatearCantidad(c.regaladas) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{formatearGuarani(c.cobrado)}</td>
                  <td className="py-1.5 text-right font-semibold text-tinta">{c.ahorro > 0 ? formatearGuarani(c.ahorro) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-2 text-sm font-semibold text-tinta">Por producto</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-linea text-left uppercase tracking-wide text-tinta-media">
                <th className="py-1.5 pr-2">Producto</th>
                <th className="py-1.5 pr-2">Promoción</th>
                <th className="py-1.5 pr-2 text-right">Unidades</th>
                <th className="py-1.5 pr-2 text-right">Regaladas</th>
                <th className="py-1.5 pr-2 text-right">Vendido</th>
                <th className="py-1.5 text-right">Dado a los clientes</th>
              </tr>
            </thead>
            <tbody>
              {reporte.productos.map((p) => (
                <tr key={`${p.promocionId}-${p.productId ?? p.producto}`} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 pr-2 text-tinta">{p.producto}</td>
                  <td className="py-1.5 pr-2 text-tinta-media">{p.promocion}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{formatearCantidad(p.unidades)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{p.regaladas > 0 ? formatearCantidad(p.regaladas) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{formatearGuarani(p.cobrado)}</td>
                  <td className="py-1.5 text-right font-semibold text-tinta">{p.ahorro > 0 ? formatearGuarani(p.ahorro) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-6 text-[0.72rem] leading-snug text-tinta-suave">
            Cuenta las ventas cobradas del período (las anuladas no). “Vendido” es lo cobrado de las líneas con promoción, antes del descuento
            general de la cuenta.{t.costoIncompleto && " * El costo es parcial: a algún producto regalado le falta el costo en su receta."}
            {reporte.lineasSinPrecioAnterior > 0 &&
              ` Hay ${reporte.lineasSinPrecioAnterior} ${reporte.lineasSinPrecioAnterior === 1 ? "línea" : "líneas"} sin el precio de antes: su ahorro no se cuenta.`}
          </p>
        </>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
