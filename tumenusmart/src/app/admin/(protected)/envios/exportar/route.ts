import { NextRequest, NextResponse } from "next/server";
import { haySesionAdminValida } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { calcularReporteEnvios } from "@/lib/reporte-envios";
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

  const filas: string[] = [];

  filas.push(filaCsv(["Negocio", "Período"]));
  filas.push(filaCsv([local.nombre, periodo]));
  filas.push("");

  // Una fila por zona y, debajo de cada una, una fila por repartidor que
  // hizo envíos ahí — la columna "Zona" queda vacía en esas para que se
  // lean como parte de la de arriba al ordenar o filtrar en la planilla.
  filas.push(
    filaCsv([
      "Zona",
      "Repartidor",
      "Cantidad de pedidos",
      "% del delivery",
      "Facturado (Gs.)",
      "Cobrado por envío (Gs.)",
      "Envío promedio (Gs.)",
    ])
  );

  const cantidadDelivery = reporte.totalGeneral.cantidadDelivery;
  for (const z of reporte.zonas) {
    filas.push(
      filaCsv([
        z.zonaNombre,
        "",
        z.cantidadPedidos,
        cantidadDelivery > 0 ? Math.round((z.cantidadPedidos / cantidadDelivery) * 100) : 0,
        Math.round(z.totalFacturado),
        Math.round(z.totalEnvio),
        Math.round(z.envioPromedio),
      ])
    );
    for (const r of z.repartidores) {
      filas.push(filaCsv(["", r.repartidorNombre, r.cantidadPedidos, "", "", "", ""]));
    }
  }

  filas.push(
    filaCsv(["Retiro en el local", "", reporte.retiro.cantidadPedidos, "", Math.round(reporte.retiro.totalFacturado), "", ""])
  );

  filas.push("");
  filas.push(
    filaCsv([
      "TOTAL GENERAL",
      "",
      reporte.totalGeneral.cantidadPedidos,
      "",
      Math.round(reporte.totalGeneral.totalFacturado),
      Math.round(reporte.totalGeneral.totalEnvio),
      "",
    ])
  );

  // BOM al inicio para que Excel detecte UTF-8 y no rompa los acentos/ñ.
  const csv = "﻿" + filas.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="envios_${fecha}.csv"`,
    },
  });
}
