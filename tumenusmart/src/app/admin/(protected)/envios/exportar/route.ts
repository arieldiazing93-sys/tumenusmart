import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { calcularReporteEnvios } from "@/lib/reporte-envios";
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
  const fecha = searchParams.get("fecha") ?? "mes";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteEnvios(storeId, rango),
  ]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Envíos");
  hoja.columns = [
    { width: 20 },
    { width: 20 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
  ];

  // Encabezado fijo en todo reporte descargable: al abrirlo meses después,
  // o si alguien lo reenvía por WhatsApp, tiene que quedar claro de qué
  // negocio y de qué reporte salió sin tener que preguntarle a nadie.
  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", "Envíos"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  // Una fila por zona y, debajo de cada una, una fila por repartidor que
  // hizo envíos ahí — la columna "Zona" queda vacía en esas para que se
  // lean como parte de la de arriba al ordenar o filtrar en la planilla.
  filaTitulo(
    hoja,
    [
      "Zona",
      "Repartidor",
      "Cantidad de pedidos",
      "% del delivery",
      "Facturado (Gs.)",
      "Cobrado por envío (Gs.)",
      "Envío promedio (Gs.)",
    ],
    7
  );

  const cantidadDelivery = reporte.totalGeneral.cantidadDelivery;
  for (const z of reporte.zonas) {
    hoja.addRow([
      z.zonaNombre,
      "",
      z.cantidadPedidos,
      cantidadDelivery > 0 ? Math.round((z.cantidadPedidos / cantidadDelivery) * 100) : 0,
      Math.round(z.totalFacturado),
      Math.round(z.totalEnvio),
      Math.round(z.envioPromedio),
    ]);
    for (const r of z.repartidores) {
      hoja.addRow(["", r.repartidorNombre, r.cantidadPedidos, "", "", "", ""]);
    }
  }

  hoja.addRow([
    "Retiro en el local",
    "",
    reporte.retiro.cantidadPedidos,
    "",
    Math.round(reporte.retiro.totalFacturado),
    "",
    "",
  ]);

  hoja.addRow([]);
  filaTitulo(
    hoja,
    [
      "TOTAL GENERAL",
      "",
      reporte.totalGeneral.cantidadPedidos,
      "",
      Math.round(reporte.totalGeneral.totalFacturado),
      Math.round(reporte.totalGeneral.totalEnvio),
      "",
    ],
    7
  );

  return respuestaXlsx(libro, `envios_${fecha}.xlsx`);
}
