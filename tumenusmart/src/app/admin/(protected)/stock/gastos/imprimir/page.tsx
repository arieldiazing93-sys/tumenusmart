import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { rangoDeDias, fechaDeDia, diaEnTexto } from "@/lib/rango-dias";
import { calcularReporteGastos } from "@/lib/reporte-gastos";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Versión imprimible del reporte de gastos — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirGastosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; categoria?: string; proveedor?: string }>;
}) {
  await pantallaConPermiso("stock.ver");

  const { desde, hasta, categoria, proveedor } = await searchParams;
  const rango = rangoDeDias(desde, hasta);

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteGastos(storeId, rango, { categoria, proveedorId: proveedor }),
  ]);

  const filtros = [
    reporte.categoriaFiltrada ? `Categoría: ${reporte.categoriaFiltrada}` : null,
    reporte.proveedorFiltrado ? `Proveedor: ${reporte.proveedorFiltrado}` : null,
  ].filter((f): f is string => f !== null);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-linea pb-6">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-16 w-16 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Gastos</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {diaEnTexto(rango.desde)} – {diaEnTexto(rango.hasta)}
            {filtros.length > 0 ? ` · ${filtros.join(" · ")}` : ""}
          </p>
        </div>
      </div>

      {reporte.gastos.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay gastos registrados en este período.</p>
      ) : (
        <>
          <table className="mb-8 w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Gastos registrados</td>
                <td className="py-2 text-right font-semibold text-tinta">{reporte.gastos.length}</td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Total gastado</td>
                <td className="py-2 text-right text-base font-bold text-tinta">
                  {formatearGuarani(Math.round(reporte.total))}
                </td>
              </tr>
            </tbody>
          </table>

          {reporte.porCategoria.length > 1 && (
            <div className="mb-8 break-inside-avoid">
              <h2 className="mb-2 font-semibold text-tinta">Por categoría</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Categoría</th>
                    <th className="py-1.5 text-right">Gastos</th>
                    <th className="py-1.5 text-right">Total</th>
                    <th className="py-1.5 text-right">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.porCategoria.map((c) => (
                    <tr key={c.categoria} className="border-b border-linea-fina">
                      <td className="py-1.5 text-tinta">{c.categoria}</td>
                      <td className="py-1.5 text-right text-tinta-media">{c.gastos}</td>
                      <td className="py-1.5 text-right font-semibold text-tinta">
                        {formatearGuarani(Math.round(c.total))}
                      </td>
                      <td className="py-1.5 text-right text-tinta-media">
                        {new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(c.porcentaje)} %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mb-2 font-semibold text-tinta">Detalle de gastos</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Fecha</th>
                <th className="py-1.5">Concepto</th>
                <th className="py-1.5">Categoría</th>
                <th className="py-1.5">Proveedor</th>
                <th className="py-1.5 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {reporte.gastos.map((g) => (
                <tr key={g.id} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 text-tinta-media">{fechaDeDia(g.fecha)}</td>
                  <td className="py-1.5 text-tinta">
                    {g.concepto}
                    {g.notas && <span className="block text-xs text-tinta-suave">{g.notas}</span>}
                  </td>
                  <td className="py-1.5 text-tinta-media">{g.categoria}</td>
                  <td className="py-1.5 text-tinta-media">{g.proveedor ?? "—"}</td>
                  <td className="py-1.5 text-right font-semibold text-tinta">
                    {formatearGuarani(Math.round(g.monto))}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4} className="py-2 text-right text-xs uppercase tracking-wide text-tinta-media">
                  Total
                </td>
                <td className="py-2 text-right text-base font-bold text-tinta">
                  {formatearGuarani(Math.round(reporte.total))}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
