import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { NOMBRE_DE_CANAL } from "@/lib/reporte-promociones";
import { TIPOS_DE_REGISTRO, autorizoDe, formatearFechaHora, leerTipo, resumirRegistros } from "@/lib/reporte-cancelaciones";
import { cargarRegistros } from "@/lib/reporte-cancelaciones-servidor";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Una ruta de API no pasa por el layout del panel: valida la sesión Y el permiso por su cuenta, antes de tocar la base.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "estadisticas.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const tipo = leerTipo(searchParams.get("tipo"));
  const info = TIPOS_DE_REGISTRO.find((t) => t.value === tipo)!;
  const usuario = searchParams.get("usuario")?.trim() || null;
  const fecha = searchParams.get("fecha") ?? "mes";
  const desde = searchParams.get("desde") ?? undefined;
  const hasta = searchParams.get("hasta") ?? undefined;
  const rango = calcularRangoFecha(fecha, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [local, registros] = await Promise.all([localActual(), cargarRegistros(storeId, rango, tipo)]);
  const r = resumirRegistros(registros, usuario);
  const esProductos = tipo === "productos";
  const esDescuentos = tipo === "descuentos";

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO };
  const periodo = `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} - ${finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}`;

  const { libro, hoja } = nuevoLibro("Registros");
  hoja.columns = [{ width: 18 }, { width: 14 }, { width: 26 }, { width: 34 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 40 }, { width: 24 }, { width: 24 }];

  filaTitulo(hoja, ["Negocio", local.nombre], 2);
  filaTitulo(hoja, ["Reporte", info.label], 2);
  filaTitulo(hoja, ["Período", periodo], 2);
  filaTitulo(hoja, ["Autorizó", usuario ?? "Todas las personas"], 2);
  hoja.addRow([]);

  // ---- por persona
  filaTitulo(hoja, ["Autorizó", "Registros", `${info.cancelado} (Gs.)`], 3);
  for (const p of r.porPersona) hoja.addRow([p.usuario, p.registros, p.monto]);
  filaTitulo(hoja, ["TOTAL", r.totales.registros, r.totales.monto], 3);
  hoja.addRow([]);

  // ---- el detalle
  const encabezado = [
    "Fecha",
    "Canal",
    esDescuentos ? "Venta" : "Cuenta",
    esProductos ? "Producto" : esDescuentos ? "Descuento" : "Estado",
    ...(esProductos ? ["Cantidad"] : []),
    `${info.cancelado} (Gs.)`,
    ...(esDescuentos ? ["Cobrado (Gs.)"] : []),
    "Motivo",
    "Autorizó",
    ...(esProductos ? ["Lo cargó"] : []),
  ];
  filaTitulo(hoja, encabezado, encabezado.length);
  for (const f of r.filas) {
    hoja.addRow([
      formatearFechaHora(f.fecha),
      NOMBRE_DE_CANAL[f.canal],
      f.referencia,
      f.detalle,
      ...(esProductos ? [f.cantidad ?? 0] : []),
      f.monto,
      ...(esDescuentos ? [f.cobrado ?? 0] : []),
      f.motivo ?? "",
      autorizoDe(f),
      ...(esProductos ? [f.cargo ?? ""] : []),
    ]);
  }

  return respuestaXlsx(libro, `${tipo}_${fecha}.xlsx`);
}
