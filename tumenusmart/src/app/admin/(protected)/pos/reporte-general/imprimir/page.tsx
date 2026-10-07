import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { COLUMNAS_CANAL, COLUMNAS_FORMA_PAGO, calcularReporteGeneralPos } from "@/lib/reporte-general-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

export default async function ImprimirReporteGeneralPosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva = fecha ?? "hoy";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("hoy", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteGeneralPos(storeId, rango),
  ]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const opcionesFechaHora: Intl.DateTimeFormatOptions = {
    ...opcionesFecha,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 border-b border-linea pb-6">
        <h1 className="text-2xl font-bold text-tinta">Reporte general de cuentas — {local.nombre}</h1>
        <p className="mt-1 text-sm text-tinta-media">
          Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
          {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
        </p>
        <p className="mt-1 text-xs text-tinta-suave">
          Todo lo cobrado —mostrador, comedor, delivery y reservas de turnos— con la fecha y la forma de pago de la caja.
        </p>
      </div>

      {reporte.filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No se registraron cuentas en este período.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">N°</th>
              {COLUMNAS_CANAL.map((c) => (
                <th key={c.valor} className="py-1.5">
                  {c.etiqueta}
                </th>
              ))}
              <th className="py-1.5">Fecha</th>
              <th className="py-1.5 text-right">Importe</th>
              {COLUMNAS_FORMA_PAGO.map((f) => (
                <th key={f.valor} className="py-1.5 text-right">
                  {f.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={`${f.n}-${f.idVentaDb}`} className="border-b border-linea-fina">
                <td className="py-1.5">{f.n}</td>
                {COLUMNAS_CANAL.map((c) => (
                  <td key={c.valor} className="py-1.5 text-tinta-media">
                    {f.canal === c.valor ? formatearNumero(f.idVenta) : "—"}
                  </td>
                ))}
                <td className="py-1.5 text-tinta-media">{f.fecha.toLocaleString("es-PY", opcionesFechaHora)}</td>
                <td className="cifra py-1.5 text-right">{formatearGuarani(f.importe)}</td>
                {COLUMNAS_FORMA_PAGO.map((fp) => (
                  <td key={fp.valor} className="cifra py-1.5 text-right text-tinta-media">
                    {f.formaPago === fp.valor ? formatearGuarani(f.importe) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-linea font-semibold text-tinta">
              <td className="py-2" colSpan={2 + COLUMNAS_CANAL.length}>
                CUENTAS ({reporte.filas.length})
              </td>
              <td className="cifra py-2 text-right">{formatearGuarani(reporte.totalImporte)}</td>
              {COLUMNAS_FORMA_PAGO.map((fp) => (
                <td key={fp.valor} className="cifra py-2 text-right">
                  {formatearGuarani(reporte.totalPorForma[fp.valor])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
