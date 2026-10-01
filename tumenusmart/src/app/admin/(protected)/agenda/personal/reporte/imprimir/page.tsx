import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { formatearGuarani } from "@/lib/format";
import { diaEnTexto } from "@/lib/rango-dias";
import { MAXIMO_DIAS_REPORTE, cargarReportePersonal } from "@/lib/reporte-personal";
import { ImprimirBoton } from "../../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** Tope del detalle en el PDF: mismo criterio que la pantalla (una tabla más larga no se lee bien impresa). El
 * Excel, que sí es para procesar los datos, no tiene este límite. */
const MAXIMO_FILAS_PDF = 500;

function textoPorcentaje(valor: number): string {
  return String(valor).replace(".", ",");
}

/**
 * Versión imprimible del reporte de personal — "Imprimir / Guardar como PDF" desde el navegador, mismo mecanismo
 * que Estadísticas y Cotizaciones. Trae lo mismo que se ve en pantalla (y lo mismo que el Excel, con la misma
 * función `cargarReportePersonal`), acomodado en tablas simples para que se lea bien en papel u hoja A4/carta.
 */
export default async function ImprimirReportePersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ personal?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("agenda.configurar");
  const sp = await searchParams;
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [reporte, local] = await Promise.all([
    cargarReportePersonal(
      db,
      { personal: sp.personal, desde: sp.desde, hasta: sp.hasta },
      MAXIMO_FILAS_PDF,
      "asc"
    ),
    localActual(),
  ]);
  const { periodo, demasiadoLargo, personalElegido, personas, porPersona, general, filas, hayMas } = reporte;
  // Sin trabajos NI ventas con comisión de producto: ahí sí no hay nada que mostrar (mismo criterio que la pantalla).
  const hayMovimiento = general.cantidad > 0 || general.comisionProducto > 0;

  if (!periodo || demasiadoLargo) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <p className="text-sm text-tinta-media">
          {!periodo
            ? "Elegí el período del reporte antes de imprimirlo."
            : `El período es muy largo: elegí hasta ${MAXIMO_DIAS_REPORTE} días por vez.`}
        </p>
      </div>
    );
  }

  const textoPeriodo =
    periodo.desde === periodo.hasta ? diaEnTexto(periodo.desde) : `${diaEnTexto(periodo.desde)} – ${diaEnTexto(periodo.hasta)}`;
  const quien = personalElegido ? personalElegido.nombre : "Todo el personal";
  // Se ve a quien está activo y a quien, aunque esté inactivo, tuvo trabajo en el período — mismo criterio que
  // la pantalla y el Excel.
  const aMostrar = personalElegido ? [personalElegido] : personas.filter((p) => p.activo || porPersona.has(p.id));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-linea pb-6">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-16 w-16 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre}</h1>
          <p className="mt-1 text-sm text-tinta-media">Reporte de personal — {quien}</p>
          <p className="text-sm text-tinta-media">Período: {textoPeriodo}</p>
        </div>
      </div>

      {!hayMovimiento ? (
        <p className="text-sm text-tinta-suave">No hay movimiento en este período.</p>
      ) : (
        <>
          {!personalElegido && (
            <>
              <h2 className="mb-3 font-semibold text-tinta">Por persona</h2>
              <table className="mb-10 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Personal</th>
                    <th className="py-1.5 text-right">Trabajos</th>
                    <th className="py-1.5 text-right">Cobrado</th>
                    <th className="py-1.5 text-right">Comisión servicios</th>
                    <th className="py-1.5 text-right">Comisión productos</th>
                  </tr>
                </thead>
                <tbody>
                  {aMostrar.map((p) => {
                    const suma = porPersona.get(p.id) ?? { cantidad: 0, cobrado: 0, comision: 0, comisionProducto: 0 };
                    return (
                      <tr key={p.id} className="border-b border-linea-fina">
                        <td className="py-1.5 text-tinta">
                          {p.nombre}
                          <span className="block text-xs text-tinta-suave">
                            {p.comision != null ? `Servicio ${textoPorcentaje(p.comision)}%` : "Sin comisión servicio"}
                            {" · "}
                            {p.comisionProducto != null
                              ? `Producto ${textoPorcentaje(p.comisionProducto)}%`
                              : "Sin comisión producto"}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-tinta">{suma.cantidad}</td>
                        <td className="py-1.5 text-right text-tinta">{formatearGuarani(Math.round(suma.cobrado))}</td>
                        <td className="py-1.5 text-right font-semibold text-tinta">
                          {formatearGuarani(Math.round(suma.comision))}
                        </td>
                        <td className="py-1.5 text-right font-semibold text-tinta">
                          {formatearGuarani(Math.round(suma.comisionProducto))}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-linea font-semibold">
                    <td className="py-2 text-tinta">TOTAL</td>
                    <td className="py-2 text-right text-tinta">{general.cantidad}</td>
                    <td className="py-2 text-right text-tinta">{formatearGuarani(Math.round(general.cobrado))}</td>
                    <td className="py-2 text-right text-tinta">{formatearGuarani(Math.round(general.comision))}</td>
                    <td className="py-2 text-right text-tinta">
                      {formatearGuarani(Math.round(general.comisionProducto))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          <h2 className="mb-1 font-semibold text-tinta">Detalle</h2>
          <p className="mb-3 text-xs text-tinta-suave">
            Trabajos (citas) y ventas de productos, mezclados por fecha. El TOTAL de abajo es solo de los trabajos
            — la comisión de productos ya está arriba, en su propia tarjeta.
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Comprobante</th>
                <th className="py-1.5">Fecha</th>
                {!personalElegido && <th className="py-1.5">Personal</th>}
                <th className="py-1.5">Cliente</th>
                <th className="py-1.5">Servicios</th>
                <th className="py-1.5 text-right">Total</th>
                <th className="py-1.5 text-right">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-linea-fina">
                  <td className="py-1.5 text-tinta-media">{f.comprobante}</td>
                  <td className="py-1.5 text-tinta-media">
                    {diaEnTexto(f.dia)} {f.hora}
                  </td>
                  {!personalElegido && <td className="py-1.5 text-tinta-media">{f.personal}</td>}
                  <td className="py-1.5 text-tinta">
                    {f.cliente}
                    {f.sinReserva && <span className="text-tinta-suave"> (mostrador)</span>}
                  </td>
                  <td className="py-1.5 text-tinta-media">{f.servicios ?? "—"}</td>
                  <td className="py-1.5 text-right text-tinta">{formatearGuarani(Math.round(f.total))}</td>
                  <td className="py-1.5 text-right font-semibold text-tinta">
                    {f.porcentaje != null ? formatearGuarani(Math.round(f.comision)) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-linea font-semibold">
                <td className="py-2 text-tinta" colSpan={personalElegido ? 4 : 5}>
                  TOTAL SERVICIOS
                </td>
                <td className="py-2 text-right text-tinta">{formatearGuarani(Math.round(general.cobrado))}</td>
                <td className="py-2 text-right text-tinta">{formatearGuarani(Math.round(general.comision))}</td>
              </tr>
            </tbody>
          </table>
          {hayMas && (
            <p className="mt-3 text-xs text-tinta-suave">
              Se listan los primeros {MAXIMO_FILAS_PDF} del período; los totales de arriba cuentan todos. Para el
              detalle completo, descargá el Excel.
            </p>
          )}
        </>
      )}
    </div>
  );
}
