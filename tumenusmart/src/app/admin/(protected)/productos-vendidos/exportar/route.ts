import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { calcularReporteProductosVendidos } from "@/lib/reporte-productos";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

function csvEscape(valor: string | number): string {
  const texto = String(valor);
  if (/[";\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

// Separador ";" y no ",": Excel en español usa la coma como separador
// DECIMAL, así que un CSV separado por comas le llega como una sola columna
// de texto en vez de una planilla — hay que abrir "Datos > Desde texto/CSV"
// a mano para arreglarlo. Con ";" lo abre bien con solo hacer doble clic.
function filaCsv(valores: (string | number)[]): string {
  return valores.map(csvEscape).join(";");
}

// Genera un CSV (se abre directo en Excel, Google Sheets, Numbers, etc.), sin
// depender de ninguna librería nueva para armar un .xlsx real.
//
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

  const filas: string[] = [];

  filas.push(filaCsv(["Negocio", "Período"]));
  filas.push(filaCsv([local.nombre, periodo]));
  filas.push("");

  filas.push(
    filaCsv([
      "Categoría",
      "Producto",
      "Cantidad vendida",
      "Precio de venta (Gs.)",
      "Costo (Gs.)",
      "Margen (%)",
      "Ganancia (Gs.)",
      // Estas tres van aparte del precio/costo/ganancia del producto: son
      // lo que aportaron los agregados (papas, extras...) vendidos junto
      // con él, no el producto en sí — sumarlas al precio de venta de
      // arriba daría el mismo número mezclado que este reporte dejó de
      // mostrar.
      "Venta agregados (Gs.)",
      "Costo agregados (Gs.)",
      "Ganancia agregados (Gs.)",
    ])
  );

  for (const cat of reporte.categorias) {
    for (const f of cat.filas) {
      filas.push(
        filaCsv([
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
        ])
      );
    }
  }

  // Mismas 10 columnas que la tabla de arriba, no una estructura aparte —
  // así la fila de totales se lee de un vistazo, alineada con los encabezados.
  filas.push(
    filaCsv([
      "",
      "TOTAL GENERAL",
      reporte.totalGeneral.cantidad,
      Math.round(reporte.totalGeneral.venta),
      reporte.totalGeneral.costo != null ? Math.round(reporte.totalGeneral.costo) : "",
      "",
      reporte.totalGeneral.ganancia != null ? Math.round(reporte.totalGeneral.ganancia) : "",
      "",
      "",
      "",
    ])
  );

  if (reporte.totalGeneral.costoIncompleto) {
    filas.push("");
    filas.push(
      filaCsv([
        "Hay productos vendidos sin costo cargado — los totales de costo y ganancia no incluyen esas filas.",
      ])
    );
  }

  // BOM al inicio para que Excel detecte UTF-8 y no rompa los acentos/ñ.
  const csv = "﻿" + filas.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rentabilidad_${fecha}.csv"`,
    },
  });
}
