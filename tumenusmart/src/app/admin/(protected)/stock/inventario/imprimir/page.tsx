import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { rangoDeDias, diaEnTexto } from "@/lib/rango-dias";
import { calcularReporteInventarios } from "@/lib/reporte-inventarios";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Una diferencia con su signo: "+12", "-3" y, si es cero, un guion. */
function conSigno(n: number): string {
  if (n === 0) return "—";
  return `${n > 0 ? "+" : ""}${n}`;
}

/** Una diferencia de plata con su signo: "+ Gs. 5.000", "− Gs. 2.500". */
function plataConSigno(n: number): string {
  const redondeado = Math.round(n);
  if (redondeado === 0) return "—";
  return `${redondeado > 0 ? "+" : "−"} ${formatearGuarani(Math.abs(redondeado))}`;
}

const claseDiferencia = (n: number) => (n < 0 ? "text-peligro" : n > 0 ? "text-exito" : "text-tinta-suave");

/** Versión imprimible del reporte de inventarios — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirInventariosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; almacen?: string }>;
}) {
  await pantallaConPermiso("stock.ver");

  const { desde, hasta, almacen } = await searchParams;
  const rango = rangoDeDias(desde, hasta);
  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteInventarios(storeId, rango, almacen || null),
  ]);

  const textoFecha = (f: Date) =>
    f.toLocaleString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: ZONA_NEGOCIO,
    });

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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Inventarios</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {diaEnTexto(rango.desde)} – {diaEnTexto(rango.hasta)} · {reporte.almacenFiltrado ?? "Todos los almacenes"}
          </p>
        </div>
      </div>

      {reporte.inventarios.length === 0 ? (
        <p className="text-sm text-tinta-suave">No se registraron inventarios en este período.</p>
      ) : (
        <>
          {/* El resumen de todos los inventarios del período. */}
          <table className="mb-8 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Fecha</th>
                <th className="py-1.5">Almacén</th>
                <th className="py-1.5 text-right">Contados</th>
                <th className="py-1.5 text-right">Con dif.</th>
                <th className="py-1.5 text-right">Sistema</th>
                <th className="py-1.5 text-right">Contado</th>
                <th className="py-1.5 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {reporte.inventarios.map((inv) => (
                <tr key={inv.id} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 text-tinta">{textoFecha(inv.fecha)}</td>
                  <td className="py-1.5 text-tinta-media">{inv.almacen}</td>
                  <td className="py-1.5 text-right text-tinta-media">{inv.contados}</td>
                  <td className="py-1.5 text-right text-tinta-media">{inv.conDiferencia}</td>
                  <td className="cifra py-1.5 text-right text-tinta-media">{formatearGuarani(Math.round(inv.valorSistema))}</td>
                  <td className="cifra py-1.5 text-right text-tinta-media">{formatearGuarani(Math.round(inv.valorContado))}</td>
                  <td className={`cifra py-1.5 text-right font-semibold ${claseDiferencia(inv.diferenciaValor)}`}>
                    {plataConSigno(inv.diferenciaValor)}
                  </td>
                </tr>
              ))}
              {reporte.inventarios.length > 1 && (
                <tr>
                  <td colSpan={2} className="py-2 text-xs uppercase tracking-wide text-tinta-media">
                    Total
                  </td>
                  <td className="py-2 text-right font-semibold text-tinta">{reporte.totales.contados}</td>
                  <td className="py-2 text-right font-semibold text-tinta">{reporte.totales.conDiferencia}</td>
                  <td colSpan={2} />
                  <td className={`cifra py-2 text-right text-base font-bold ${claseDiferencia(reporte.totales.diferenciaValor)}`}>
                    {plataConSigno(reporte.totales.diferenciaValor)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* La planilla de cada inventario: los insumos que se contaron. */}
          {reporte.inventarios.map((inv) => {
            const contados = inv.items.filter((it) => it.contado != null);
            const sinContar = inv.items.length - contados.length;
            return (
              <div key={inv.id} className="mb-8">
                <h2 className="font-semibold text-tinta">
                  {textoFecha(inv.fecha)} · {inv.almacen}
                </h2>
                <p className="mb-2 text-xs text-tinta-media">
                  {inv.categorias}
                  {inv.registradoPor && ` · Registrado por ${inv.registradoPor}`}
                </p>
                {contados.length === 0 ? (
                  <p className="text-sm text-tinta-suave">No se contó ningún insumo en este inventario.</p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                        <th className="py-1.5">Insumo</th>
                        <th className="py-1.5 text-right">Sistema</th>
                        <th className="py-1.5 text-right">Contado</th>
                        <th className="py-1.5 text-right">Diferencia</th>
                        <th className="py-1.5 text-right">Valor dif.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contados.map((it, i) => (
                        <tr key={i} className="border-b border-linea-fina break-inside-avoid">
                          <td className="py-1.5 text-tinta">
                            {it.insumo} <span className="text-xs text-tinta-suave">{it.unidad}</span>
                          </td>
                          <td className="py-1.5 text-right text-tinta-media">{it.stockSistema}</td>
                          <td className="py-1.5 text-right text-tinta-media">{it.contado}</td>
                          <td className={`py-1.5 text-right font-semibold ${claseDiferencia(it.diferencia ?? 0)}`}>
                            {conSigno(it.diferencia ?? 0)}
                          </td>
                          <td className={`cifra py-1.5 text-right ${claseDiferencia(it.valorDiferencia ?? 0)}`}>
                            {it.valorDiferencia != null ? plataConSigno(it.valorDiferencia) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {sinContar > 0 && (
                  <p className="mt-1 text-xs text-tinta-suave">
                    {sinContar} {sinContar === 1 ? "insumo" : "insumos"} de la planilla no se contaron y se tomaron como
                    estaban.
                  </p>
                )}
              </div>
            );
          })}
        </>
      )}

      <p className="mt-6 text-xs text-tinta-suave">
        Diferencia = lo contado menos lo que decía el sistema. En verde, sobró; en rojo, faltó. El valor va a costo de
        cada insumo al momento de guardar el inventario (sin IVA); los insumos sin costo no suman.
      </p>
      <p className="mt-2 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
