import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
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
  const formaPago = searchParams.get("formaPago") ?? undefined;

  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("hoy", undefined, undefined)!;

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const [local, ventas] = await Promise.all([
    localActual(),
    db.ventaPos.findMany({
      where: { creadoEn: { gte: rango.gte, lt: rango.lt }, formaPago: formaPago || undefined },
      orderBy: { creadoEn: "asc" },
      select: { numero: true, total: true, formaPago: true, registradoPor: true, creadoEn: true },
    }),
  ]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Cuentas POS");
  hoja.columns = [{ width: 12 }, { width: 14 }, { width: 12 }, { width: 20 }, { width: 20 }, { width: 16 }];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Cuentas del mostrador (POS)"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  filaTitulo(hoja, ["Cuenta", "Fecha", "Hora", "Forma de pago", "Cajero", "Total (Gs.)"], 6);
  let total = 0;
  for (const v of ventas) {
    total += Number(v.total);
    const fila = hoja.addRow([
      v.numero,
      v.creadoEn.toLocaleDateString("es-PY", opcionesFecha),
      v.creadoEn.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", timeZone: ZONA_NEGOCIO }),
      etiquetaFormaPagoPos(v.formaPago),
      v.registradoPor,
      Math.round(Number(v.total)),
    ]);
    fila.getCell(6).numFmt = "#,##0";
  }

  hoja.addRow([]);
  const filaTotal = filaTitulo(hoja, ["", "", "", "", "TOTAL GENERAL (Gs.)", Math.round(total)], 6);
  filaTotal.getCell(6).numFmt = "#,##0";

  if (ventas.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No se registraron cuentas en este período."]);
  }

  return respuestaXlsx(libro, `cuentas_pos_${fecha}.xlsx`);
}
