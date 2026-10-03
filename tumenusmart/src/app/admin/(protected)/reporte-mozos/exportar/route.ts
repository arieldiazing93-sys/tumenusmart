import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { calcularReporteMozos } from "@/lib/reporte-mozos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Una ruta de API no pasa por el layout del panel: valida la sesión Y el permiso por su cuenta, antes de tocar la base.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "estadisticas.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "mes";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([localActual(), calcularReporteMozos(storeId, rango)]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Mozos");
  hoja.columns = [
    { width: 26 },
    { width: 16 },
    { width: 12 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 20 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
  ];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Mozos (Servicio comedor)"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  filaTitulo(
    hoja,
    [
      "Mozo",
      "Cuentas abiertas",
      "Cobradas",
      "Vendido (Gs.)",
      "Ticket promedio (Gs.)",
      "Por persona (Gs.)",
      "Descuentos (Gs.)",
      "Cuentas con descuento",
      "Productos enviados",
      "Productos cancelados",
      "Monto cancelado (Gs.)",
      "Cuentas canceladas",
    ],
    12
  );
  for (const f of reporte.filas) {
    hoja.addRow([
      f.nombre + (f.activo ? "" : " (desactivado)"),
      f.cuentasAbiertas,
      f.cuentasCobradas,
      Math.round(f.ventas),
      Math.round(f.ticketPromedio),
      f.ventaPorPersona != null ? Math.round(f.ventaPorPersona) : "",
      Math.round(f.descuentos),
      f.cuentasConDescuento,
      f.productosEnviados,
      f.productosCancelados,
      Math.round(f.montoCancelado),
      f.cuentasCanceladas,
    ]);
  }

  const t = reporte.totales;
  hoja.addRow([]);
  filaTitulo(
    hoja,
    [
      "TOTAL",
      t.cuentasAbiertas,
      t.cuentasCobradas,
      Math.round(t.ventas),
      Math.round(t.ticketPromedio),
      t.ventaPorPersona != null ? Math.round(t.ventaPorPersona) : "",
      Math.round(t.descuentos),
      t.cuentasConDescuento,
      t.productosEnviados,
      t.productosCancelados,
      Math.round(t.montoCancelado),
      t.cuentasCanceladas,
    ],
    12
  );
  hoja.addRow([]);
  hoja.addRow(["Cobros cancelados (ventas ya cobradas que después se anularon)", t.cobrosCancelados]);

  return respuestaXlsx(libro, `mozos_${fecha}.xlsx`);
}
