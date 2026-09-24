import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { rangoDeDias, diaEnTexto } from "@/lib/rango-dias";
import { calcularReporteAlmacen, type FilaAlmacenReporte } from "@/lib/reporte-almacen";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Un movimiento con su signo: "+12", "-3" y, si no hubo, un guion. */
function conSigno(n: number): string {
  if (n === 0) return "—";
  return `${n > 0 ? "+" : ""}${n}`;
}

/** Versión imprimible del reporte de almacén — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirAlmacenPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; almacen?: string; categoria?: string }>;
}) {
  await pantallaConPermiso("stock.ver");

  const { desde, hasta, almacen, categoria } = await searchParams;
  const rango = rangoDeDias(desde, hasta);

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteAlmacen(storeId, rango, almacen || null, categoria || null),
  ]);

  // Una tabla por almacén.
  const grupos = new Map<string, FilaAlmacenReporte[]>();
  for (const f of reporte.filas) {
    const lista = grupos.get(f.almacen) ?? [];
    lista.push(f);
    grupos.set(f.almacen, lista);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-linea pb-6">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-16 w-16 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Almacén</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {diaEnTexto(rango.desde)} – {diaEnTexto(rango.hasta)} · {reporte.almacenFiltrado ?? "Todos los almacenes"} ·{" "}
            {reporte.categoriaFiltrada ?? "Todas las categorías"}
          </p>
        </div>
      </div>

      {reporte.filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay stock ni movimientos en este período.</p>
      ) : (
        <>
          <table className="mb-8 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Almacén</th>
                <th className="py-1.5 text-right">Insumos con stock</th>
                <th className="py-1.5 text-right">Valor del stock final</th>
              </tr>
            </thead>
            <tbody>
              {reporte.porAlmacen.map((r) => (
                <tr key={r.almacen} className="border-b border-linea-fina">
                  <td className="py-1.5 text-tinta">{r.almacen}</td>
                  <td className="py-1.5 text-right text-tinta-media">
                    {r.insumos}
                    {r.sinCosto > 0 && <span className="text-xs text-tinta-suave"> ({r.sinCosto} sin costo)</span>}
                  </td>
                  <td className="py-1.5 text-right font-semibold text-tinta">
                    {formatearGuarani(Math.round(r.valorFinal))}
                  </td>
                </tr>
              ))}
              {reporte.porAlmacen.length > 1 && (
                <tr>
                  <td colSpan={2} className="py-2 text-right text-xs uppercase tracking-wide text-tinta-media">
                    Total
                  </td>
                  <td className="py-2 text-right text-base font-bold text-tinta">
                    {formatearGuarani(Math.round(reporte.totalValorFinal))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {[...grupos.entries()].map(([nombreAlmacen, filas]) => (
            <div key={nombreAlmacen} className="mb-8">
              <h2 className="mb-2 font-semibold text-tinta">{nombreAlmacen}</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Insumo</th>
                    <th className="py-1.5 text-right">Inicial</th>
                    <th className="py-1.5 text-right">Compras</th>
                    <th className="py-1.5 text-right">Ventas</th>
                    <th className="py-1.5 text-right">Ajustes</th>
                    <th className="py-1.5 text-right">Anul.</th>
                    <th className="py-1.5 text-right">Final</th>
                    <th className="py-1.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={`${f.almacenId}-${f.insumo}`} className="border-b border-linea-fina break-inside-avoid">
                      <td className="py-1.5 text-tinta">
                        {f.insumo}
                        <span className="ml-1 text-xs text-tinta-suave">
                          {f.categoria} · {f.unidad}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-tinta-media">{f.inicial}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.compras)}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.ventas)}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.ajustes)}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.anulaciones)}</td>
                      <td className={`py-1.5 text-right font-semibold ${f.final < 0 ? "text-peligro" : "text-tinta"}`}>
                        {f.final}
                      </td>
                      <td className="py-1.5 text-right text-tinta-media">
                        {f.valorFinal != null ? formatearGuarani(Math.round(f.valorFinal)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      <p className="mt-6 text-xs text-tinta-suave">
        Inicial: lo que había al empezar el primer día. Compras, ventas y ajustes (inventarios) son lo que se movió en el
        período; Anul. es lo que se devolvió o se sacó por ventas y compras canceladas. El valor va a costo de hoy de
        cada insumo (última compra, sin IVA); los que no tienen costo no suman.
      </p>
      <p className="mt-2 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
