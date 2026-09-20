import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { formatearNumero } from "@/lib/format";
import { COLUMNAS_FORMA_PAGO, calcularReporteGeneralPos } from "@/lib/reporte-general-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión
  // por su cuenta.
  if (!(await haySesionAdminValida())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "hoy";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("hoy", undefined, undefined)!;

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
  const opcionesFechaHora: Intl.DateTimeFormatOptions = { ...opcionesFecha, hour: "2-digit", minute: "2-digit" };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Reporte general");
  hoja.columns = [
    { width: 8 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 16 },
    ...COLUMNAS_FORMA_PAGO.map(() => ({ width: 18 })),
  ];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Reporte general de cuentas (mostrador + POS + delivery entregado)"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  const encabezados = [
    "N°",
    "ID Pedido",
    "ID Venta POS",
    "Fecha",
    "Importe (Gs.)",
    ...COLUMNAS_FORMA_PAGO.map((f) => `${f.etiqueta} (Gs.)`),
  ];
  filaTitulo(hoja, encabezados, encabezados.length);

  for (const f of reporte.filas) {
    const fila = hoja.addRow([
      f.n,
      f.idPedido != null ? formatearNumero(f.idPedido) : "",
      f.idVenta != null ? formatearNumero(f.idVenta) : "",
      f.fecha.toLocaleString("es-PY", opcionesFechaHora),
      Math.round(f.importe),
      ...COLUMNAS_FORMA_PAGO.map((fp) => (f.formaPago === fp.valor ? Math.round(f.importe) : "")),
    ]);
    fila.getCell(5).numFmt = "#,##0";
    for (let i = 0; i < COLUMNAS_FORMA_PAGO.length; i++) fila.getCell(6 + i).numFmt = "#,##0";
  }

  hoja.addRow([]);
  const filaTotal = filaTitulo(
    hoja,
    [
      "",
      "",
      "",
      `CUENTAS (${reporte.filas.length})`,
      Math.round(reporte.totalImporte),
      ...COLUMNAS_FORMA_PAGO.map((fp) => Math.round(reporte.totalPorForma[fp.valor])),
    ],
    5 + COLUMNAS_FORMA_PAGO.length
  );
  filaTotal.getCell(5).numFmt = "#,##0";
  for (let i = 0; i < COLUMNAS_FORMA_PAGO.length; i++) filaTotal.getCell(6 + i).numFmt = "#,##0";

  if (reporte.filas.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No se registraron cuentas en este período."]);
  }

  return respuestaXlsx(libro, `reporte_general_pos_${fecha}.xlsx`);
}
