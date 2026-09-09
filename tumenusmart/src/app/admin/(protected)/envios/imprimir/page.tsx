import { Fragment } from "react";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularReporteEnvios } from "@/lib/reporte-envios";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

export default async function ImprimirEnviosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteEnvios(storeId, rango),
  ]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };

  const hayPedidos = reporte.totalGeneral.cantidadPedidos > 0;
  const pctDelivery = (cantidad: number) =>
    reporte.totalGeneral.cantidadDelivery > 0
      ? Math.round((cantidad / reporte.totalGeneral.cantidadDelivery) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-linea pb-6">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={local.logoUrl}
            alt={local.nombre}
            className="h-16 w-16 flex-none rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Envíos</h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
            {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
          </p>
        </div>
      </div>

      {!hayPedidos ? (
        <p className="text-sm text-tinta-suave">Sin pedidos en este período.</p>
      ) : (
        <>
          <table className="mb-10 w-full border-collapse text-sm">
            <tbody>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Pedidos delivery</td>
                <td className="py-2 text-right font-semibold text-tinta">
                  {reporte.totalGeneral.cantidadDelivery}
                </td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Pedidos retiro</td>
                <td className="py-2 text-right font-semibold text-tinta">
                  {reporte.totalGeneral.cantidadRetiro}
                </td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Facturado (delivery + retiro)</td>
                <td className="py-2 text-right font-semibold text-tinta">
                  {formatearGuarani(Math.round(reporte.totalGeneral.totalFacturado))}
                </td>
              </tr>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Cobrado por envío</td>
                <td className="py-2 text-right font-semibold text-tinta">
                  {formatearGuarani(Math.round(reporte.totalGeneral.totalEnvio))}
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Zona</th>
                <th className="py-1.5 text-right">Pedidos</th>
                <th className="py-1.5 text-right">% delivery</th>
                <th className="py-1.5 text-right">Facturado</th>
                <th className="py-1.5 text-right">Envío cobrado</th>
                <th className="py-1.5 text-right">Envío promedio</th>
              </tr>
            </thead>
            <tbody>
              {reporte.zonas.map((z) => (
                <Fragment key={z.zonaId ?? "sin-zona"}>
                  <tr className="border-b border-linea-fina break-inside-avoid">
                    <td className="py-1.5 text-tinta">{z.zonaNombre}</td>
                    <td className="py-1.5 text-right text-tinta-media">{z.cantidadPedidos}</td>
                    <td className="py-1.5 text-right text-tinta-media">{pctDelivery(z.cantidadPedidos)}%</td>
                    <td className="py-1.5 text-right text-tinta-media">
                      {formatearGuarani(Math.round(z.totalFacturado))}
                    </td>
                    <td className="py-1.5 text-right text-tinta-media">
                      {formatearGuarani(Math.round(z.totalEnvio))}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-tinta">
                      {formatearGuarani(Math.round(z.envioPromedio))}
                    </td>
                  </tr>
                  {z.repartidores.map((r) => (
                    <tr
                      key={r.repartidorId ?? "sin-repartidor"}
                      className="border-b border-linea-fina break-inside-avoid text-xs"
                    >
                      <td className="py-1 pl-4 text-tinta-suave">→ {r.repartidorNombre}</td>
                      <td className="py-1 text-right text-tinta-suave">{r.cantidadPedidos}</td>
                      <td colSpan={4} />
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="border-t-2 border-linea">
                <td className="py-1.5 font-semibold text-tinta">Retiro en el local</td>
                <td className="py-1.5 text-right text-tinta-media">{reporte.retiro.cantidadPedidos}</td>
                <td className="py-1.5 text-right text-tinta-suave">—</td>
                <td className="py-1.5 text-right text-tinta-media">
                  {formatearGuarani(Math.round(reporte.retiro.totalFacturado))}
                </td>
                <td className="py-1.5 text-right text-tinta-suave">—</td>
                <td className="py-1.5 text-right text-tinta-suave">—</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
