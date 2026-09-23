import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularReporteInsumos } from "@/lib/reporte-insumos";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = { negativo: "Stock negativo", bajo: "Bajo el mínimo", ok: "" };

/**
 * Reporte de insumos en Excel, con dos hojas: una fila por insumo (stock total,
 * costo y valor) y el detalle de cuánto hay en cada almacén. Cada dato va en su
 * propia columna para poder ordenar, filtrar o armar una tabla dinámica.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "stock.ver")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const storeId = await idLocalActual();
  const [local, reporte] = await Promise.all([
    localActual(),
    calcularReporteInsumos(storeId, searchParams.get("categoria") || null),
  ]);

  const hoy = new Date();
  const fecha = hoy.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO });
  const clave = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO }).format(hoy);

  const cabeceraComun = (hoja: ReturnType<typeof nuevoLibro>["hoja"], titulo: string) => {
    // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
    // envios/exportar/route.ts.
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Reporte", titulo], 2);
    filaTitulo(hoja, ["Al día", fecha], 2);
    filaTitulo(hoja, ["Categoría", reporte.categoriaFiltrada ?? "Todas"], 2);
    hoja.addRow([]);
  };

  // ------------------------------------------------------------ una fila por insumo
  const { libro, hoja } = nuevoLibro("Insumos");
  hoja.columns = [
    { width: 22 },
    { width: 32 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 10 },
  ];
  cabeceraComun(hoja, "Insumos — existencias");
  filaTitulo(
    hoja,
    [
      "Categoría",
      "Insumo",
      "Unidad",
      "Stock total",
      "Stock mínimo",
      "Costo unitario (Gs.)",
      "Valor del stock (Gs.)",
      "Estado",
      "Activo",
    ],
    9
  );
  for (const f of reporte.filas) {
    hoja.addRow([
      f.categoria,
      f.insumo,
      f.unidad,
      f.stock,
      f.stockMinimo ?? "",
      f.costoUnitario != null ? Math.round(f.costoUnitario * 100) / 100 : "",
      f.valor != null ? Math.round(f.valor) : "",
      ESTADO[f.estado],
      f.activo ? "Sí" : "No",
    ]);
  }
  filaTitulo(hoja, ["TOTAL", "", "", "", "", "", Math.round(reporte.totalValor), "", ""], 9);
  hoja.addRow([]);
  hoja.addRow([
    reporte.sinCosto > 0
      ? `${reporte.sinCosto} insumo(s) con stock no tienen costo (todavía no se les registró una compra) y no suman al valor.`
      : "El valor va a costo de cada insumo (última compra, sin IVA).",
  ]);

  // ------------------------------------------------------------ cuánto hay en cada almacén
  const almacenes = libro.addWorksheet("Por almacén");
  almacenes.columns = [{ width: 24 }, { width: 22 }, { width: 32 }, { width: 12 }, { width: 14 }, { width: 20 }];
  cabeceraComun(almacenes, "Insumos — por almacén");
  filaTitulo(almacenes, ["Almacén", "Categoría", "Insumo", "Unidad", "Cantidad", "Valor (Gs.)"], 6);
  for (const f of reporte.porAlmacen) {
    almacenes.addRow([f.almacen, f.categoria, f.insumo, f.unidad, f.cantidad, f.valor != null ? Math.round(f.valor) : ""]);
  }

  return respuestaXlsx(libro, `insumos_${clave}.xlsx`);
}
