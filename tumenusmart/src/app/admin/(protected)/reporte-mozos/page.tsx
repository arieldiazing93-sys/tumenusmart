import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera, Cifra, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularReporteMozos } from "@/lib/reporte-mozos";
import { FiltroFechaReporte } from "@/components/FiltroFechaReporte";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "mes", label: "Este mes" },
  { value: "mesAnterior", label: "Mes anterior" },
];

/**
 * Reporte de mozos: lo que vendió cada uno, con su ticket promedio, los descuentos que se le dieron a sus cuentas y lo que se
 * canceló. Es el control del dueño sobre el salón (ver src/lib/reporte-mozos.ts para a quién se le atribuye cada cosa).
 */
export default async function ReporteMozosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const reporte = await calcularReporteMozos(await idLocalActual(), rango);
  const t = reporte.totales;
  const hayDatos = reporte.filas.length > 0 && (t.cuentasAbiertas > 0 || t.cuentasCobradas > 0 || t.productosEnviados > 0);

  function querystringActual() {
    const params = new URLSearchParams();
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    return params.toString();
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Mozos"
        bajada="Lo que vendió cada mozo, su ticket promedio, los descuentos que se le dieron a sus cuentas y lo que se canceló."
        acciones={
          <a href={`/admin/reporte-mozos/exportar?${querystringActual()}`} className={clasesBoton("principal", "sm")}>
            Descargar Excel
          </a>
        }
      />

      {/* El filtro de fechas: se adapta al celular (atajos que se deslizan, rango en dos campos lado a lado). */}
      <FiltroFechaReporte accion="/admin/reporte-mozos" opciones={FILTROS_FECHA} activa={fechaActiva} desde={desde} hasta={hasta} />

      {!hayDatos ? (
        <Vacio
          titulo="Todavía no hay movimiento de mozos en este período"
          detalle="Cuando los mozos abran mesas y se cobren sus cuentas desde Servicio comedor, acá se ve cuánto vendió cada uno."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra valor={formatearGuarani(Math.round(t.ventas))} rotulo="Vendido" detalle={`${t.cuentasCobradas} cuentas cobradas`} />
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
            ya cobradas que después se anularon.
          </p>
        </>
      )}
    </div>
  );
}
