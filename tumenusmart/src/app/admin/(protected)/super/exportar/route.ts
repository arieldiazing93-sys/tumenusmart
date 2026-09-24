import { NextRequest, NextResponse } from "next/server";
import { esSuperadmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { estadoSuscripcion, type EstadoSuscripcion } from "@/lib/suscripcion";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";
import { etiquetaTipoNegocio } from "@/lib/tipo-negocio";

export const dynamic = "force-dynamic";

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
    prisma.store.findMany({
      orderBy: { nombre: "asc" },
      select: {
        nombre: true,
        slug: true,
        estado: true,
        vencimiento: true,
        titularNombre: true,
        titularTelefono: true,
        razonSocial: true,
        ruc: true,
        tipoNegocio: true,
        asesor: { select: { nombre: true } },
      },
    }),
    prisma.pago.findMany({
      where: { fecha: { gte: rango.gte, lt: rango.lt } },
      orderBy: { fecha: "desc" },
      include: { store: { select: { nombre: true, slug: true, asesor: { select: { nombre: true } } } } },
    }),
  ]);

  const SIN_ASESOR = "Sin asignar";

  // Locales por asesor: foto de HOY, igual criterio que el estado de
  // suscripción — no tiene sentido acotarlo al período del reporte.
  const localesPorAsesor = new Map<string, number>();
  for (const l of locales) {
    const nombre = l.asesor?.nombre ?? SIN_ASESOR;
    localesPorAsesor.set(nombre, (localesPorAsesor.get(nombre) ?? 0) + 1);
  }

  // Recaudado en el período, agrupado por el asesor del local que pagó — la
  // base para calcular comisiones sin tener que cruzar planillas a mano.
  const recaudadoPorAsesor = new Map<string, number>();
  for (const p of pagos) {
    const nombre = p.store.asesor?.nombre ?? SIN_ASESOR;
    recaudadoPorAsesor.set(nombre, (recaudadoPorAsesor.get(nombre) ?? 0) + Number(p.monto));
  }

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

  const { libro, hoja } = nuevoLibro("Cartera");
  hoja.columns = [
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 10 },
    { width: 14 },
    { width: 24 },
    { width: 26 },
    { width: 14 },
    { width: 24 },
  ];

  filaTitulo(hoja, ["Reporte", "Cartera de locales"], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  hoja.addRow([]);

  filaTitulo(hoja, ["Locales totales", "Vencidos", "Por vencer", "Al día", "Suspendidos"], 5);
  hoja.addRow([
    locales.length,
    cuenta("vencido"),
    cuenta("por_vencer"),
    cuenta("al_dia"),
    cuenta("suspendido"),
  ]);
  hoja.addRow([]);

  // Foto de HOY de cada local con sus datos de contacto/facturación — los
  // mismos cuatro campos del titular que se ven y se editan en el modal "Ver"
  // de Cartera, que solo se podían consultar local por local, uno por uno.
  filaTitulo(
    hoja,
    [
      "Local",
      "Slug",
      "Estado",
      "Vence",
      "Asesor",
      "Titular",
      "Teléfono titular",
      "Razón social",
      "RUC",
      "Tipo de negocio",
    ],
    10
  );
  for (const l of locales) {
    hoja.addRow([
      l.nombre,
      l.slug,
      estadoSuscripcion(l, ahora, ZONA_NEGOCIO).etiqueta,
      l.vencimiento ? l.vencimiento.toLocaleDateString("es-PY", opcionesFecha) : "",
      l.asesor?.nombre ?? SIN_ASESOR,
      l.titularNombre ?? "",
      l.titularTelefono ?? "",
      l.razonSocial ?? "",
      l.ruc ?? "",
      etiquetaTipoNegocio(l.tipoNegocio) ?? "",
    ]);
  }
  hoja.addRow([]);

  filaTitulo(hoja, ["Locales por asesor"], 2);
  filaTitulo(hoja, ["Asesor", "Locales"], 2);
  for (const [nombre, cantidad] of [...localesPorAsesor].sort((a, b) => b[1] - a[1])) {
    hoja.addRow([nombre, cantidad]);
  }
  hoja.addRow([]);

  filaTitulo(hoja, ["Recaudado en el período por asesor"], 2);
  filaTitulo(hoja, ["Asesor", "Monto (Gs.)"], 2);
  for (const [nombre, monto] of [...recaudadoPorAsesor].sort((a, b) => b[1] - a[1])) {
    const fila = hoja.addRow([nombre, Math.round(monto)]);
    fila.getCell(2).numFmt = "#,##0";
  }
  hoja.addRow([]);

  filaTitulo(
    hoja,
    [
      "Local",
      "Slug",
      "Asesor",
      "Monto (Gs.)",
      "Meses",
      "Cubre hasta",
      "Nota",
      "Registrado por",
      "Fecha del pago",
    ],
    9
  );
  let totalRecaudado = 0;
  for (const p of pagos) {
    totalRecaudado += Number(p.monto);
    const fila = hoja.addRow([
      p.store.nombre,
      p.store.slug,
      p.store.asesor?.nombre ?? SIN_ASESOR,
      Math.round(Number(p.monto)),
      p.meses,
      p.cubreHasta.toLocaleDateString("es-PY", opcionesFecha),
      p.nota ?? "",
      p.registradoPor ?? "",
      p.fecha.toLocaleDateString("es-PY", opcionesFecha),
    ]);
    fila.getCell(4).numFmt = "#,##0";
  }

  hoja.addRow([]);
  const filaTotal = filaTitulo(
    hoja,
    ["TOTAL RECAUDADO EN EL PERÍODO (Gs.)", Math.round(totalRecaudado)],
    2
  );
  filaTotal.getCell(2).numFmt = "#,##0";

  if (pagos.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No se registraron pagos en este período."]);
  }

  return respuestaXlsx(libro, `cartera_${fecha}.xlsx`);
}
