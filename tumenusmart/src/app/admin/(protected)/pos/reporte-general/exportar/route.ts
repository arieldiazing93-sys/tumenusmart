import { NextRequest, NextResponse } from "next/server";
import { negarSiNoPuede } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { formatearNumero } from "@/lib/format";
import { COLUMNAS_CANAL, COLUMNAS_FORMA_PAGO, calcularReporteGeneralPos } from "@/lib/reporte-general-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión
  // por su cuenta.
  const negado = await negarSiNoPuede("pos.verHistorico");
  if (negado) return negado;

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
  const opcionesFechaHora: Intl.DateTimeFormatOptions = {
    ...opcionesFecha,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Reporte general");
  // Las columnas: N°, una de identificación por cada forma de vender, la fecha, el importe y una por cada forma de pago.
  const columnasAntesDelImporte = 2 + COLUMNAS_CANAL.length;
  const columnaImporte = columnasAntesDelImporte + 1;
  hoja.columns = [
    { width: 8 },
    ...COLUMNAS_CANAL.map(() => ({ width: 14 })),
    { width: 18 },
    { width: 16 },
    ...COLUMNAS_FORMA_PAGO.map(() => ({ width: 18 })),
  ];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Reporte general de cuentas (mostrador, comedor, delivery y reservas de turnos)"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  const encabezados = [
    "N°",
    ...COLUMNAS_CANAL.map((c) => `ID ${c.etiqueta}`),
    "Fecha",
    "Importe (Gs.)",
    ...COLUMNAS_FORMA_PAGO.map((f) => `${f.etiqueta} (Gs.)`),
  ];
  filaTitulo(hoja, encabezados, encabezados.length);

  for (const f of reporte.filas) {
    const fila = hoja.addRow([
      f.n,
      ...COLUMNAS_CANAL.map((c) => (f.canal === c.valor ? formatearNumero(f.idVenta) : "")),
      f.fecha.toLocaleString("es-PY", opcionesFechaHora),
      Math.round(f.importe),
      ...COLUMNAS_FORMA_PAGO.map((fp) => (f.formaPago === fp.valor ? Math.round(f.importe) : "")),
    ]);
    fila.getCell(columnaImporte).numFmt = "#,##0";
    for (let i = 0; i < COLUMNAS_FORMA_PAGO.length; i++) fila.getCell(columnaImporte + 1 + i).numFmt = "#,##0";
  }

  hoja.addRow([]);
  const filaTotal = filaTitulo(
    hoja,
    [
      ...Array.from({ length: columnasAntesDelImporte - 1 }, () => ""),
      `CUENTAS (${reporte.filas.length})`,
      Math.round(reporte.totalImporte),
      ...COLUMNAS_FORMA_PAGO.map((fp) => Math.round(reporte.totalPorForma[fp.valor])),
    ],
    columnaImporte + COLUMNAS_FORMA_PAGO.length
  );
  filaTotal.getCell(columnaImporte).numFmt = "#,##0";
  for (let i = 0; i < COLUMNAS_FORMA_PAGO.length; i++) filaTotal.getCell(columnaImporte + 1 + i).numFmt = "#,##0";

  // Cuánto se cobró por cada forma de vender.
  hoja.addRow([]);
  for (const c of COLUMNAS_CANAL) {
    const fila = hoja.addRow([`Total ${c.etiqueta}`, Math.round(reporte.totalPorCanal[c.valor])]);
    fila.getCell(2).numFmt = "#,##0";
  }

  if (reporte.filas.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No se registraron cuentas en este período."]);
  }

  return respuestaXlsx(libro, `reporte_general_pos_${fecha}.xlsx`);
}
