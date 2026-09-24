import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { rangoDeDias, diaEnTexto } from "@/lib/rango-dias";
import { calcularReporteInventarios } from "@/lib/reporte-inventarios";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Reporte de inventarios en Excel, con dos hojas: una fila por inventario
 * (lo que dijo el sistema, lo que se contó y la diferencia en guaraníes) y el
 * detalle de cada insumo de cada planilla. Cada dato va en su propia columna
 * para poder ordenar, filtrar o armar una tabla dinámica.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "stock.ver")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const rango = rangoDeDias(searchParams.get("desde"), searchParams.get("hasta"));
  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteInventarios(storeId, rango, searchParams.get("almacen") || null),
  ]);

  const periodo = `${diaEnTexto(rango.desde)} - ${diaEnTexto(rango.hasta)}`;
  const textoFecha = (f: Date) =>
    f.toLocaleString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: ZONA_NEGOCIO,
    });

  const cabeceraComun = (hoja: ReturnType<typeof nuevoLibro>["hoja"], titulo: string) => {
    // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
    // envios/exportar/route.ts.
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Reporte", titulo], 2);
    filaTitulo(hoja, ["Período", periodo], 2);
    filaTitulo(hoja, ["Almacén", reporte.almacenFiltrado ?? "Todos"], 2);
    hoja.addRow([]);
  };

  // ------------------------------------------------------------ una fila por inventario
  const { libro, hoja } = nuevoLibro("Inventarios");
  hoja.columns = [
    { width: 18 },
    { width: 22 },
    { width: 28 },
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 22 },
    { width: 20 },
    { width: 18 },
  ];
  cabeceraComun(hoja, "Registro de inventario");
  filaTitulo(
    hoja,
    [
      "Fecha",
      "Almacén",
      "Categorías",
      "Registrado por",
      "Insumos contados",
      "Con diferencia",
      "Valor según sistema (Gs.)",
      "Valor contado (Gs.)",
      "Diferencia (Gs.)",
    ],
    9
  );
  for (const inv of reporte.inventarios) {
    const fila = hoja.addRow([
      textoFecha(inv.fecha),
      inv.almacen,
      inv.categorias,
      inv.registradoPor ?? "",
      inv.contados,
      inv.conDiferencia,
      Math.round(inv.valorSistema),
      Math.round(inv.valorContado),
      Math.round(inv.diferenciaValor),
    ]);
    for (const col of [7, 8, 9]) fila.getCell(col).numFmt = "#,##0";
  }
  const filaTotal = filaTitulo(
    hoja,
    ["TOTAL", "", "", "", reporte.totales.contados, reporte.totales.conDiferencia, "", "", Math.round(reporte.totales.diferenciaValor)],
    9
  );
  filaTotal.getCell(9).numFmt = "#,##0";
  if (reporte.inventarios.length === 0) {
    hoja.addRow([]);
    hoja.addRow(["No se registraron inventarios en este período."]);
  }
  hoja.addRow([]);
  hoja.addRow([
    "Diferencia = valor contado − valor según el sistema, a costo de cada insumo al guardar (sin IVA). Los insumos que no se contaron se toman como estaban.",
  ]);

  // ------------------------------------------------------------ el detalle de cada planilla
  const detalle = libro.addWorksheet("Detalle");
  detalle.columns = [
    { width: 18 },
    { width: 22 },
    { width: 22 },
    { width: 32 },
    { width: 12 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 22 },
  ];
  cabeceraComun(detalle, "Registro de inventario — detalle por insumo");
  filaTitulo(
    detalle,
    [
      "Fecha",
      "Almacén",
      "Categoría",
      "Insumo",
      "Unidad",
      "Stock del sistema",
      "Contado",
      "Diferencia",
      "Costo unit. (Gs.)",
      "Valor de la diferencia (Gs.)",
    ],
    10
  );
  for (const inv of reporte.inventarios) {
    for (const it of inv.items) {
      const fila = detalle.addRow([
        textoFecha(inv.fecha),
        inv.almacen,
        it.categoria,
        it.insumo,
        it.unidad,
        it.stockSistema,
        it.contado ?? "",
        it.diferencia ?? "",
        it.costoUnitario != null ? Math.round(it.costoUnitario * 100) / 100 : "",
        it.valorDiferencia != null ? Math.round(it.valorDiferencia) : "",
      ]);
      fila.getCell(10).numFmt = "#,##0";
    }
  }

  return respuestaXlsx(libro, `inventarios_${rango.desde}_a_${rango.hasta}.xlsx`);
}
