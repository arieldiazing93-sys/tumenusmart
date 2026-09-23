import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { calcularReporteCompras, rangoDeCompras, fechaDeCompra, diaEnTexto } from "@/lib/reporte-compras";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Versión imprimible del reporte de compras — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; proveedor?: string }>;
}) {
  await pantallaConPermiso("stock.ver");

  const { desde, hasta, proveedor } = await searchParams;
  const rango = rangoDeCompras(desde, hasta);

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteCompras(storeId, rango, proveedor || null),
  ]);
  const t = reporte.totales;

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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Compras</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {diaEnTexto(rango.desde)} – {diaEnTexto(rango.hasta)}
            {reporte.proveedorFiltrado ? ` · Proveedor: ${reporte.proveedorFiltrado}` : ""}
          </p>
        </div>
      </div>

      {reporte.compras.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay compras registradas en este período.</p>
      ) : (
        <>
          <table className="mb-8 w-full border-collapse text-sm">
            <tbody>
              <FilaResumen etiqueta="Compras registradas" valor={String(t.compras)} />
              <FilaResumen etiqueta="Subtotal (sin IVA)" valor={formatearGuarani(Math.round(t.subtotal))} />
              {t.descuentoGeneral > 0 && (
                <FilaResumen
                  etiqueta="Descuento general"
                  valor={`− ${formatearGuarani(Math.round(t.descuentoGeneral))}`}
                />
              )}
              <FilaResumen etiqueta="IVA" valor={formatearGuarani(Math.round(t.iva))} />
              <FilaResumen etiqueta="Total comprado" valor={formatearGuarani(Math.round(t.total))} fuerte />
              <FilaResumen etiqueta="Al contado" valor={formatearGuarani(Math.round(t.contado))} />
              <FilaResumen etiqueta="A crédito" valor={formatearGuarani(Math.round(t.credito))} />
            </tbody>
          </table>

          {reporte.porProveedor.length > 1 && (
            <div className="mb-8 break-inside-avoid">
              <h2 className="mb-2 font-semibold text-tinta">Por proveedor</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Proveedor</th>
                    <th className="py-1.5 text-right">Compras</th>
                    <th className="py-1.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.porProveedor.map((p) => (
                    <tr key={p.proveedor} className="border-b border-linea-fina">
                      <td className="py-1.5 text-tinta">{p.proveedor}</td>
                      <td className="py-1.5 text-right text-tinta-media">{p.compras}</td>
                      <td className="py-1.5 text-right font-semibold text-tinta">
                        {formatearGuarani(Math.round(p.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mb-3 font-semibold text-tinta">Detalle de cada compra</h2>
          {reporte.compras.map((c) => (
            <div key={c.id} className="mb-6 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-linea pb-1">
                <p className="font-semibold text-tinta">
                  {fechaDeCompra(c.fecha)} · {c.proveedor}
                  {c.folio ? ` · Folio ${c.folio}` : ""}
                </p>
                <p className="text-sm text-tinta-media">
                  {c.condicionPago === "credito"
                    ? `A crédito${c.vencimiento ? ` (vence ${fechaDeCompra(c.vencimiento)})` : ""}`
                    : "Al contado"}{" "}
                  · <span className="font-semibold text-tinta">{formatearGuarani(Math.round(c.total))}</span>
                </p>
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Insumo</th>
                    <th className="py-1.5">Almacén</th>
                    <th className="py-1.5 text-right">Cantidad</th>
                    <th className="py-1.5 text-right">Costo s/ IVA</th>
                    <th className="py-1.5 text-right">Desc.</th>
                    <th className="py-1.5 text-right">Importe s/ IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {c.lineas.map((l, i) => (
                    <tr key={i} className="border-b border-linea-fina break-inside-avoid">
                      <td className="py-1.5 text-tinta">
                        {l.insumo}
                        <span className="ml-1 text-xs text-tinta-suave">{etiquetaIva(l.iva)}</span>
                      </td>
                      <td className="py-1.5 text-tinta-media">{l.almacen}</td>
                      <td className="py-1.5 text-right text-tinta-media">
                        {l.rendimiento === 1
                          ? `${l.cantidad} ${l.unidadMedida}`
                          : `${l.cantidad} × ${l.rendimiento} = ${l.unidadesAlStock} ${l.unidadMedida}`}
                      </td>
                      <td className="py-1.5 text-right text-tinta-media">
                        {formatearGuarani(Math.round(l.costoUnitario))}
                      </td>
                      <td className="py-1.5 text-right text-tinta-media">
                        {l.descuentoPorcentaje != null ? `${l.descuentoPorcentaje}%` : "—"}
                      </td>
                      <td className="py-1.5 text-right font-semibold text-tinta">
                        {formatearGuarani(Math.round(l.importe))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-right text-xs text-tinta-suave">
                Subtotal {formatearGuarani(Math.round(c.subtotal))}
                {c.descuentoGeneral > 0
                  ? ` · Desc. general ${c.descuentoGeneralPorcentaje ?? ""}% − ${formatearGuarani(Math.round(c.descuentoGeneral))}`
                  : ""}
                {` · IVA ${formatearGuarani(Math.round(c.iva))} · Total ${formatearGuarani(Math.round(c.total))}`}
              </p>
            </div>
          ))}
        </>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">
        No incluye las compras canceladas. Generado desde TuMenuSmart.
      </p>
    </div>
  );
}

function FilaResumen({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <tr className="border-b border-linea">
      <td className="py-2 text-tinta-media">{etiqueta}</td>
      <td className={`py-2 text-right text-tinta ${fuerte ? "text-base font-bold" : "font-semibold"}`}>{valor}</td>
    </tr>
  );
}
