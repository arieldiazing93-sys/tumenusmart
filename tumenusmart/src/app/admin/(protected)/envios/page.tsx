import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera } from "@/components/ui";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularReporteEnvios } from "@/lib/reporte-envios";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "mes", label: "Este mes" },
  { value: "mesAnterior", label: "Mes anterior" },
  { value: "30dias", label: "Últimos 30 días" },
];

export default async function EnviosPage({
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
  const reporte = await calcularReporteEnvios(storeId, rango);

  const hayPedidos = reporte.totalGeneral.cantidadPedidos > 0;
  const pctDelivery = (cantidad: number) =>
    reporte.totalGeneral.cantidadDelivery > 0
      ? Math.round((cantidad / reporte.totalGeneral.cantidadDelivery) * 100)
      : 0;

  return (
    <div>
      <Cabecera
        titulo="Envíos"
        bajada="Cuántos pedidos llegan por delivery y de qué zona, aparte de retiro en el local — para saber dónde conviene reforzar reparto."
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={`/admin/envios?fecha=${f.value}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form
          method="get"
          action="/admin/envios"
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-sm ${
            fechaActiva === "rango" ? "border-brand bg-brand-light" : "border-linea"
          }`}
        >
          <input type="hidden" name="fecha" value="rango" />
          <input
            type="date"
            name="desde"
            defaultValue={fechaActiva === "rango" ? desde : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <span className="text-tinta-suave">–</span>
          <input
            type="date"
            name="hasta"
            defaultValue={fechaActiva === "rango" ? hasta : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <button
            type="submit"
            className="rounded-full bg-noche-panel px-3 py-1 text-xs font-medium text-white hover:bg-noche-panel"
          >
            Filtrar
          </button>
        </form>
      </div>

      {!hayPedidos ? (
        <p className="text-sm text-tinta-suave">Todavía no hay pedidos en este período.</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TarjetaTotal
              color="volumen"
              etiqueta="Pedidos delivery"
              valor={String(reporte.totalGeneral.cantidadDelivery)}
            />
            <TarjetaTotal
              color="volumen"
              etiqueta="Pedidos retiro"
              valor={String(reporte.totalGeneral.cantidadRetiro)}
            />
            <TarjetaTotal
              color="dinero"
              etiqueta="Facturado (delivery + retiro)"
              valor={formatearGuarani(Math.round(reporte.totalGeneral.totalFacturado))}
            />
            <TarjetaTotal
              color="envio"
              etiqueta="Cobrado por envío"
              valor={formatearGuarani(Math.round(reporte.totalGeneral.totalEnvio))}
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-linea bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-linea bg-papel-suave text-xs uppercase tracking-wide text-tinta-media">
                <tr>
                  <th className="px-3 py-2">Zona</th>
                  <th className="px-3 py-2 text-right">Pedidos</th>
                  <th className="px-3 py-2 text-right">% del delivery</th>
                  <th className="px-3 py-2 text-right">Facturado</th>
                  <th className="px-3 py-2 text-right">Cobrado por envío</th>
                  <th className="px-3 py-2 text-right">Envío promedio</th>
                </tr>
              </thead>
              <tbody>
                {reporte.zonas.map((z) => (
                  <tr key={z.zonaId ?? "sin-zona"} className="border-b border-linea-fina last:border-0">
                    <td className="px-3 py-2 font-medium text-tinta">{z.zonaNombre}</td>
                    <td className="cifra px-3 py-2 text-right text-tinta-media">{z.cantidadPedidos}</td>
                    <td className="cifra px-3 py-2 text-right text-tinta-media">
                      {pctDelivery(z.cantidadPedidos)}%
                    </td>
                    <td className="cifra px-3 py-2 text-right text-tinta-media">
                      {formatearGuarani(Math.round(z.totalFacturado))}
                    </td>
                    <td className="cifra px-3 py-2 text-right text-tinta-media">
                      {formatearGuarani(Math.round(z.totalEnvio))}
                    </td>
                    <td className="cifra px-3 py-2 text-right font-semibold text-tinta">
                      {formatearGuarani(Math.round(z.envioPromedio))}
                    </td>
                  </tr>
                ))}
                {reporte.zonas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-3 text-center text-sm text-tinta-suave">
                      Sin pedidos delivery en este período.
                    </td>
                  </tr>
                )}
                {/* Retiro va aparte, no como una "zona" más — no tiene envío ni
                    tiene sentido compararlo por % del delivery. */}
                <tr className="border-t-2 border-linea bg-papel-suave/60">
                  <td className="px-3 py-2 font-medium text-tinta">Retiro en el local</td>
                  <td className="cifra px-3 py-2 text-right text-tinta-media">
                    {reporte.retiro.cantidadPedidos}
                  </td>
                  <td className="px-3 py-2 text-right text-tinta-suave">—</td>
                  <td className="cifra px-3 py-2 text-right text-tinta-media">
                    {formatearGuarani(Math.round(reporte.retiro.totalFacturado))}
                  </td>
                  <td className="px-3 py-2 text-right text-tinta-suave">—</td>
                  <td className="px-3 py-2 text-right text-tinta-suave">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Mismo criterio de color que Rentabilidad: agrupa por significado, no
// decora. Volumen (azul) es cuánto se movió — delivery y retiro comparten
// el mismo tono porque son el mismo TIPO de dato (una cantidad), no dos
// cosas distintas. Dinero (verde) es lo que entró. Envío (ámbar) es un
// costo para el cliente, no para el negocio — por eso no es ni verde ni
// rojo, es solo un dato a tener en cuenta.
const COLORES_TOTAL = {
  volumen: { caja: "border-azul/25 bg-azul-luz", rotulo: "text-azul-oscuro", cifra: "text-azul-oscuro" },
  dinero: { caja: "border-exito/25 bg-exito-luz", rotulo: "text-exito", cifra: "text-exito" },
  envio: { caja: "border-aviso/30 bg-aviso-luz", rotulo: "text-aviso", cifra: "text-aviso" },
} as const;

function TarjetaTotal({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: string;
  color: keyof typeof COLORES_TOTAL;
}) {
  const c = COLORES_TOTAL[color];
  return (
    <div className={`rounded-xl border p-4 ${c.caja}`}>
      <p className={`text-[0.68rem] font-semibold uppercase tracking-rotulo ${c.rotulo}`}>{etiqueta}</p>
      <p className={`cifra mt-1.5 text-[1.3rem] font-semibold leading-none ${c.cifra}`}>{valor}</p>
    </div>
  );
}
