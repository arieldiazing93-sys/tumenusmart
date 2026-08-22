import { NextRequest, NextResponse } from "next/server";
import { calcularRangoFecha, claveDia } from "@/lib/rango-fecha";
import { calcularEstadisticas } from "@/lib/estadisticas";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

function csvEscape(valor: string | number): string {
  const texto = String(valor);
  if (/[",\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function filaCsv(valores: (string | number)[]): string {
  return valores.map(csvEscape).join(",");
}

// Genera un CSV (se abre directo en Excel, Google Sheets, Numbers, etc.)
// con el mismo período y los mismos números que se ven en el panel de
// Estadísticas — no requiere ninguna librería nueva. Los indicadores van
// como columnas (una fila de encabezados + una fila de valores), que es
// como se lee mejor una tabla en una planilla.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "30dias";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const rango =
    calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("30dias", undefined, undefined)!;

  const stats = await calcularEstadisticas(rango);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const filas: string[] = [];

  filas.push(
    filaCsv([
      "Negocio",
      "Período",
      "Ingresos (Gs.)",
      "Pedidos totales",
      "Pedidos válidos",
      "Ticket promedio (Gs.)",
      "Clientes únicos",
      "Unidades vendidas",
      "Productos por pedido",
      "Clientes nuevos",
      "Cancelados",
    ])
  );
  filas.push(
    filaCsv([
      stats.store?.nombre ?? "",
      periodo,
      Math.round(stats.ingresos),
      stats.pedidosTotales,
      stats.pedidosValidos,
      Math.round(stats.ticketPromedio),
      stats.clientesUnicos,
      stats.unidadesVendidas,
      stats.productosPorPedido.toFixed(2),
      stats.clientesNuevos,
      stats.cancelados,
    ])
  );

  filas.push("");
  filas.push(filaCsv(["Fecha", "Ventas (Gs.)"]));
  for (const d of stats.dias) {
    const clave = claveDia(d);
    filas.push(filaCsv([clave, Math.round(stats.totalesPorDia.get(clave) ?? 0)]));
  }

  // BOM al inicio para que Excel detecte UTF-8 y no rompa los acentos/ñ.
  const csv = "﻿" + filas.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="estadisticas_${fecha}.csv"`,
    },
  });
}
