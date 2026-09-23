import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { calcularReporteProductosVendidos, type FilaProductoReporte } from "@/lib/reporte-productos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

/** "Borde relleno x1: Gs. 10.000 (costo Gs. 3.000); Extra queso x2: ..." —
 * va todo en una sola columna. */
function textoDetalleAgregados(detalle: FilaProductoReporte["agregadosDetalle"]): string {
  return detalle
    .map((d) => {
      const costo = d.costo != null ? `costo Gs. ${Math.round(d.costo)}` : "costo desconocido";
      return `${d.texto} x${d.cantidad}: Gs. ${Math.round(d.venta)} (${costo})`;
    })
    .join("; ");
}

// A diferencia del reporte en pantalla, acá la categoría va como una columna
// más y no como un título de sección — en una fila por producto. Es la forma
// en que sirve de verdad en una planilla: se puede ordenar, filtrar o armar
// una tabla dinámica por categoría sin tener que primero deshacer la
// agrupación a mano.
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión
  // por su cuenta. Sin esto, cualquiera con una cookie inventada del nombre
  // correcto se bajaba el costo y la ganancia de cada producto.
  if (!(await haySesionAdminValida())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "mes";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteProductosVendidos(storeId, rango),
  ]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Rentabilidad");
  hoja.columns = [
    { width: 18 },
    { width: 26 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 50 },
  ];

  // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
  // envios/exportar/route.ts.
  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Rentabilidad"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  filaTitulo(
    hoja,
    [
      "Criterio",
      "Venta, costo, ganancia y margen sin IVA. El costo sale de la receta de cada producto (última compra de cada insumo) y queda guardado en cada venta; en las ventas anteriores a que se guardara se usa el costo de hoy. Mitad y mitad: la mitad del costo de cada sabor.",
    ],
    2
  );
  hoja.addRow([]);

  filaTitulo(
    hoja,
    [
      "Categoría",
      "Producto",
      "Cantidad vendida",
      "Precio de venta sin IVA (Gs.)",
      "Costo (Gs.)",
      "Margen (%)",
      "Ganancia (Gs.)",
      // Estas tres van aparte del precio/costo/ganancia del producto: son
      // lo que aportaron los agregados (papas, extras...) vendidos junto
      // con él, no el producto en sí — sumarlas al precio de venta de
      // arriba daría el mismo número mezclado que este reporte dejó de
      // mostrar.
      "Venta agregados sin IVA (Gs.)",
      "Costo agregados (Gs.)",
      "Ganancia agregados (Gs.)",
      // Cuál fue cada agregado, no solo el total — el mismo texto que ve
      // el cliente en su comprobante.
      "Detalle de agregados",
    ],
    11
  );

  for (const cat of reporte.categorias) {
    for (const f of cat.filas) {
      hoja.addRow([
        cat.categoriaNombre,
        f.nombre,
        f.cantidad,
        Math.round(f.precioVentaUnitario),
        f.costoUnitario != null ? Math.round(f.costoUnitario) : "",
        f.margen != null ? f.margen.toFixed(1) : "",
        f.ganancia != null ? Math.round(f.ganancia) : "",
        f.ventaAgregados > 0 ? Math.round(f.ventaAgregados) : "",
        f.costoAgregados != null ? Math.round(f.costoAgregados) : "",
        f.gananciaAgregados != null ? Math.round(f.gananciaAgregados) : "",
        textoDetalleAgregados(f.agregadosDetalle),
      ]);
    }
  }

  // Mismas 11 columnas que la tabla de arriba, no una estructura aparte —
  // así la fila de totales se lee de un vistazo, alineada con los encabezados.
  filaTitulo(
    hoja,
    [
      "",
      "TOTAL GENERAL (sin IVA)",
      reporte.totalGeneral.cantidad,
      Math.round(reporte.totalGeneral.venta),
      reporte.totalGeneral.costo != null ? Math.round(reporte.totalGeneral.costo) : "",
      "",
      reporte.totalGeneral.ganancia != null ? Math.round(reporte.totalGeneral.ganancia) : "",
      "",
      "",
      "",
      "",
    ],
    11
  );

  // De la plata cobrada a la venta sin IVA: la primera cifra es la de
  // Estadísticas, la segunda es la que usa este reporte para la ganancia.
  hoja.addRow([]);
  hoja.addRow(["", "Cobrado (con IVA — cifra de Estadísticas)", "", Math.round(reporte.totalGeneral.ventaConIva)]);
  hoja.addRow(["", "IVA incluido en lo cobrado", "", Math.round(reporte.totalGeneral.iva)]);

  if (reporte.totalGeneral.costoIncompleto) {
    const cobertura =
      reporte.totalGeneral.venta > 0
        ? Math.round((reporte.totalGeneral.ventaConCosto / reporte.totalGeneral.venta) * 100)
        : 0;
    hoja.addRow([]);
    hoja.addRow([
      `Hay productos vendidos sin costo (sin receta, o con algún insumo sin compra registrada): el costo y la ganancia del total no incluyen esas filas y cubren solo el ${cobertura}% de la venta sin IVA.`,
    ]);
  }

  return respuestaXlsx(libro, `rentabilidad_${fecha}.xlsx`);
}
