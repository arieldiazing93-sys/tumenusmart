import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { calcularReportePromociones } from "@/lib/reporte-promociones-servidor";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

const ESTADO = { activa: "Activa", inactiva: "Inactiva", eliminada: "Eliminada" } as const;

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
  const [local, reporte] = await Promise.all([localActual(), calcularReportePromociones(storeId, rango)]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Promociones");
  hoja.columns = [{ width: 30 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Promociones"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  const t = reporte.totales;
  const costo = (c: number, incompleto: boolean) => (incompleto ? `${c} (parcial)` : c);

  // ---- por promoción
  filaTitulo(hoja, ["Promoción", "Regla", "Estado", "Ventas", "Unidades", "Regaladas", "Vendido (Gs.)", "Descontado (Gs.)", "Regalado (Gs.)", "Costo regalado (Gs.)"], 10);
  for (const f of reporte.filas) {
    hoja.addRow([f.nombre, f.etiqueta ?? "", ESTADO[f.estado], f.ventas, f.unidades, f.regaladas, f.cobrado, f.descontado, f.regalado, costo(f.costoRegalado, f.costoIncompleto)]);
  }
  filaTitulo(hoja, ["TOTAL", "", "", t.ventas, t.unidades, t.regaladas, t.cobrado, t.descontado, t.regalado, costo(t.costoRegalado, t.costoIncompleto)], 10);
  hoja.addRow([]);

  // ---- por canal
  filaTitulo(hoja, ["Canal", "", "", "Ventas", "Unidades", "Regaladas", "Vendido (Gs.)", "Descontado (Gs.)", "Regalado (Gs.)", "Dado a los clientes (Gs.)"], 10);
  for (const c of reporte.canales) {
    hoja.addRow([c.nombre, "", "", c.ventas, c.unidades, c.regaladas, c.cobrado, c.descontado, c.regalado, c.ahorro]);
  }
  hoja.addRow([]);

  // ---- por producto (en el Excel van todos)
  filaTitulo(hoja, ["Producto", "Promoción", "", "Ventas", "Unidades", "Regaladas", "Vendido (Gs.)", "Descontado (Gs.)", "Regalado (Gs.)", "Dado a los clientes (Gs.)"], 10);
  for (const p of reporte.productos) {
    hoja.addRow([p.producto, p.promocion, "", p.ventas, p.unidades, p.regaladas, p.cobrado, p.descontado, p.regalado, p.ahorro]);
  }
  hoja.addRow([]);
  hoja.addRow(["Vendido = lo cobrado de las líneas con promoción, antes del descuento general de la cuenta. Las ventas anuladas no cuentan."]);
  if (reporte.lineasSinPrecioAnterior > 0) {
    hoja.addRow([`Hay ${reporte.lineasSinPrecioAnterior} líneas sin el precio de antes (cargadas antes de este reporte): su ahorro no se cuenta.`]);
  }

  return respuestaXlsx(libro, `promociones_${fecha}.xlsx`);
}
