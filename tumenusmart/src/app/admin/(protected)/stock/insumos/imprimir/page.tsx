import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { rangoDeDias, diaEnTexto } from "@/lib/rango-dias";
import { calcularReporteInsumos } from "@/lib/reporte-insumos";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Un movimiento con su signo: "+12", "-3" y, si no hubo, un guion. */
function conSigno(n: number): string {
  if (n === 0) return "—";
  return `${n > 0 ? "+" : ""}${n}`;
}

/** Versión imprimible del reporte de insumos — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirInsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("stock.ver");

  const { categoria, desde, hasta } = await searchParams;
  const rango = rangoDeDias(desde, hasta);
  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteInsumos(storeId, rango, categoria || null),
  ]);

  // Una sección por categoría.
  const grupos = new Map<string, typeof reporte.filas>();
  for (const f of reporte.filas) {
    const lista = grupos.get(f.categoria) ?? [];
    lista.push(f);
    grupos.set(f.categoria, lista);
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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Insumos</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {diaEnTexto(rango.desde)} – {diaEnTexto(rango.hasta)} · {reporte.categoriaFiltrada ?? "Todas las categorías"}
          </p>
        </div>
      </div>

      {reporte.filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay insumos para mostrar.</p>
      ) : (
        <>
          <table className="mb-8 w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Insumos</td>
                <td className="py-2 text-right font-semibold text-tinta">{reporte.filas.length}</td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Valor del stock final (a costo de cada insumo, sin IVA)</td>
                <td className="py-2 text-right text-base font-bold text-tinta">
                  {formatearGuarani(Math.round(reporte.totalValor))}
                </td>
              </tr>
            </tbody>
          </table>

          {reporte.sinCosto > 0 && (
            <p className="mb-6 text-xs text-tinta-suave">
              {reporte.sinCosto} insumo(s) con stock no tienen costo (todavía no se les registró una compra) y no suman
              al valor.
            </p>
          )}

          {[...grupos.entries()].map(([nombreCategoria, filas]) => (
            <div key={nombreCategoria} className="mb-8 break-inside-avoid">
              <h2 className="mb-2 font-semibold text-tinta">{nombreCategoria}</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Insumo</th>
                    <th className="py-1.5 text-right">Inicial</th>
                    <th className="py-1.5 text-right">Compras</th>
                    <th className="py-1.5 text-right">Ventas</th>
                    <th className="py-1.5 text-right">Ajustes</th>
                    <th className="py-1.5 text-right">Anul.</th>
                    <th className="py-1.5 text-right">Mov.</th>
                    <th className="py-1.5 text-right">Final</th>
                    <th className="py-1.5 text-right">Costo</th>
                    <th className="py-1.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <tr key={i} className="border-b border-linea-fina break-inside-avoid">
                      <td className="py-1.5 text-tinta">
                        {f.insumo} <span className="text-xs text-tinta-suave">{f.unidad}</span>
                        {!f.activo && <span className="ml-1 text-xs text-tinta-suave">(inactivo)</span>}
                      </td>
                      <td className="py-1.5 text-right text-tinta-media">{f.inicial}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.compras)}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.ventas)}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.ajustes)}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.anulaciones)}</td>
                      <td className="py-1.5 text-right text-tinta-media">{conSigno(f.movimientos)}</td>
                      <td
                        className={`py-1.5 text-right font-semibold ${
                          f.estado === "negativo" ? "text-peligro" : f.estado === "bajo" ? "text-aviso" : "text-tinta"
                        }`}
                      >
                        {f.stock}
                      </td>
                      <td className="py-1.5 text-right text-tinta-media">
                        {f.costoUnitario != null ? formatearGuarani(Math.round(f.costoUnitario)) : "—"}
                      </td>
                      <td className="py-1.5 text-right text-tinta-media">
                        {f.valor != null ? formatearGuarani(Math.round(f.valor)) : "—"}
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
        período; Anul. es lo que se devolvió o se sacó por ventas y compras canceladas; Mov. son las entradas (+) y salidas (−) manuales de almacén (mermas, roturas, consumo del personal). Final en rojo: negativo (se
        vendió más de lo que había registrado); en naranja: bajo el mínimo. El valor va a costo de hoy de cada insumo
        (última compra, sin IVA).
      </p>
      <p className="mt-2 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
