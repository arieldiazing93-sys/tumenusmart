import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { etiquetaDeFormaDePago, resumenDeDiasTrabajo } from "@/lib/ausencias";
import { formatearGuarani } from "@/lib/format";
import { cargarLiquidacion, periodoDeLiquidacion } from "@/lib/liquidacion-asistencia";
import { diaEnTexto } from "@/lib/rango-dias";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/**
 * Versión imprimible de la liquidación — "Imprimir / Guardar como PDF" desde el navegador, mismo mecanismo que Marcaciones. Trae
 * lo mismo que se ve en pantalla y que el Excel (con la misma función, `cargarLiquidacion`), en hoja apaisada.
 */
export default async function ImprimirLiquidacionPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("asistencia.gestionar");
  const sp = await searchParams;
  const pedido = periodoDeLiquidacion(sp.fecha, sp.desde, sp.hasta);
  const db = prismaDelLocal(await idLocalActual());
  const [reporte, local] = await Promise.all([cargarLiquidacion(db, { desde: pedido.desde, hasta: pedido.hasta }), localActual()]);
  const { filas, totales, desde, hasta } = reporte;
  const textoPeriodo = desde === hasta ? diaEnTexto(desde) : `${diaEnTexto(desde)} – ${diaEnTexto(hasta)}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>

      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-6 flex items-center gap-4 border-b border-linea pb-5">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-16 w-16 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre}</h1>
          <p className="mt-1 text-sm text-tinta-media">Liquidación del personal</p>
          <p className="text-sm text-tinta-media">Período: {textoPeriodo}</p>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay personal para liquidar en este período.</p>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Total a pagar</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{formatearGuarani(totales.neto)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Bruto</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{formatearGuarani(totales.bruto)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Descuentos</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{formatearGuarani(totales.descuento)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Faltas sin aviso</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{totales.faltas}</dd>
            </div>
          </dl>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Colaborador</th>
                <th className="py-1.5">Pago</th>
                <th className="py-1.5 text-right">Tenía que ir</th>
                <th className="py-1.5 text-right">Fue</th>
                <th className="py-1.5 text-right">Justif. (paga / sin goce)</th>
                <th className="py-1.5 text-right">Faltas</th>
                <th className="py-1.5 text-right">Bruto</th>
                <th className="py-1.5 text-right">Descuento</th>
                <th className="py-1.5 text-right">A pagar</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-linea-fina align-top [break-inside:avoid]">
                  <td className="py-1.5 text-tinta">
                    {f.nombre}
                    <span className="block text-xs text-tinta-suave">
                      {f.cargo ? `${f.cargo} · ` : ""}
                      {resumenDeDiasTrabajo(f.diasTrabajo)}
                    </span>
                  </td>
                  <td className="py-1.5 text-tinta-media">
                    {f.sinFormaDePago ? "Sin definir" : `${etiquetaDeFormaDePago(f.forma)} · ${formatearGuarani(f.monto)}`}
                  </td>
                  <td className="py-1.5 text-right text-tinta">{f.resumen.esperados}</td>
                  <td className="py-1.5 text-right text-tinta">{f.resumen.trabajados}</td>
                  <td className="py-1.5 text-right text-tinta">
                    {f.resumen.justificadosPagados} / {f.resumen.justificadosSinGoce}
                  </td>
                  <td className="py-1.5 text-right text-tinta">{f.resumen.faltas}</td>
                  <td className="whitespace-nowrap py-1.5 text-right text-tinta">{f.sinFormaDePago ? "—" : formatearGuarani(f.liquidacion.bruto)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right text-tinta">
                    {f.sinFormaDePago ? "—" : formatearGuarani(f.liquidacion.descuento)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right font-semibold text-tinta">
                    {f.sinFormaDePago ? "—" : formatearGuarani(f.liquidacion.neto)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-linea font-semibold">
                <td className="py-2 text-tinta">TOTAL</td>
                <td className="py-2" colSpan={4} />
                <td className="py-2 text-right text-tinta">{totales.faltas}</td>
                <td className="whitespace-nowrap py-2 text-right text-tinta">{formatearGuarani(totales.bruto)}</td>
                <td className="whitespace-nowrap py-2 text-right text-tinta">{formatearGuarani(totales.descuento)}</td>
                <td className="whitespace-nowrap py-2 text-right text-tinta">{formatearGuarani(totales.neto)}</td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3 text-xs text-tinta-suave">
            Mensual: el salario del período menos un día (el salario ÷ 30) por cada falta sin aviso y por cada día justificado sin goce.
            Jornal: un jornal por cada día que fue y por cada día justificado que se le paga. Las llegadas tarde son informativas.
          </p>
          {totales.sinFormaDePago > 0 && (
            <p className="mt-1 text-xs text-tinta-suave">
              {totales.sinFormaDePago} {totales.sinFormaDePago === 1 ? "persona" : "personas"} sin forma de pago definida: no se calculó
              su monto.
            </p>
          )}
          {reporte.incompleta && (
            <p className="mt-1 text-xs text-tinta-suave">
              Hay tantas marcaciones que la lista se cortó: los días trabajados pueden estar incompletos.
            </p>
          )}
        </>
      )}
    </div>
  );
}
