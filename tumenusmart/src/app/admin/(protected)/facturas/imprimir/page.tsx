import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { formatearGuarani } from "@/lib/format";
import { esVigente, etiquetaEstadoFactura, listarFacturas } from "@/lib/reporte-facturas";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Versión imprimible del reporte de facturas — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirFacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta } = await searchParams;
  const rango =
    calcularRangoFecha(fecha ?? "30dias", desde, hasta) ?? calcularRangoFecha("30dias", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, filas] = await Promise.all([localActual(), listarFacturas(storeId, rango)]);

  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);

  // De la más vieja a la más nueva: así se lee como un libro de ventas.
  const ordenadas = [...filas].reverse();
  const vigentes = filas.filter(esVigente);
  const totalFacturado = vigentes.reduce((s, f) => s + f.total, 0);
  const totalIva = vigentes.reduce((s, f) => s + (f.iva10 ?? 0) + (f.iva5 ?? 0), 0);
  const anuladas = filas.length - vigentes.length;

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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Facturas</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
            {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
          </p>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay facturas en este período.</p>
      ) : (
        <>
          <table className="mb-8 w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Facturas vigentes</td>
                <td className="py-2 text-right font-semibold text-tinta">{vigentes.length}</td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Total facturado (IVA incluido)</td>
                <td className="py-2 text-right text-base font-bold text-tinta">{formatearGuarani(Math.round(totalFacturado))}</td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">IVA de esas facturas</td>
                <td className="py-2 text-right font-semibold text-tinta">{formatearGuarani(Math.round(totalIva))}</td>
              </tr>
              {anuladas > 0 && (
                <tr className="border-b border-linea">
                  <td className="py-2 text-tinta-media">Anuladas (no suman)</td>
                  <td className="py-2 text-right text-tinta-media">{anuladas}</td>
                </tr>
              )}
            </tbody>
          </table>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">N° Factura</th>
                <th className="py-1.5">Fecha</th>
                <th className="py-1.5">Cliente</th>
                <th className="py-1.5 text-right">IVA</th>
                <th className="py-1.5 text-right">Total</th>
                <th className="py-1.5 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => {
                const anulada = !esVigente(f);
                const iva = f.iva10 != null || f.iva5 != null ? (f.iva10 ?? 0) + (f.iva5 ?? 0) : null;
                return (
                  <tr key={f.key} className="border-b border-linea-fina break-inside-avoid">
                    <td className="cifra py-1.5 text-tinta">{f.facturaNumero}</td>
                    <td className="py-1.5 text-tinta-media">
                      {f.fecha.toLocaleDateString("es-PY", opcionesFecha)}
                    </td>
                    <td className="py-1.5 text-tinta">
                      {f.razonSocial}
                      <span className="block text-xs text-tinta-suave">
                        {f.etiquetaIdentificacion}: {f.identificacion} · {f.origenLabel}
                      </span>
                    </td>
                    <td className="cifra py-1.5 text-right text-tinta-media">
                      {iva != null ? formatearGuarani(Math.round(iva)) : "—"}
                    </td>
                    <td className={`cifra py-1.5 text-right ${anulada ? "text-tinta-suave line-through" : "font-semibold text-tinta"}`}>
                      {formatearGuarani(Math.round(f.total))}
                    </td>
                    <td className={`py-1.5 text-right text-xs ${anulada ? "text-peligro" : "text-tinta-media"}`}>
                      {etiquetaEstadoFactura(f)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <p className="mt-6 text-xs text-tinta-suave">
        Los totales suman solo las facturas vigentes: las anuladas figuran tachadas. Los montos van con
        IVA incluido. Para el desglose por tasa (gravado 10%, 5% y exento) usá el reporte en Excel.
      </p>
      <p className="mt-2 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
