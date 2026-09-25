import { NextRequest, NextResponse } from "next/server";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { diaEnTexto } from "@/lib/rango-dias";
import { MAXIMO_DIAS_REPORTE, cargarReportePersonal } from "@/lib/reporte-personal";
import { filaTitulo, nuevoLibro, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

/** Tope de trabajos en el detalle del Excel: un período de un año de todo el personal no llega ni cerca. */
const MAXIMO_FILAS_EXCEL = 20000;

const FORMATO_GUARANIES = "#,##0";

/** Para el nombre del archivo: sin tildes ni espacios ni nada raro. */
function paraArchivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function textoPorcentaje(valor: number): string {
  return String(valor).replace(".", ",");
}

/**
 * El Excel del reporte de personal: lo mismo que se ve en pantalla (la persona o todo el personal, en el período
 * elegido), con dos hojas: "Resumen" (una fila por persona, con sus totales) y "Trabajos" (cada trabajo con lo que
 * le tocó de comisión). Es del dueño: el reporte lleva comisiones.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y el permiso por su cuenta.
  try {
    await exigirPermiso("agenda.configurar");
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const reporte = await cargarReportePersonal(
    db,
    {
      personal: searchParams.get("personal"),
      desde: searchParams.get("desde"),
      hasta: searchParams.get("hasta"),
    },
    MAXIMO_FILAS_EXCEL,
    "asc"
  );
  const { periodo, personalElegido, personas, porPersona, general, filas, hayMas } = reporte;
  if (!periodo) return NextResponse.json({ error: "Elegí el período del reporte." }, { status: 400 });
  if (reporte.demasiadoLargo) {
    return NextResponse.json(
      { error: `El período es muy largo: elegí hasta ${MAXIMO_DIAS_REPORTE} días por vez.` },
      { status: 400 }
    );
  }

  const local = await localActual();
  const textoPeriodo =
    periodo.desde === periodo.hasta ? diaEnTexto(periodo.desde) : `${diaEnTexto(periodo.desde)} - ${diaEnTexto(periodo.hasta)}`;
  const quien = personalElegido ? personalElegido.nombre : "Todo el personal";

  // ---------- hoja 1: el resumen por persona ----------
  const { libro, hoja: resumen } = nuevoLibro("Resumen");
  resumen.columns = [{ width: 32 }, { width: 16 }, { width: 12 }, { width: 18 }, { width: 18 }];

  filaTitulo(resumen, ["Negocio", local.nombre], 2);
  filaTitulo(resumen, ["Reporte", "Movimiento del personal"], 2);
  filaTitulo(resumen, ["Personal", quien], 2);
  filaTitulo(resumen, ["Período", textoPeriodo], 2);
  resumen.addRow([]);

  filaTitulo(resumen, ["Personal", "Comisión (%)", "Trabajos", "Cobrado (Gs.)", "Comisión (Gs.)"], 5);
  // Se ve a quien está activo y a quien, aunque esté inactivo, tuvo trabajo en el período.
  const aMostrar = personalElegido ? [personalElegido] : personas.filter((p) => p.activo || porPersona.has(p.id));
  for (const p of aMostrar) {
    const suma = porPersona.get(p.id) ?? { cantidad: 0, cobrado: 0, comision: 0 };
    const fila = resumen.addRow([
      p.nombre,
      p.comision != null ? textoPorcentaje(p.comision) : "Sin comisión",
      suma.cantidad,
      Math.round(suma.cobrado),
      Math.round(suma.comision),
    ]);
    fila.getCell(4).numFmt = FORMATO_GUARANIES;
    fila.getCell(5).numFmt = FORMATO_GUARANIES;
  }
  resumen.addRow([]);
  const filaTotal = filaTitulo(
    resumen,
    ["TOTAL", "", general.cantidad, Math.round(general.cobrado), Math.round(general.comision)],
    5
  );
  filaTotal.getCell(4).numFmt = FORMATO_GUARANIES;
  filaTotal.getCell(5).numFmt = FORMATO_GUARANIES;

  resumen.addRow([]);
  resumen.addRow(["Lo cobrado y la comisión cuentan solo los servicios: los productos que se lleve el cliente no suman."]);
  resumen.addRow([
    "Cada trabajo usa el porcentaje que tenía la persona al cobrarlo. Cuenta por el día del trabajo, no por el día del cobro.",
  ]);
  if (general.cantidad === 0) {
    resumen.addRow([]);
    resumen.addRow(["No hay trabajos terminados en este período."]);
  }

  // ---------- hoja 2: cada trabajo ----------
  const trabajos = libro.addWorksheet("Trabajos");
  trabajos.columns = [
    { width: 12 },
    { width: 8 },
    { width: 28 },
    { width: 28 },
    { width: 40 },
    { width: 18 },
    { width: 30 },
    { width: 16 },
    { width: 8 },
    { width: 16 },
  ];
  filaTitulo(
    trabajos,
    ["Fecha", "Hora", "Personal", "Cliente", "Servicios", "Origen", "Forma de pago", "Total (Gs.)", "%", "Comisión (Gs.)"],
    10
  );
  for (const f of filas) {
    const fila = trabajos.addRow([
      diaEnTexto(f.dia),
      f.hora,
      f.personal,
      f.cliente,
      f.servicios ?? "",
      f.sinReserva ? "Mostrador (sin reserva)" : "Reserva",
      f.pago,
      Math.round(f.total),
      f.porcentaje != null ? textoPorcentaje(f.porcentaje) : "—",
      f.porcentaje != null ? Math.round(f.comision) : "—",
    ]);
    fila.getCell(8).numFmt = FORMATO_GUARANIES;
    fila.getCell(10).numFmt = FORMATO_GUARANIES;
  }
  if (filas.length > 0) {
    trabajos.addRow([]);
    const total = filaTitulo(
      trabajos,
      ["", "", "", "", "", "", "TOTAL", Math.round(general.cobrado), "", Math.round(general.comision)],
      10
    );
    total.getCell(8).numFmt = FORMATO_GUARANIES;
    total.getCell(10).numFmt = FORMATO_GUARANIES;
  }
  if (hayMas) {
    trabajos.addRow([]);
    trabajos.addRow([
      `Se listan los primeros ${MAXIMO_FILAS_EXCEL} trabajos del período; los totales de la hoja Resumen cuentan todos.`,
    ]);
  }

  const nombreArchivo = `reporte_personal_${paraArchivo(quien) || "personal"}_${periodo.desde}_${periodo.hasta}.xlsx`;
  return respuestaXlsx(libro, nombreArchivo);
}
