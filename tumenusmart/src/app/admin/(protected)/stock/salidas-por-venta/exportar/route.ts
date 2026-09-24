import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { rangoDeDias, diaEnTexto } from "@/lib/rango-dias";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { LIMITE_REPORTE, calcularSalidasPorVenta } from "@/lib/reporte-salidas-venta";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

const fechaTexto = (fecha: Date) =>
  fecha.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO });
const horaTexto = (fecha: Date) =>
  fecha.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: ZONA_NEGOCIO });

/**
 * Salidas por venta en Excel: una fila por cada insumo que descontó cada
 * producto vendido, con fecha y hora en columnas separadas. Cada dato va en su
 * propia columna (y se repite en todas las filas de una misma venta) para poder
 * ordenar, filtrar o armar una tabla dinámica.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "stock.ver")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const rango = rangoDeDias(searchParams.get("desde"), searchParams.get("hasta"));
  const tipoPedido = searchParams.get("tipo");
  const tipo = tipoPedido === "venta" || tipoPedido === "cancelacion" ? tipoPedido : null;
  const almacen = searchParams.get("almacen") || null;
  const insumo = searchParams.get("insumo")?.trim() || null;
  const producto = searchParams.get("producto")?.trim() || null;

  const storeId = await idLocalActual();
  const [local, reporte, almacenElegido] = await Promise.all([
    localActual(),
    calcularSalidasPorVenta(storeId, rango, { tipo, almacen, insumo, producto }, LIMITE_REPORTE),
    almacen
      ? prismaDelLocal(storeId).almacen.findUnique({ where: { id: almacen }, select: { nombre: true } })
      : Promise.resolve(null),
  ]);

  const periodo = `${diaEnTexto(rango.desde)} - ${diaEnTexto(rango.hasta)}`;
  const { libro, hoja } = nuevoLibro("Salidas por venta");
  hoja.columns = [
    { width: 12 },
    { width: 10 },
    { width: 14 },
    { width: 24 },
    { width: 50 },
    { width: 28 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
  ];
  // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
  // envios/exportar/route.ts.
  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Salidas por venta — qué descontó cada venta"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  filaTitulo(hoja, ["Almacén", almacenElegido?.nombre ?? "Todos"], 2);
  filaTitulo(hoja, ["Tipo", tipo === "venta" ? "Solo salidas por venta" : tipo === "cancelacion" ? "Solo cancelaciones" : "Salidas por venta y cancelaciones"], 2);
  if (producto) filaTitulo(hoja, ["Producto vendido", producto], 2);
  if (insumo) filaTitulo(hoja, ["Insumo", insumo], 2);
  hoja.addRow([]);

  filaTitulo(hoja, ["Fecha", "Hora", "Tipo", "Venta", "Qué se vendió", "Insumo", "Unidad", "Cantidad", "Almacén"], 9);
  for (const f of reporte.filas) {
    hoja.addRow([
      fechaTexto(f.fecha),
      horaTexto(f.fecha),
      f.tipo === "cancelacion" ? "Cancelación (entrada)" : "Salida por venta",
      f.venta,
      f.producto,
      f.insumo,
      f.unidad,
      f.cantidad,
      f.almacen,
    ]);
  }
  hoja.addRow([]);
  hoja.addRow([
    `${reporte.filas.length} movimientos de ${reporte.ventas} ventas.${
      reporte.recortado ? ` Se incluyen los ${LIMITE_REPORTE} más recientes: acotá las fechas para ver los anteriores.` : ""
    } La cantidad es negativa cuando salió por una venta y positiva cuando volvió por una cancelación. Las ventas anteriores a este reporte figuran como "Toda la venta": no se guardó qué producto descontó cada insumo.`,
  ]);

  return respuestaXlsx(libro, `salidas_por_venta_${rango.desde}_a_${rango.hasta}.xlsx`);
}
