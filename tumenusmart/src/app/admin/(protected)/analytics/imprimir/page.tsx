import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularClientesDelRango, calcularDistribucionFrecuencia } from "@/lib/clientes-analytics";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

const TOPE_TABLA = 100;

export default async function ImprimirAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  await pantallaConPermiso("analytics.ver");

  const { fecha } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "30dias";
  const rango =
    calcularRangoFecha(fechaActiva, undefined, undefined) ??
    calcularRangoFecha("30dias", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, clientes] = await Promise.all([
    localActual(),
    calcularClientesDelRango(storeId, rango),
  ]);

  const distribucion = calcularDistribucionFrecuencia(clientes);
  const top = clientes.slice(0, TOPE_TABLA);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };

  const filasDistribucion: [string, string][] = [
    ["Clientes en el período", String(clientes.length)],
    ["Pidieron 1 vez", String(distribucion.unaVez)],
    ["Pidieron 2-3 veces", String(distribucion.dosATres)],
    ["Pidieron 4 o más veces", String(distribucion.cuatroOMas)],
  ];

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
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Analytics</h1>
          {local.direccion && <p className="text-sm text-tinta-media">{local.direccion}</p>}
          <p className="mt-1 text-sm text-tinta-media">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
            {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
          </p>
        </div>
      </div>

      <h2 className="mb-3 font-semibold text-tinta">Distribución de frecuencia</h2>
      <table className="mb-10 w-full border-collapse text-sm">
        <tbody>
          {filasDistribucion.map(([etiqueta, valor]) => (
            <tr key={etiqueta} className="border-b border-linea">
              <td className="py-2 text-tinta-media">{etiqueta}</td>
              <td className="py-2 text-right font-semibold text-tinta">{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-3 font-semibold text-tinta">
        Top {Math.min(TOPE_TABLA, clientes.length)} clientes por cantidad de pedidos
      </h2>
      {top.length === 0 ? (
        <p className="text-sm text-tinta-suave">Sin pedidos en este período.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">#</th>
              <th className="py-1.5">Cliente</th>
              <th className="py-1.5">Teléfono</th>
              <th className="py-1.5 text-right">Pedidos</th>
              <th className="py-1.5 text-right">Gasto total</th>
              <th className="py-1.5 text-right">Último pedido</th>
            </tr>
          </thead>
          <tbody>
            {top.map((c, i) => (
              <tr key={c.telefono} className="border-b border-linea-fina break-inside-avoid">
                <td className="py-1.5 text-tinta-suave">{i + 1}</td>
                <td className="py-1.5 text-tinta">{c.nombre}</td>
                <td className="py-1.5 text-tinta-media">{c.telefono}</td>
                <td className="py-1.5 text-right font-semibold text-tinta">{c.pedidos}</td>
                <td className="py-1.5 text-right text-tinta-media">
                  {formatearGuarani(Math.round(c.gastado))}
                </td>
                <td className="py-1.5 text-right text-tinta-suave">
                  {c.ultimoPedido.toLocaleDateString("es-PY", opcionesFecha)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
