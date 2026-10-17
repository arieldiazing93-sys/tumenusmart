import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera, Cifra, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularReporteMozos } from "@/lib/reporte-mozos";
import { FiltroFechaReporte } from "@/components/FiltroFechaReporte";
import { SelectorMozo } from "./SelectorMozo";

export const dynamic = "force-dynamic";

// Los tres períodos del protocolo de reportes: hoy, este mes y un rango de fechas (el rango lo trae el propio filtro, aparte de los atajos).
const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "mes", label: "Este mes" },
];

/**
 * Reporte de mozos: lo que vendió cada uno, con su ticket promedio, los descuentos que se le dieron a sus cuentas y lo que se
 * canceló. Es el control del dueño sobre el salón (ver src/lib/reporte-mozos.ts para a quién se le atribuye cada cosa).
 */
export default async function ReporteMozosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string; mozo?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta, mozo } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  let reporte = await calcularReporteMozos(storeId, rango, mozo || null);
  // El mozo elegido en el filtro. Si el enlace trae uno que ya no existe, se muestra el reporte de todos.
  const mozoElegido = reporte.mozosDisponibles.find((m) => m.id === mozo) ?? null;
  if (mozo && !mozoElegido) reporte = await calcularReporteMozos(storeId, rango, null);
  const t = reporte.totales;
  const conComisiones = t.comision > 0 || t.comisionPagada > 0 || t.comisionPendiente > 0;
  const hayDatos = reporte.filas.length > 0 && (t.cuentasAbiertas > 0 || t.cuentasCobradas > 0 || t.productosEnviados > 0);

  function querystringActual() {
    const params = new URLSearchParams();
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    if (mozoElegido) params.set("mozo", mozoElegido.id);
    return params.toString();
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Mozos"
        bajada={`${
          mozoElegido ? `Solo ${mozoElegido.nombre}: ` : "Elegí un mozo para ver solo el suyo. "
        }Lo que vendió, su ticket promedio, los descuentos que se le dieron a sus cuentas, lo que se canceló y su comisión: ganada, pagada y lo que se le debe.`}
        acciones={
          <>
            <a href={`/admin/reporte-mozos/exportar?${querystringActual()}`} className={clasesBoton("navegar", "sm")}>
              Descargar Excel
            </a>
            <a
              href={`/admin/reporte-mozos/imprimir?${querystringActual()}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </>
        }
      />

      {/* Un mozo o todos: el reporte se recalcula con el mismo período que ya estaba elegido. */}
      <SelectorMozo
        accion="/admin/reporte-mozos"
        mozos={reporte.mozosDisponibles}
        elegido={mozoElegido?.id ?? ""}
        conservar={{
          fecha: fechaActiva,
          ...(fechaActiva === "rango" && desde ? { desde } : {}),
          ...(fechaActiva === "rango" && hasta ? { hasta } : {}),
        }}
      />

      {/* El filtro de fechas: se adapta al celular (atajos que se deslizan, rango en dos campos lado a lado). */}
      <FiltroFechaReporte
        accion="/admin/reporte-mozos"
        opciones={FILTROS_FECHA}
        activa={fechaActiva}
        desde={desde}
        hasta={hasta}
        conservar={{ mozo: mozoElegido?.id }}
      />

      {!hayDatos ? (
        <Vacio
          titulo={mozoElegido ? `${mozoElegido.nombre} no tuvo movimiento en este período` : "Todavía no hay movimiento de mozos en este período"}
          detalle="Cuando los mozos abran mesas y se cobren sus cuentas desde Servicio comedor, acá se ve cuánto vendió cada uno."
        />
      ) : (
        <>
          <div className={`grid grid-cols-2 gap-3 ${conComisiones ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
            <Cifra valor={formatearGuarani(Math.round(t.ventas))} rotulo="Vendido" detalle={`${t.cuentasCobradas} ${t.cuentasCobradas === 1 ? "cuenta cobrada" : "cuentas cobradas"}`} />
            {conComisiones && (
              <Cifra
                valor={formatearGuarani(Math.round(t.comisionPendiente))}
                rotulo="Comisión que se les debe"
                detalle={`ganada ${formatearGuarani(Math.round(t.comision))} · pagada ${formatearGuarani(Math.round(t.comisionPagada))} en el período`}
              />
            )}
            <Cifra valor={formatearGuarani(Math.round(t.ticketPromedio))} rotulo="Ticket promedio" detalle="por cuenta cobrada" />
            <Cifra
              valor={formatearGuarani(Math.round(t.descuentos))}
              rotulo="Descuentos"
              detalle={`${t.cuentasConDescuento} ${t.cuentasConDescuento === 1 ? "cuenta" : "cuentas"} con descuento`}
            />
            <Cifra
              valor={t.productosCancelados}
              rotulo="Productos cancelados"
              detalle={`${formatearGuarani(Math.round(t.montoCancelado))} · ${t.cuentasCanceladas} ${
                t.cuentasCanceladas === 1 ? "cuenta cancelada" : "cuentas canceladas"
              }`}
            />
          </div>

          <Tabla className="min-w-0">
            <thead>
              <tr>
                <Th>Mozo</Th>
                <Th className="text-right">Cuentas abiertas</Th>
                <Th className="text-right">Cobradas</Th>
                <Th className="text-right">Vendido</Th>
                <Th className="text-right">Comisión ganada</Th>
                <Th className="text-right">Comisión pagada</Th>
                <Th className="text-right">Comisión pendiente</Th>
                <Th className="text-right">Ticket promedio</Th>
                <Th className="text-right">Por persona</Th>
                <Th className="text-right">Descuentos</Th>
                <Th className="text-right">Productos enviados</Th>
                <Th className="text-right">Productos cancelados</Th>
                <Th className="text-right">Cuentas canceladas</Th>
                <Th className="text-right">Cobros cancelados</Th>
              </tr>
            </thead>
            <tbody>
              {reporte.filas.map((f) => (
                <Tr key={f.mozoId}>
                  <Td className="font-medium text-tinta">
                    {f.nombre}
                    {!f.activo && <span className="ml-1.5 text-[0.72rem] font-normal text-tinta-suave">(desactivado)</span>}
                  </Td>
                  <Td className="cifra text-right">{f.cuentasAbiertas}</Td>
                  <Td className="cifra text-right">{f.cuentasCobradas}</Td>
                  <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(Math.round(f.ventas))}</Td>
                  <Td className="cifra text-right">{f.comision > 0 ? formatearGuarani(Math.round(f.comision)) : "—"}</Td>
                  <Td className="cifra text-right">{f.comisionPagada > 0 ? formatearGuarani(Math.round(f.comisionPagada)) : "—"}</Td>
                  <Td className={`cifra text-right ${f.comisionPendiente > 0 ? "font-semibold text-tinta" : ""}`}>
                    {f.comisionPendiente > 0 ? formatearGuarani(Math.round(f.comisionPendiente)) : "—"}
                  </Td>
                  <Td className="cifra text-right">{formatearGuarani(Math.round(f.ticketPromedio))}</Td>
                  <Td className="cifra text-right">
                    {f.ventaPorPersona != null ? formatearGuarani(Math.round(f.ventaPorPersona)) : "—"}
                  </Td>
                  <Td className="cifra text-right">
                    {f.descuentos > 0 ? formatearGuarani(Math.round(f.descuentos)) : "—"}
                  </Td>
                  <Td className="cifra text-right">{f.productosEnviados}</Td>
                  <Td className={`cifra text-right ${f.productosCancelados > 0 ? "font-medium text-peligro" : ""}`}>
                    {f.productosCancelados > 0
                      ? `${f.productosCancelados} · ${formatearGuarani(Math.round(f.montoCancelado))}`
                      : "—"}
                  </Td>
                  <Td className={`cifra text-right ${f.cuentasCanceladas > 0 ? "font-medium text-peligro" : ""}`}>
                    {f.cuentasCanceladas > 0 ? f.cuentasCanceladas : "—"}
                  </Td>
                  <Td className={`cifra text-right ${f.cobrosCancelados > 0 ? "font-medium text-peligro" : ""}`}>
                    {f.cobrosCancelados > 0 ? f.cobrosCancelados : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-papel-suave">
                <Td className="font-semibold text-tinta">Total</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.cuentasAbiertas}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.cuentasCobradas}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(Math.round(t.ventas))}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.comision > 0 ? formatearGuarani(Math.round(t.comision)) : "—"}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.comisionPagada > 0 ? formatearGuarani(Math.round(t.comisionPagada)) : "—"}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.comisionPendiente > 0 ? formatearGuarani(Math.round(t.comisionPendiente)) : "—"}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(Math.round(t.ticketPromedio))}</Td>
                <Td className="cifra text-right font-semibold text-tinta">
                  {t.ventaPorPersona != null ? formatearGuarani(Math.round(t.ventaPorPersona)) : "—"}
                </Td>
                <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(Math.round(t.descuentos))}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.productosEnviados}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.productosCancelados}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.cuentasCanceladas}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{t.cobrosCancelados}</Td>
              </tr>
            </tfoot>
          </Tabla>

          <p className="text-[0.78rem] leading-snug text-tinta-suave">
            Lo vendido es lo cobrado (ya con el descuento) de las cuentas del mozo, por el día en que se cobraron. Los productos
            enviados y cancelados son los que el mozo cargó desde su celular; lo que carga la caja desde el panel no se le
            cuenta a ningún mozo. “Cuentas canceladas” son las que se anularon antes de cobrarse; “Cobros cancelados”, ventas
            ya cobradas que después se anularon. La comisión ganada es la de las cuentas cobradas en el período; la pagada, lo que se
            le entregó desde la caja en esas fechas (Servicio comedor → Comisiones); la pendiente es lo que se le debe hoy, sin
            importar el período.
          </p>
        </>
      )}
    </div>
  );
}
