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
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

// Genera un XLSX real (con color de fondo en las filas de título, algo que
// un CSV no puede llevar) con el mismo período y los mismos números que se
// ven en el panel de Estadísticas. Los indicadores van como columnas (una
// fila de encabezados + una fila de valores), que es como se lee mejor una
// tabla en una planilla.
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

  const { libro, hoja } = nuevoLibro("Estadísticas");
  hoja.columns = [
    { width: 22 },
    { width: 20 },
    { width: 16 },
    { width: 20 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  // Encabezado fijo en todo reporte descargable: al abrirlo meses después,
  // o si alguien lo reenvía por WhatsApp, tiene que quedar claro de qué
  // negocio y de qué reporte salió sin tener que preguntarle a nadie.
  filaTitulo(hoja, ["Negocio", stats.store?.nombre ?? ""], 2);
  filaTitulo(hoja, ["Reporte", "Estadísticas"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  filaTitulo(
    hoja,
    [
      "Ingresos (Gs.)",
      "Ventas totales",
      "Ventas válidas",
      "Ticket promedio (Gs.)",
      "Clientes únicos",
      "Unidades vendidas",
      "Productos por pedido",
      "Clientes nuevos",
      "Cancelados",
    ],
    9
  );
  hoja.addRow([
    Math.round(stats.ingresos),
    stats.ventasTotales,
    stats.ventasValidas,
    Math.round(stats.ticketPromedio),
    stats.clientesUnicos,
    stats.unidadesVendidas,
    stats.productosPorPedido.toFixed(2),
    stats.clientesNuevos,
    stats.cancelados,
  ]);

  hoja.addRow([]);
  filaTitulo(hoja, ["Fecha", "Ventas (Gs.)"], 2);
  for (const d of stats.dias) {
    const clave = claveDia(d);
    hoja.addRow([clave, Math.round(stats.totalesPorDia.get(clave) ?? 0)]);
  }

  hoja.addRow([]);
  filaTitulo(hoja, ["Tipo de entrega", "Ventas", "Ingresos (Gs.)"], 3);
  hoja.addRow(["Delivery", stats.porTipoEntrega.delivery.cantidad, Math.round(stats.porTipoEntrega.delivery.ingresos)]);
  hoja.addRow(["Retiro en el local", stats.porTipoEntrega.retiro.cantidad, Math.round(stats.porTipoEntrega.retiro.ingresos)]);
  hoja.addRow(["Comer en el local", stats.porTipoEntrega.mesa.cantidad, Math.round(stats.porTipoEntrega.mesa.ingresos)]);

  hoja.addRow([]);
  filaTitulo(hoja, ["Puesto", "Producto", "Unidades", "Facturación (Gs.)", "% de unidades"], 5);
  ranking.masVendidos.forEach((fila, i) => {
    hoja.addRow([i + 1, fila.nombre, fila.unidades, Math.round(fila.facturacion), fila.porcentaje.toFixed(1)]);
  });

  if (ranking.sinVentas.length > 0) {
    hoja.addRow([]);
    filaTitulo(hoja, ["Productos sin ventas en el período"], 1);
    for (const nombre of ranking.sinVentas) {
      hoja.addRow([nombre]);
    }
  }

  hoja.addRow([]);
  filaTitulo(
    hoja,
    [
      "Reservas totales",
      "Personas esperadas",
      "Confirmadas",
      "Pendientes",
      "Canceladas",
      `Turno ${etiquetaTurno("dia")}`,
      `Turno ${etiquetaTurno("tarde")}`,
      `Turno ${etiquetaTurno("noche")}`,
    ],
    8
  );
  hoja.addRow([
    statsReservas.total,
    statsReservas.personasTotales,
    statsReservas.porEstado.confirmada,
    statsReservas.porEstado.pendiente,
    statsReservas.porEstado.cancelada,
    statsReservas.porTurno.dia,
    statsReservas.porTurno.tarde,
    statsReservas.porTurno.noche,
  ]);

  hoja.addRow([]);
  filaTitulo(hoja, ["Fecha", "Reservas"], 2);
  for (const d of statsReservas.dias) {
    const clave = claveDia(d);
    hoja.addRow([clave, statsReservas.totalesPorDia.get(clave) ?? 0]);
  }

  return respuestaXlsx(libro, `estadisticas_${fecha}.xlsx`);
}
