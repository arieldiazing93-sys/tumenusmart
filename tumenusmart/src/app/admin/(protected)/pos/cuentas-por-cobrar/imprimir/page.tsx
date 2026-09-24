import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { listarCuentasPorCobrar, type FiltroEstadoCobros } from "@/lib/cuentas-por-cobrar";
import { ETIQUETA_ESTADO_CUENTA, textoVencimiento } from "@/lib/pagos-compra";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { claveDiaAsuncion, ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

const ETIQUETA_FILTRO: Record<FiltroEstadoCobros, string> = {
  con_saldo: "Ventas con saldo pendiente",
  cobradas: "Ventas ya cobradas",
  todas: "Todas las ventas a crédito",
};

/** dd/mm/aaaa de un día guardado como medianoche UTC (un vencimiento, la fecha de un cobro). */
function diaUtc(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", { timeZone: "UTC" });
}

/** dd/mm/aaaa de un instante (la venta), en el día de Asunción. */
function diaAsuncion(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO });
}

/** Versión imprimible del reporte de cuentas por cobrar — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirCuentasPorCobrarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  await pantallaConPermiso("pos.vender");

  const { q, estado: estadoTexto } = await searchParams;
  const estado: FiltroEstadoCobros = estadoTexto === "cobradas" || estadoTexto === "todas" ? estadoTexto : "con_saldo";

  const storeId = await idLocalActual();
  const [local, cuentas] = await Promise.all([
    localActual(),
    listarCuentasPorCobrar(storeId, { texto: q, estado }),
  ]);

  const hoy = claveDiaAsuncion(new Date());
  const [anio, mes, diaDelMes] = hoy.split("-");

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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Cuentas por cobrar</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Al {diaDelMes}/{mes}/{anio} · {cuentas.textoFiltrado ? `Cliente: ${cuentas.textoFiltrado}` : "Todos los clientes"}{" "}
            · {ETIQUETA_FILTRO[cuentas.estadoFiltrado]}
          </p>
        </div>
      </div>

      <table className="mb-8 w-full border-collapse text-sm">
        <tbody>
          <tr className="border-b border-linea">
            <td className="py-2 text-tinta-media">Total que te deben</td>
            <td className="py-2 text-right text-base font-bold text-tinta">
              {formatearGuarani(Math.round(cuentas.totalSaldo))}
            </td>
          </tr>
          <tr className="border-b border-linea">
            <td className="py-2 text-tinta-media">De eso, ya vencido</td>
            <td className={`py-2 text-right font-semibold ${cuentas.saldoVencido > 0 ? "text-peligro" : "text-tinta"}`}>
              {formatearGuarani(Math.round(cuentas.saldoVencido))}
            </td>
          </tr>
          <tr className="border-b border-linea">
            <td className="py-2 text-tinta-media">De eso, vence en los próximos 7 días</td>
            <td className="py-2 text-right font-semibold text-tinta">
              {formatearGuarani(Math.round(cuentas.saldoPorVencer))}
            </td>
          </tr>
        </tbody>
      </table>

      {cuentas.porCliente.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 font-semibold text-tinta">Lo que debe cada cliente</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Cliente</th>
                <th className="py-1.5 text-right">Ventas con saldo</th>
                <th className="py-1.5 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.porCliente.map((c) => (
                <tr key={c.clave} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 text-tinta">
                    {c.cliente}
                    {c.telefono && <span className="block text-xs text-tinta-suave">{c.telefono}</span>}
                  </td>
                  <td className="py-1.5 text-right text-tinta-media">{c.ventas}</td>
                  <td className="py-1.5 text-right font-semibold text-tinta">{formatearGuarani(Math.round(c.saldo))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 font-semibold text-tinta">{ETIQUETA_FILTRO[cuentas.estadoFiltrado]}</h2>
      {cuentas.filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay ventas a crédito para este filtro.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">Venta / cliente</th>
              <th className="py-1.5">Fecha</th>
              <th className="py-1.5">Vencimiento</th>
              <th className="py-1.5 text-right">Total</th>
              <th className="py-1.5 text-right">Cobrado</th>
              <th className="py-1.5 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.filas.map((f) => (
              <tr key={f.ventaId} className="break-inside-avoid border-b border-linea-fina align-top">
                <td className="py-1.5 text-tinta">
                  <span className="cifra">{formatearNumero(f.numero)}</span> · {f.cliente}
                  <span className="block text-xs text-tinta-suave">
                    {[f.identificacion, f.telefono, f.facturaNumero ? `Fact. ${f.facturaNumero}` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}{" "}
                    · {f.estado === "pagada" ? "Cobrada" : ETIQUETA_ESTADO_CUENTA[f.estado]}
                  </span>
                  {f.cobros.map((c) => (
                    <span key={c.id} className="block text-xs text-tinta-suave">
                      Cobro {diaUtc(c.fecha)} · {formatearGuarani(Math.round(c.monto))} · {etiquetaFormaPagoPos(c.formaPago)}
                      {c.notas ? ` · ${c.notas}` : ""}
                    </span>
                  ))}
                </td>
                <td className="py-1.5 text-tinta-media">{diaAsuncion(f.fecha)}</td>
                <td className="py-1.5 text-tinta-media">
                  {f.saldo > 0 ? (
                    <>
                      {f.vencimiento ? diaUtc(f.vencimiento) : "—"}
                      <span
                        className={`block text-xs ${
                          f.diasParaVencer != null && f.diasParaVencer < 0 ? "text-peligro" : "text-tinta-suave"
                        }`}
                      >
                        {textoVencimiento(f.diasParaVencer)}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="cifra py-1.5 text-right text-tinta-media">{formatearGuarani(Math.round(f.total))}</td>
                <td className="cifra py-1.5 text-right text-tinta-media">{formatearGuarani(Math.round(f.cobrado))}</td>
                <td className="cifra py-1.5 text-right font-semibold text-tinta">{formatearGuarani(Math.round(f.saldo))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs text-tinta-suave">
        Los montos van con IVA incluido. Saldo = total de la venta menos lo cobrado. El total que te deben y lo vencido salen
        siempre de las ventas con saldo pendiente, aunque la lista sea de las ya cobradas. Las ventas canceladas no figuran.
      </p>
      <p className="mt-2 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
