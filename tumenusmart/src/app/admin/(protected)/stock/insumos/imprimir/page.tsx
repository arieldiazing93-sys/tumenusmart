import { Fragment } from "react";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { calcularReporteInsumos } from "@/lib/reporte-insumos";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Versión imprimible del reporte de insumos — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirInsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string }>;
}) {
  await pantallaConPermiso("stock.ver");

  const { categoria } = await searchParams;
  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteInsumos(storeId, categoria || null),
  ]);

  const fecha = new Date().toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  });

  // Una sección por categoría.
  const grupos = new Map<string, typeof reporte.filas>();
  for (const f of reporte.filas) {
    const lista = grupos.get(f.categoria) ?? [];
    lista.push(f);
    grupos.set(f.categoria, lista);
  }

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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Insumos</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Existencias al {fecha} · {reporte.categoriaFiltrada ?? "Todas las categorías"}
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
                <td className="py-2 text-tinta-media">Valor del stock (a costo de cada insumo, sin IVA)</td>
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
                    <th className="py-1.5 text-right">Stock</th>
                    <th className="py-1.5 text-right">Mínimo</th>
                    <th className="py-1.5 text-right">Costo</th>
                    <th className="py-1.5 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => (
                    <Fragment key={i}>
                      <tr className="border-b border-linea-fina break-inside-avoid">
                        <td className="py-1.5 text-tinta">
                          {f.insumo}
                          {!f.activo && <span className="ml-1 text-xs text-tinta-suave">(inactivo)</span>}
                        </td>
                        <td
                          className={`py-1.5 text-right font-semibold ${
                            f.estado === "negativo" ? "text-peligro" : f.estado === "bajo" ? "text-aviso" : "text-tinta"
                          }`}
                        >
                          {f.stock} <span className="text-xs font-normal text-tinta-suave">{f.unidad}</span>
                        </td>
                        <td className="py-1.5 text-right text-tinta-media">{f.stockMinimo ?? "—"}</td>
                        <td className="py-1.5 text-right text-tinta-media">
                          {f.costoUnitario != null ? formatearGuarani(Math.round(f.costoUnitario)) : "—"}
                        </td>
                        <td className="py-1.5 text-right text-tinta-media">
                          {f.valor != null ? formatearGuarani(Math.round(f.valor)) : "—"}
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      <p className="mt-6 text-xs text-tinta-suave">
        Stock en rojo: negativo (se vendió más de lo que había registrado). En naranja: bajo el mínimo. Para ver qué se
        movió entre dos fechas, usá el reporte de Almacén.
      </p>
      <p className="mt-2 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
