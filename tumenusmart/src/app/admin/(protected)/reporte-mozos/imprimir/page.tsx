import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularReporteMozos } from "@/lib/reporte-mozos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

const gs = (n: number) => formatearGuarani(Math.round(n));
const gsOGuion = (n: number) => (n > 0 ? gs(n) : "—");

/**
 * La versión para imprimir o guardar como PDF del reporte de Mozos: las mismas cuentas que la pantalla y el Excel (con la misma
 * función, `calcularReporteMozos`), con el mismo período y el mismo mozo elegido, en hoja apaisada para que entren las columnas.
 */
export default async function ImprimirMozosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string; mozo?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta, mozo } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, completo] = await Promise.all([localActual(), calcularReporteMozos(storeId, rango, mozo || null)]);
  // Un mozo que ya no existe en el enlace: se muestra el reporte de todos, igual que en la pantalla.
  const mozoElegido = completo.mozosDisponibles.find((m) => m.id === mozo) ?? null;
  const reporte = mozo && !mozoElegido ? await calcularReporteMozos(storeId, rango, null) : completo;
  const t = reporte.totales;
  const hayDatos = reporte.filas.length > 0 && (t.cuentasAbiertas > 0 || t.cuentasCobradas > 0 || t.productosEnviados > 0);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      {/* Hoja apaisada: con las columnas de comisión, descuentos y cancelaciones, a lo ancho se lee mejor. */}
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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Mozos</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} – {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
            {" · "}
            {mozoElegido ? `Mozo: ${mozoElegido.nombre}` : "Todos los mozos"}
          </p>
        </div>
      </div>

      {!hayDatos ? (
        <p className="text-sm text-tinta-suave">Sin movimiento de mozos en este período.</p>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-5 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Vendido</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{gs(t.ventas)}</dd>
              <dd className="text-xs text-tinta-suave">
                {t.cuentasCobradas} {t.cuentasCobradas === 1 ? "cuenta cobrada" : "cuentas cobradas"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Comisión que se les debe</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{gs(t.comisionPendiente)}</dd>
              <dd className="text-xs text-tinta-suave">
                ganada {gs(t.comision)} · pagada {gs(t.comisionPagada)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Ticket promedio</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{gs(t.ticketPromedio)}</dd>
              <dd className="text-xs text-tinta-suave">por cuenta cobrada</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Descuentos</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{gs(t.descuentos)}</dd>
              <dd className="text-xs text-tinta-suave">
                {t.cuentasConDescuento} {t.cuentasConDescuento === 1 ? "cuenta" : "cuentas"} con descuento
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Productos cancelados</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{t.productosCancelados}</dd>
              <dd className="text-xs text-tinta-suave">
                {gs(t.montoCancelado)} · {t.cuentasCanceladas} {t.cuentasCanceladas === 1 ? "cuenta cancelada" : "cuentas canceladas"}
              </dd>
            </div>
          </dl>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-linea text-left uppercase tracking-wide text-tinta-media">
                <th className="py-1.5 pr-2">Mozo</th>
                <th className="py-1.5 pr-2 text-right">Abiertas</th>
                <th className="py-1.5 pr-2 text-right">Cobradas</th>
                <th className="py-1.5 pr-2 text-right">Vendido</th>
                <th className="py-1.5 pr-2 text-right">Comisión ganada</th>
                <th className="py-1.5 pr-2 text-right">Comisión pagada</th>
                <th className="py-1.5 pr-2 text-right">Comisión pendiente</th>
                <th className="py-1.5 pr-2 text-right">Ticket promedio</th>
                <th className="py-1.5 pr-2 text-right">Por persona</th>
                <th className="py-1.5 pr-2 text-right">Descuentos</th>
                <th className="py-1.5 pr-2 text-right">Prod. enviados</th>
                <th className="py-1.5 pr-2 text-right">Prod. cancelados</th>
                <th className="py-1.5 pr-2 text-right">Cuentas canceladas</th>
                <th className="py-1.5 text-right">Cobros cancelados</th>
              </tr>
            </thead>
            <tbody>
              {reporte.filas.map((f) => (
                <tr key={f.mozoId} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 pr-2 font-medium text-tinta">
                    {f.nombre}
                    {!f.activo && <span className="ml-1 font-normal text-tinta-suave">(desactivado)</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.cuentasAbiertas}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.cuentasCobradas}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-tinta">{gs(f.ventas)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{gsOGuion(f.comision)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{gsOGuion(f.comisionPagada)}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-tinta">{gsOGuion(f.comisionPendiente)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{gs(f.ticketPromedio)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.ventaPorPersona != null ? gs(f.ventaPorPersona) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{gsOGuion(f.descuentos)}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.productosEnviados}</td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">
                    {f.productosCancelados > 0 ? `${f.productosCancelados} · ${gs(f.montoCancelado)}` : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-tinta-media">{f.cuentasCanceladas > 0 ? f.cuentasCanceladas : "—"}</td>
                  <td className="py-1.5 text-right text-tinta-media">{f.cobrosCancelados > 0 ? f.cobrosCancelados : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-linea font-semibold text-tinta">
                <td className="py-1.5 pr-2">Total</td>
                <td className="py-1.5 pr-2 text-right">{t.cuentasAbiertas}</td>
                <td className="py-1.5 pr-2 text-right">{t.cuentasCobradas}</td>
                <td className="py-1.5 pr-2 text-right">{gs(t.ventas)}</td>
                <td className="py-1.5 pr-2 text-right">{gsOGuion(t.comision)}</td>
                <td className="py-1.5 pr-2 text-right">{gsOGuion(t.comisionPagada)}</td>
                <td className="py-1.5 pr-2 text-right">{gsOGuion(t.comisionPendiente)}</td>
                <td className="py-1.5 pr-2 text-right">{gs(t.ticketPromedio)}</td>
                <td className="py-1.5 pr-2 text-right">{t.ventaPorPersona != null ? gs(t.ventaPorPersona) : "—"}</td>
                <td className="py-1.5 pr-2 text-right">{gs(t.descuentos)}</td>
                <td className="py-1.5 pr-2 text-right">{t.productosEnviados}</td>
                <td className="py-1.5 pr-2 text-right">{t.productosCancelados}</td>
                <td className="py-1.5 pr-2 text-right">{t.cuentasCanceladas}</td>
                <td className="py-1.5 text-right">{t.cobrosCancelados}</td>
              </tr>
            </tfoot>
          </table>

          <p className="mt-4 text-[0.72rem] leading-snug text-tinta-suave">
            Lo vendido es lo cobrado (ya con el descuento) de las cuentas del mozo, por el día en que se cobraron. Los productos
            enviados y cancelados son los que el mozo cargó desde su celular. “Cuentas canceladas” son las que se anularon antes
            de cobrarse; “Cobros cancelados”, ventas ya cobradas que después se anularon. La comisión ganada es la de las cuentas
            cobradas en el período; la pagada, lo entregado desde la caja en esas fechas; la pendiente es lo que se le debe hoy,
            sin importar el período.
          </p>
        </>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
