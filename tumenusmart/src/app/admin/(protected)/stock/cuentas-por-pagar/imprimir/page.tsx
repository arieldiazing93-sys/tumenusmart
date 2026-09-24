import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { listarCuentasPorPagar, type FiltroEstadoCuentas } from "@/lib/cuentas-por-pagar";
import { ETIQUETA_ESTADO_CUENTA, etiquetaFormaPago, textoVencimiento } from "@/lib/pagos-compra";
import { claveDiaAsuncion } from "@/lib/timezone";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

const ETIQUETA_FILTRO: Record<FiltroEstadoCuentas, string> = {
  con_saldo: "Compras con saldo pendiente",
  pagadas: "Compras ya pagadas",
  todas: "Todas las compras a crédito",
};

/** dd/mm/aaaa de un día guardado como medianoche UTC (fecha de una factura, un vencimiento, un pago). */
function dia(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", { timeZone: "UTC" });
}

/** Versión imprimible del reporte de cuentas por pagar — "Imprimir / Guardar como PDF" desde el navegador. */
export default async function ImprimirCuentasPorPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedor?: string; estado?: string }>;
}) {
  await pantallaConPermiso("stock.ver");

  const { proveedor, estado: estadoTexto } = await searchParams;
  const estado: FiltroEstadoCuentas = estadoTexto === "pagadas" || estadoTexto === "todas" ? estadoTexto : "con_saldo";

  const storeId = await idLocalActual();
  const [local, cuentas] = await Promise.all([
    localActual(),
    listarCuentasPorPagar(storeId, { proveedorId: proveedor || null, estado }),
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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Cuentas por pagar</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Al {diaDelMes}/{mes}/{anio} · {cuentas.proveedorFiltrado ?? "Todos los proveedores"} ·{" "}
            {ETIQUETA_FILTRO[cuentas.estadoFiltrado]}
          </p>
        </div>
      </div>

      <table className="mb-8 w-full border-collapse text-sm">
        <tbody>
          <tr className="border-b border-linea">
            <td className="py-2 text-tinta-media">Total que se debe</td>
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

      {cuentas.porProveedor.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-2 font-semibold text-tinta">Lo que se debe a cada proveedor</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Proveedor</th>
                <th className="py-1.5 text-right">Compras con saldo</th>
                <th className="py-1.5 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.porProveedor.map((p) => (
                <tr key={p.proveedorId ?? "sin-proveedor"} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 text-tinta">{p.proveedor}</td>
                  <td className="py-1.5 text-right text-tinta-media">{p.compras}</td>
                  <td className="py-1.5 text-right font-semibold text-tinta">{formatearGuarani(Math.round(p.saldo))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 font-semibold text-tinta">{ETIQUETA_FILTRO[cuentas.estadoFiltrado]}</h2>
      {cuentas.filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay compras a crédito para este filtro.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">Proveedor / folio</th>
              <th className="py-1.5">Fecha</th>
              <th className="py-1.5">Vencimiento</th>
              <th className="py-1.5 text-right">Total</th>
              <th className="py-1.5 text-right">Pagado</th>
              <th className="py-1.5 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.filas.map((f) => (
              <tr key={f.compraId} className="border-b border-linea-fina break-inside-avoid align-top">
                <td className="py-1.5 text-tinta">
                  {f.proveedor}
                  <span className="block text-xs text-tinta-suave">
                    {f.folio ? `Folio ${f.folio}` : "Sin folio"} · {ETIQUETA_ESTADO_CUENTA[f.estado]}
                  </span>
                  {f.pagos.map((p, i) => (
                    <span key={i} className="block text-xs text-tinta-suave">
                      Pago {dia(p.fecha)} · {formatearGuarani(Math.round(p.monto))} · {etiquetaFormaPago(p.formaPago)}
                      {p.notas ? ` · ${p.notas}` : ""}
                    </span>
                  ))}
                </td>
                <td className="py-1.5 text-tinta-media">{dia(f.fecha)}</td>
                <td className="py-1.5 text-tinta-media">
                  {f.saldo > 0 ? (
                    <>
                      {f.vencimiento ? dia(f.vencimiento) : "—"}
                      <span className={`block text-xs ${f.diasParaVencer != null && f.diasParaVencer < 0 ? "text-peligro" : "text-tinta-suave"}`}>
                        {textoVencimiento(f.diasParaVencer)}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="cifra py-1.5 text-right text-tinta-media">{formatearGuarani(Math.round(f.total))}</td>
                <td className="cifra py-1.5 text-right text-tinta-media">{formatearGuarani(Math.round(f.pagado))}</td>
                <td className="cifra py-1.5 text-right font-semibold text-tinta">{formatearGuarani(Math.round(f.saldo))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs text-tinta-suave">
        Los montos van con IVA incluido. Saldo = total de la compra menos lo pagado. El total que se debe y lo vencido salen
        siempre de las compras con saldo pendiente, aunque la lista sea de las ya pagadas. Las compras canceladas no figuran.
      </p>
      <p className="mt-2 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
