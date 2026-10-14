import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { REPORTES_CONTABLES, fechaDelLibro, leerReporteContable, resumirIva, totalizar } from "@/lib/libro-iva";
import { cargarLibroCompras, cargarLibroVentas } from "@/lib/libro-iva-servidor";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** La versión para imprimir o guardar como PDF del libro de ventas, el libro de compras o el resumen del IVA: todas las filas del período. */
export default async function ImprimirContabilidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ reporte: string }>;
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  const { reporte: reporteCrudo } = await params;
  const reporte = leerReporteContable(reporteCrudo);
  if (!reporte || reporte === "rg90") notFound();

  await pantallaConPermiso("pos.verHistorico");
  if (reporte !== "libro-ventas") await pantallaConPermiso("stock.ver");

  const info = REPORTES_CONTABLES.find((r) => r.valor === reporte)!;
  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mesAnterior";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mesAnterior", undefined, undefined)!;
  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);

  const storeId = await idLocalActual();
  const necesitaVentas = reporte === "libro-ventas" || reporte === "resumen-iva";
  const necesitaCompras = reporte === "libro-compras" || reporte === "resumen-iva";
  const [local, ventas, compras] = await Promise.all([
    localActual(),
    necesitaVentas ? cargarLibroVentas(storeId, rango) : Promise.resolve({ filas: [], anuladas: 0 }),
    necesitaCompras ? cargarLibroCompras(storeId, rango) : Promise.resolve({ filas: [], sinComprobante: 0 }),
  ]);

  const tv = totalizar(ventas.filas);
  const completas = compras.filas.filter((f) => f.faltan.length === 0);
  const tc = totalizar(completas);
  const r = resumirIva(ventas.filas, compras.filas, ventas.anuladas, compras.sinComprobante);

  const celdaNum = "py-1.5 pr-2 text-right";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-6 flex items-center gap-4 border-b border-linea pb-5">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-16 w-16 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">
            {local.nombre} — {info.titulo}
          </h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {fechaDelLibro(rango.gte, ZONA_NEGOCIO)} – {fechaDelLibro(finRangoInclusive, ZONA_NEGOCIO)}
          </p>
        </div>
      </div>

      {reporte === "libro-ventas" &&
        (ventas.filas.length === 0 ? (
          <p className="text-sm text-tinta-suave">Sin facturas emitidas en este período.</p>
        ) : (
          <table className="w-full border-collapse text-[0.7rem]">
            <thead>
              <tr className="border-b border-linea text-left uppercase tracking-wide text-tinta-media">
                <th className="py-1.5 pr-2">Fecha</th>
                <th className="py-1.5 pr-2">Comprador</th>
                <th className="py-1.5 pr-2">Timbrado</th>
                <th className="py-1.5 pr-2">N° comprobante</th>
                <th className="py-1.5 pr-2 text-right">Total</th>
                <th className="py-1.5 pr-2 text-right">Exenta</th>
                <th className="py-1.5 pr-2 text-right">Grav. 5 %</th>
                <th className="py-1.5 pr-2 text-right">IVA 5 %</th>
                <th className="py-1.5 pr-2 text-right">Grav. 10 %</th>
                <th className="py-1.5 text-right">IVA 10 %</th>
              </tr>
            </thead>
            <tbody>
              {ventas.filas.map((f) => (
                <tr key={f.id} className="break-inside-avoid border-b border-linea-fina align-top">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-tinta-media">{fechaDelLibro(f.fecha, ZONA_NEGOCIO)}</td>
                  <td className="py-1.5 pr-2 text-tinta">
                    {f.razonSocial || "—"}
                    <span className="block text-tinta-suave">
                      {f.tipoIdentificacion}: {f.identificacion || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-tinta-media">{f.timbrado || "—"}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-tinta-media">
                    {f.numero || "—"}
                    {f.modalidad === "electronico" ? " (electrónica)" : ""}
                  </td>
                  <td className={`${celdaNum} font-semibold text-tinta`}>{formatearGuarani(f.total)}</td>
                  <td className={celdaNum}>{formatearGuarani(f.exento)}</td>
                  <td className={celdaNum}>{formatearGuarani(f.gravado5)}</td>
                  <td className={celdaNum}>{formatearGuarani(f.iva5)}</td>
                  <td className={celdaNum}>{formatearGuarani(f.gravado10)}</td>
                  <td className="py-1.5 text-right">{formatearGuarani(f.iva10)}</td>
                </tr>
              ))}
              <tr className="border-t border-tinta font-bold text-tinta">
                <td className="py-2 pr-2" colSpan={4}>
                  TOTAL ({tv.comprobantes} facturas)
                </td>
                <td className={celdaNum}>{formatearGuarani(tv.total)}</td>
                <td className={celdaNum}>{formatearGuarani(tv.exento)}</td>
                <td className={celdaNum}>{formatearGuarani(tv.gravado5)}</td>
                <td className={celdaNum}>{formatearGuarani(tv.iva5)}</td>
                <td className={celdaNum}>{formatearGuarani(tv.gravado10)}</td>
                <td className="py-2 text-right">{formatearGuarani(tv.iva10)}</td>
              </tr>
            </tbody>
          </table>
        ))}

      {reporte === "libro-compras" &&
        (compras.filas.length === 0 ? (
          <p className="text-sm text-tinta-suave">Sin compras con factura en este período.</p>
        ) : (
          <table className="w-full border-collapse text-[0.7rem]">
            <thead>
              <tr className="border-b border-linea text-left uppercase tracking-wide text-tinta-media">
                <th className="py-1.5 pr-2">Fecha</th>
                <th className="py-1.5 pr-2">Proveedor</th>
                <th className="py-1.5 pr-2">Timbrado</th>
                <th className="py-1.5 pr-2">N° comprobante</th>
                <th className="py-1.5 pr-2 text-right">Total</th>
                <th className="py-1.5 pr-2 text-right">Exenta</th>
                <th className="py-1.5 pr-2 text-right">Grav. 5 %</th>
                <th className="py-1.5 pr-2 text-right">IVA 5 %</th>
                <th className="py-1.5 pr-2 text-right">Grav. 10 %</th>
                <th className="py-1.5 text-right">IVA 10 %</th>
              </tr>
            </thead>
            <tbody>
              {compras.filas.map((f) => (
                <tr key={`${f.origen}-${f.id}`} className="break-inside-avoid border-b border-linea-fina align-top">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-tinta-media">{fechaDelLibro(f.fecha, "UTC")}</td>
                  <td className="py-1.5 pr-2 text-tinta">
                    {f.razonSocial || "—"}
                    <span className="block text-tinta-suave">
                      RUC: {f.identificacion || "—"} · {f.origen === "gasto" ? "Gasto" : "Compra"}
                    </span>
                    {f.faltan.length > 0 && <span className="block font-semibold">Incompleta: falta {f.faltan.join(", ")}</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-tinta-media">{f.timbrado || "—"}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-tinta-media">{f.numero || "—"}</td>
                  <td className={`${celdaNum} font-semibold text-tinta`}>{formatearGuarani(f.total)}</td>
                  <td className={celdaNum}>{formatearGuarani(f.exento)}</td>
                  <td className={celdaNum}>{formatearGuarani(f.gravado5)}</td>
                  <td className={celdaNum}>{formatearGuarani(f.iva5)}</td>
                  <td className={celdaNum}>{formatearGuarani(f.gravado10)}</td>
                  <td className="py-1.5 text-right">{formatearGuarani(f.iva10)}</td>
                </tr>
              ))}
              <tr className="border-t border-tinta font-bold text-tinta">
                <td className="py-2 pr-2" colSpan={4}>
                  TOTAL con factura completa ({tc.comprobantes})
                </td>
                <td className={celdaNum}>{formatearGuarani(tc.total)}</td>
                <td className={celdaNum}>{formatearGuarani(tc.exento)}</td>
                <td className={celdaNum}>{formatearGuarani(tc.gravado5)}</td>
                <td className={celdaNum}>{formatearGuarani(tc.iva5)}</td>
                <td className={celdaNum}>{formatearGuarani(tc.gravado10)}</td>
                <td className="py-2 text-right">{formatearGuarani(tc.iva10)}</td>
              </tr>
            </tbody>
          </table>
        ))}

      {reporte === "resumen-iva" && (
        <>
          <table className="mb-8 w-full max-w-2xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Ventas (débito fiscal)</th>
                <th className="py-1.5 text-right">Importe con IVA</th>
                <th className="py-1.5 text-right">IVA</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-linea-fina">
                <td className="py-1.5">Gravadas al 10 %</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.ventas.gravado10)}</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.ventas.iva10)}</td>
              </tr>
              <tr className="border-b border-linea-fina">
                <td className="py-1.5">Gravadas al 5 %</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.ventas.gravado5)}</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.ventas.iva5)}</td>
              </tr>
              <tr className="border-b border-linea-fina">
                <td className="py-1.5">Exentas</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.ventas.exento)}</td>
                <td className="py-1.5 text-right">—</td>
              </tr>
              <tr className="font-bold text-tinta">
                <td className="py-2">Total de ventas ({r.ventas.comprobantes} facturas)</td>
                <td className="py-2 text-right">{formatearGuarani(r.ventas.total)}</td>
                <td className="py-2 text-right">{formatearGuarani(r.debitoFiscal)}</td>
              </tr>
            </tbody>
          </table>

          <table className="mb-8 w-full max-w-2xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Compras (crédito fiscal)</th>
                <th className="py-1.5 text-right">Importe con IVA</th>
                <th className="py-1.5 text-right">IVA</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-linea-fina">
                <td className="py-1.5">Gravadas al 10 %</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.compras.gravado10)}</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.compras.iva10)}</td>
              </tr>
              <tr className="border-b border-linea-fina">
                <td className="py-1.5">Gravadas al 5 %</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.compras.gravado5)}</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.compras.iva5)}</td>
              </tr>
              <tr className="border-b border-linea-fina">
                <td className="py-1.5">Exentas</td>
                <td className="py-1.5 text-right">{formatearGuarani(r.compras.exento)}</td>
                <td className="py-1.5 text-right">—</td>
              </tr>
              <tr className="font-bold text-tinta">
                <td className="py-2">Total de compras ({r.compras.comprobantes} comprobantes completos)</td>
                <td className="py-2 text-right">{formatearGuarani(r.compras.total)}</td>
                <td className="py-2 text-right">{formatearGuarani(r.creditoFiscal)}</td>
              </tr>
            </tbody>
          </table>

          <table className="mb-6 w-full max-w-md border-collapse text-sm">
            <tbody>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">IVA de las ventas (débito)</td>
                <td className="py-2 text-right font-semibold text-tinta">{formatearGuarani(r.debitoFiscal)}</td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">IVA de las compras (crédito)</td>
                <td className="py-2 text-right font-semibold text-tinta">{formatearGuarani(r.creditoFiscal)}</td>
              </tr>
              <tr className="border-b border-linea font-bold text-tinta">
                <td className="py-2">{r.saldo > 0 ? "IVA a pagar (referencia)" : "Saldo a favor (referencia)"}</td>
                <td className="py-2 text-right">{formatearGuarani(Math.abs(r.saldo))}</td>
              </tr>
            </tbody>
          </table>

          <p className="text-xs text-tinta-media">
            Facturas anuladas: {r.facturasAnuladas}. Compras con factura incompleta: {r.comprasIncompletas.comprobantes}. Compras o gastos sin
            factura del proveedor: {r.comprasSinComprobante}. Es una referencia: la declaración oficial del IVA la liquida Marangatú con el
            registro RG 90 confirmado.
          </p>
        </>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
