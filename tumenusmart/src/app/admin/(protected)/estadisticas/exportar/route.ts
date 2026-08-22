import { NextRequest, NextResponse } from "next/server";
import { calcularRangoFecha, claveDia } from "@/lib/rango-fecha";
import { calcularEstadisticas } from "@/lib/estadisticas";

export const dynamic = "force-dynamic";

// Genera un CSV (se abre directo en Excel, Google Sheets, Numbers, etc.)
// con el mismo período y los mismos números que se ven en el panel de
// Estadísticas — no requiere ninguna librería nueva.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "30dias";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const rango =
    calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("30dias", undefined, undefined)!;

  const stats = await calcularEstadisticas(rango);

  const filas: string[] = [];
  filas.push(`Reporte de,${(stats.store?.nombre ?? "").replace(/,/g, " ")}`);
  filas.push("");
  filas.push("Indicador,Valor");
  filas.push(`Ingresos (Gs.),${Math.round(stats.ingresos)}`);
  filas.push(`Pedidos totales,${stats.pedidosTotales}`);
  filas.push(`Pedidos válidos,${stats.pedidosValidos}`);
  filas.push(`Ticket promedio (Gs.),${Math.round(stats.ticketPromedio)}`);
  filas.push(`Clientes únicos,${stats.clientesUnicos}`);
  filas.push(`Unidades vendidas,${stats.unidadesVendidas}`);
  filas.push(`Productos por pedido,${stats.productosPorPedido.toFixed(2)}`);
  filas.push(`Clientes nuevos,${stats.clientesNuevos}`);
  filas.push(`Cancelados,${stats.cancelados}`);
  filas.push("");
  filas.push("Fecha,Ventas (Gs.)");
  for (const d of stats.dias) {
    const clave = claveDia(d);
    filas.push(`${clave},${Math.round(stats.totalesPorDia.get(clave) ?? 0)}`);
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
