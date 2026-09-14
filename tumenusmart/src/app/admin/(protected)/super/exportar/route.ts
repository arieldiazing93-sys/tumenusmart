import { NextRequest, NextResponse } from "next/server";
import { esSuperadmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { estadoSuscripcion, type EstadoSuscripcion } from "@/lib/suscripcion";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

function csvEscape(valor: string | number): string {
  const texto = String(valor);
  if (/[";\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

// Separador ";" y no ",": ver el mismo comentario en el resto de los
// reportes del panel (estadisticas/exportar, envios/exportar, etc.) — con
// "," Excel en español lo abre como una sola columna de texto.
function filaCsv(valores: (string | number)[]): string {
  return valores.map(csvEscape).join(";");
}

/**
 * A diferencia del resto de los reportes del panel, este no es de un local:
 * es del propio negocio de TuMenuSmart, sobre TODOS los locales. Por eso acá
 * se pide específicamente `esSuperadmin()` y no solo una sesión válida
 * cualquiera — un admin de un local no tiene que poder bajarse la cobranza
 * de los demás.
 */
export async function GET(request: NextRequest) {
  if (!(await esSuperadmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha") ?? "mes";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;

  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;
  const ahora = new Date();

  const [locales, pagos] = await Promise.all([
    prisma.store.findMany({ select: { estado: true, vencimiento: true } }),
    prisma.pago.findMany({
      where: { fecha: { gte: rango.gte, lt: rango.lt } },
      orderBy: { fecha: "desc" },
      include: { store: { select: { nombre: true, slug: true } } },
    }),
  ]);

  // Foto de HOY, no del período — ver el mismo comentario en page.tsx: el
  // estado de la suscripción no es algo que tenga sentido "acotar" a un rango.
  const cuenta = (clase: EstadoSuscripcion["clase"]) =>
    locales.filter((l) => estadoSuscripcion(l, ahora, ZONA_NEGOCIO).clase === clase).length;

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const filas: string[] = [];

  filas.push(filaCsv(["Reporte", "Cartera de locales"]));
  filas.push(filaCsv(["Período", periodo]));
  filas.push("");

  filas.push(filaCsv(["Locales totales", "Vencidos", "Por vencer", "Al día", "Suspendidos"]));
  filas.push(
    filaCsv([locales.length, cuenta("vencido"), cuenta("por_vencer"), cuenta("al_dia"), cuenta("suspendido")])
  );
  filas.push("");

  filas.push(
    filaCsv(["Local", "Slug", "Monto (Gs.)", "Meses", "Cubre hasta", "Nota", "Registrado por", "Fecha del pago"])
  );
  let totalRecaudado = 0;
  for (const p of pagos) {
    totalRecaudado += Number(p.monto);
    filas.push(
      filaCsv([
        p.store.nombre,
        p.store.slug,
        Math.round(Number(p.monto)),
        p.meses,
        p.cubreHasta.toLocaleDateString("es-PY", opcionesFecha),
        p.nota ?? "",
        p.registradoPor ?? "",
        p.fecha.toLocaleDateString("es-PY", opcionesFecha),
      ])
    );
  }

  filas.push("");
  filas.push(filaCsv(["TOTAL RECAUDADO EN EL PERÍODO (Gs.)", Math.round(totalRecaudado)]));

  if (pagos.length === 0) {
    filas.push("");
    filas.push(filaCsv(["No se registraron pagos en este período."]));
  }

  // BOM al inicio para que Excel detecte UTF-8 y no rompa los acentos/ñ.
  const csv = "﻿" + filas.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cartera_${fecha}.csv"`,
    },
  });
}
