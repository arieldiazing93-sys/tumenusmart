import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearCantidad, formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { NOMBRE_DE_CANAL } from "@/lib/reporte-promociones";
import { TIPOS_DE_REGISTRO, autorizoDe, formatearFechaHora, leerTipo, resumirRegistros } from "@/lib/reporte-cancelaciones";
import { cargarRegistros } from "@/lib/reporte-cancelaciones-servidor";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** La versión para imprimir o guardar como PDF del reporte de cancelaciones y descuentos: el mismo criterio, con todos los registros. */
export default async function ImprimirCancelacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; usuario?: string; fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { tipo: tipoCrudo, usuario: usuarioCrudo, fecha, desde, hasta } = await searchParams;
  const tipo = leerTipo(tipoCrudo);
  const info = TIPOS_DE_REGISTRO.find((t) => t.value === tipo)!;
  const usuario = usuarioCrudo?.trim() ? usuarioCrudo.trim() : null;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, registros] = await Promise.all([localActual(), cargarRegistros(storeId, rango, tipo)]);
  const r = resumirRegistros(registros, usuario);
  const t = r.totales;
  const esProductos = tipo === "productos";
  const esDescuentos = tipo === "descuentos";

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-6 flex items-center gap-4 border-b border-linea pb-5">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-16 w-16 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">
            {local.nombre} — {info.label}
          </h1>
          <p className="mt-1 text-sm text-tinta-media">
            Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} – {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
            {" · "}Autorizó: {usuario ?? "todas las personas"}
          </p>
        </div>
      </div>

      {r.filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">Sin registros en este período.</p>
      ) : (
        <>
          <table className="mb-8 w-full max-w-md border-collapse text-sm">
            <tbody>
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">{info.label}</td>
                <td className="py-2 text-right font-semibold text-tinta">{t.registros}</td>
              </tr>
              {esProductos && (
                <tr className="border-b border-linea">
                  <td className="py-2 text-tinta-media">Unidades</td>
                  <td className="py-2 text-right font-semibold text-tinta">{formatearCantidad(t.unidades)}</td>
                </tr>
              )}
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">{info.cancelado}</td>
                <td className="py-2 text-right font-semibold text-tinta">{formatearGuarani(t.monto)}</td>
              </tr>
              {esDescuentos && (
                <tr className="border-b border-linea">
                  <td className="py-2 text-tinta-media">Cobrado de esas ventas</td>
                  <td className="py-2 text-right font-semibold text-tinta">{formatearGuarani(t.cobrado)}</td>
                </tr>
              )}
              <tr className="border-b border-linea">
                <td className="py-2 text-tinta-media">Personas que autorizaron</td>
                <td className="py-2 text-right font-semibold text-tinta">{t.personas}</td>
              </tr>
            </tbody>
          </table>

          <h2 className="mb-2 text-sm font-semibold text-tinta">Por persona que autorizó</h2>
          <table className="mb-8 w-full max-w-xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Autorizó</th>
                <th className="py-1.5 text-right">Registros</th>
                <th className="py-1.5 text-right">{info.cancelado}</th>
              </tr>
            </thead>
            <tbody>
              {r.porPersona.map((p) => (
                <tr key={p.usuario} className="border-b border-linea-fina break-inside-avoid">
                  <td className="py-1.5 text-tinta">{p.usuario}</td>
                  <td className="py-1.5 text-right text-tinta-media">{p.registros}</td>
                  <td className="py-1.5 text-right font-semibold text-tinta">{formatearGuarani(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-2 text-sm font-semibold text-tinta">Detalle</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-linea text-left uppercase tracking-wide text-tinta-media">
                <th className="py-1.5 pr-2">Fecha</th>
                <th className="py-1.5 pr-2">Canal</th>
                <th className="py-1.5 pr-2">{esDescuentos ? "Venta" : "Cuenta"}</th>
                <th className="py-1.5 pr-2">{esProductos ? "Producto" : esDescuentos ? "Descuento" : "Estado"}</th>
                <th className="py-1.5 pr-2 text-right">{info.cancelado}</th>
                {esDescuentos && <th className="py-1.5 pr-2 text-right">Cobrado</th>}
                <th className="py-1.5 pr-2">Motivo</th>
                <th className="py-1.5 pr-2">Autorizó</th>
                {esProductos && <th className="py-1.5">Lo cargó</th>}
              </tr>
            </thead>
            <tbody>
              {r.filas.map((f) => (
                <tr key={f.id} className="border-b border-linea-fina align-top break-inside-avoid">
                  <td className="whitespace-nowrap py-1.5 pr-2 text-tinta-media">{formatearFechaHora(f.fecha)}</td>
                  <td className="py-1.5 pr-2 text-tinta-media">{NOMBRE_DE_CANAL[f.canal]}</td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-tinta-media">{f.referencia}</td>
                  <td className="py-1.5 pr-2 text-tinta">{f.detalle}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-tinta">{formatearGuarani(f.monto)}</td>
                  {esDescuentos && <td className="py-1.5 pr-2 text-right text-tinta-media">{f.cobrado === null ? "—" : formatearGuarani(f.cobrado)}</td>}
                  <td className="py-1.5 pr-2 text-tinta-media">{f.motivo ?? "—"}</td>
                  <td className="py-1.5 pr-2 font-medium text-tinta">{autorizoDe(f)}</td>
                  {esProductos && <td className="py-1.5 text-tinta-media">{f.cargo ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
