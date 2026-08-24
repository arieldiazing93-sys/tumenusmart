import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { calcularRangoFecha, claveDia } from "@/lib/rango-fecha";
import {
  calcularEstadisticas,
  calcularEstadisticasReservas,
  calcularRankingProductos,
} from "@/lib/estadisticas";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaTurno } from "@/lib/reservas";

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
  // Una ruta de API no pasa por el layout del panel, así que tiene que
  // verificar la sesión por su cuenta. Sin esto, cualquiera que se inventara
  // una cookie con el nombre correcto se bajaba el historial de ventas.
  if (!(await haySesionAdminValida())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "30dias";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const rango =
    calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("30dias", undefined, undefined)!;

  const storeId = await idLocalActual();

  const [stats, statsReservas, ranking] = await Promise.all([
    calcularEstadisticas(storeId, rango),
    calcularEstadisticasReservas(storeId, rango),
    // En la planilla conviene el ranking completo, no solo el top 10.
    calcularRankingProductos(storeId, rango, 500),
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

  filas.push("");
  filas.push(filaCsv(["Puesto", "Producto", "Unidades", "Facturación (Gs.)", "% de unidades"]));
  ranking.masVendidos.forEach((fila, i) => {
    filas.push(
      filaCsv([
        i + 1,
        fila.nombre,
        fila.unidades,
        Math.round(fila.facturacion),
        fila.porcentaje.toFixed(1),
      ])
    );
  });

  if (ranking.sinVentas.length > 0) {
    filas.push("");
    filas.push(filaCsv(["Productos sin ventas en el período"]));
    for (const nombre of ranking.sinVentas) {
      filas.push(filaCsv([nombre]));
    }
  }

  filas.push("");
  filas.push(
    filaCsv([
      "Reservas totales",
      "Personas esperadas",
      "Confirmadas",
      "Pendientes",
      "Canceladas",
      `Turno ${etiquetaTurno("dia")}`,
      `Turno ${etiquetaTurno("tarde")}`,
      `Turno ${etiquetaTurno("noche")}`,
    ])
  );
  filas.push(
    filaCsv([
      statsReservas.total,
      statsReservas.personasTotales,
      statsReservas.porEstado.confirmada,
      statsReservas.porEstado.pendiente,
      statsReservas.porEstado.cancelada,
      statsReservas.porTurno.dia,
      statsReservas.porTurno.tarde,
      statsReservas.porTurno.noche,
    ])
  );

  filas.push("");
  filas.push(filaCsv(["Fecha", "Reservas"]));
  for (const d of statsReservas.dias) {
    const clave = claveDia(d);
    filas.push(filaCsv([clave, statsReservas.totalesPorDia.get(clave) ?? 0]));
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
