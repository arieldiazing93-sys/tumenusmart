import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { calcularClientesDelRango, calcularDistribucionFrecuencia } from "@/lib/clientes-analytics";
import { calcularProgresoFidelidad } from "@/lib/fidelidad";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

/**
 * XLSX de Analytics: mismo criterio que estadisticas/exportar — mismo
 * período y mismos números que se ven en pantalla, para que nunca haya
 * dudas de que la planilla y el panel dicen lo mismo.
 */
export async function GET(request: NextRequest) {
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

  const [clientes, store] = await Promise.all([
    calcularClientesDelRango(storeId, rango),
    prisma.store.findUnique({
      where: { id: storeId },
      select: {
        nombre: true,
        fidelizacionActiva: true,
        fidelizacionUmbral: true,
        fidelizacionMontoMinimo: true,
      },
    }),
  ]);
  const distribucion = calcularDistribucionFrecuencia(clientes);

  const fidelizacionActiva = store?.fidelizacionActiva ?? false;
  const umbral = store?.fidelizacionUmbral ?? 10;
  const progresoFidelidad = fidelizacionActiva
    ? await calcularProgresoFidelidad(storeId, { umbral, montoMinimo: store?.fidelizacionMontoMinimo })
    : null;

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Analytics");
  hoja.columns = [
    { width: 6 },
    { width: 24 },
    { width: 16 },
    { width: 10 },
    { width: 16 },
    { width: 14 },
    { width: 18 },
  ];

  // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
  // envios/exportar/route.ts.
  filaTitulo(hoja, ["Negocio", store?.nombre ?? ""], 2);
  filaTitulo(hoja, ["Reporte", "Analytics"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  filaTitulo(hoja, ["Pidieron 1 vez", "Pidieron 2-3 veces", "Pidieron 4 o más veces"], 3);
  hoja.addRow([distribucion.unaVez, distribucion.dosATres, distribucion.cuatroOMas]);
  hoja.addRow([]);

  const encabezados: (string | number)[] = ["#", "Cliente", "Teléfono", "Pedidos", "Gasto total (Gs.)", "Último pedido"];
  if (fidelizacionActiva) encabezados.push(`Fidelización (de ${umbral})`);
  filaTitulo(hoja, encabezados, encabezados.length);

  clientes.forEach((c, i) => {
    const fila: (string | number)[] = [
      i + 1,
      c.nombre,
      c.telefono,
      c.pedidos,
      Math.round(c.gastado),
      c.ultimoPedido.toLocaleDateString("es-PY", opcionesFecha),
    ];
    if (fidelizacionActiva) {
      fila.push(progresoFidelidad?.get(c.telefono)?.progreso ?? 0);
    }
    hoja.addRow(fila);
  });

  return respuestaXlsx(libro, `analytics_${fecha}.xlsx`);
}
