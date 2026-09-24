import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { rangoDeDias, diaEnTexto } from "@/lib/rango-dias";
import { calcularReporteAlmacen } from "@/lib/reporte-almacen";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

/**
 * Reporte de almacén en Excel, con dos hojas: el movimiento de cada insumo en
 * cada almacén (stock inicial, compras, ventas, ajustes, anulaciones y stock
 * final) y el resumen del valor por almacén. Cada dato va en su propia columna
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
    calcularReporteAlmacen(storeId, rango, searchParams.get("almacen") || null, searchParams.get("categoria") || null),
  ]);

  const periodo = `${diaEnTexto(rango.desde)} - ${diaEnTexto(rango.hasta)}`;
  const cabeceraComun = (hoja: ReturnType<typeof nuevoLibro>["hoja"], titulo: string) => {
    // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
    // envios/exportar/route.ts.
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Reporte", titulo], 2);
    filaTitulo(hoja, ["Período", periodo], 2);
    filaTitulo(hoja, ["Almacén", reporte.almacenFiltrado ?? "Todos"], 2);
    filaTitulo(hoja, ["Categoría", reporte.categoriaFiltrada ?? "Todas"], 2);
    hoja.addRow([]);
  };

  // ------------------------------------------------------------ movimiento por insumo y almacén
  const { libro, hoja } = nuevoLibro("Movimiento");
  hoja.columns = [
    { width: 22 },
    { width: 20 },
    { width: 30 },
    { width: 12 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
  ];
  cabeceraComun(hoja, "Almacén — movimiento de stock");
  filaTitulo(
    hoja,
    [
      "Almacén",
      "Categoría",
      "Insumo",
      "Unidad",
      "Stock inicial",
      "Compras",
      "Ventas",
      "Ajustes",
      "Anulaciones",
      "Mov. de almacén",
      "Stock final",
      "Costo unit. hoy (Gs.)",
      "Valor final (Gs.)",
    ],
    13
  );
  for (const f of reporte.filas) {
    hoja.addRow([
      f.almacen,
      f.categoria,
      f.insumo,
      f.unidad,
      f.inicial,
      f.compras,
      f.ventas,
      f.ajustes,
      f.anulaciones,
      f.movimientos,
      f.final,
      f.costoUnitario != null ? Math.round(f.costoUnitario) : "",
      f.valorFinal != null ? Math.round(f.valorFinal) : "",
    ]);
  }
  filaTitulo(hoja, ["TOTAL", "", "", "", "", "", "", "", "", "", "", "", Math.round(reporte.totalValorFinal)], 13);
  hoja.addRow([]);
  hoja.addRow([
    "Ventas y compras canceladas figuran en Anulaciones. Mov. de almacén son las entradas (+) y salidas (−) manuales: mermas, roturas, consumo del personal. El valor va a costo de hoy de cada insumo (última compra, sin IVA); los insumos sin costo no suman.",
  ]);

  // ------------------------------------------------------------ resumen por almacén
  const resumen = libro.addWorksheet("Por almacén");
  resumen.columns = [{ width: 26 }, { width: 22 }, { width: 22 }, { width: 24 }];
  cabeceraComun(resumen, "Almacén — valor del stock final");
  filaTitulo(resumen, ["Almacén", "Insumos con stock", "Valor final (Gs.)", "Insumos sin costo"], 4);
  for (const r of reporte.porAlmacen) {
    resumen.addRow([r.almacen, r.insumos, Math.round(r.valorFinal), r.sinCosto]);
  }
  filaTitulo(resumen, ["TOTAL", "", Math.round(reporte.totalValorFinal), ""], 4);

  return respuestaXlsx(libro, `almacen_${rango.desde}_a_${rango.hasta}.xlsx`);
}
