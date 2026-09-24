import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { rangoDeDias, diaEnTexto } from "@/lib/rango-dias";
import { calcularReporteInsumos } from "@/lib/reporte-insumos";
import { nuevoLibro, filaTitulo, respuestaXlsx } from "@/lib/excel-reporte";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, string> = { negativo: "Stock negativo", bajo: "Bajo el mínimo", ok: "" };

/**
 * Reporte de insumos en Excel, con dos hojas: una fila por insumo (stock
 * inicial, compras, ventas, ajustes, anulaciones, stock final, costo y valor
 * del período pedido) y cómo quedó el stock final en cada almacén. Cada dato
 * va en su propia columna para poder ordenar, filtrar o armar una tabla dinámica.
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
    calcularReporteInsumos(storeId, rango, searchParams.get("categoria") || null),
  ]);

  const periodo = `${diaEnTexto(rango.desde)} - ${diaEnTexto(rango.hasta)}`;

  const cabeceraComun = (hoja: ReturnType<typeof nuevoLibro>["hoja"], titulo: string) => {
    // Encabezado fijo en todo reporte descargable: ver el mismo comentario en
    // envios/exportar/route.ts.
    filaTitulo(hoja, ["Negocio", local.nombre], 2);
    filaTitulo(hoja, ["Reporte", titulo], 2);
    filaTitulo(hoja, ["Período", periodo], 2);
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
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
    { width: 10 },
  ];
  cabeceraComun(hoja, "Insumos — movimiento y existencias");
  filaTitulo(
    hoja,
    [
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
      "Stock mínimo",
      "Costo unit. hoy (Gs.)",
      "Valor final (Gs.)",
      "Estado",
      "Activo",
    ],
    15
  );
  for (const f of reporte.filas) {
    hoja.addRow([
      f.categoria,
      f.insumo,
      f.unidad,
      f.inicial,
      f.compras,
      f.ventas,
      f.ajustes,
      f.anulaciones,
      f.movimientos,
      f.stock,
      f.stockMinimo ?? "",
      f.costoUnitario != null ? Math.round(f.costoUnitario * 100) / 100 : "",
      f.valor != null ? Math.round(f.valor) : "",
      ESTADO[f.estado],
      f.activo ? "Sí" : "No",
    ]);
  }
  filaTitulo(hoja, ["TOTAL", "", "", "", "", "", "", "", "", "", "", "", Math.round(reporte.totalValor), "", ""], 15);
  hoja.addRow([]);
  hoja.addRow([
    "Ventas y compras canceladas figuran en Anulaciones. Mov. de almacén son las entradas (+) y salidas (−) manuales: mermas, roturas, consumo del personal. " +
      (reporte.sinCosto > 0
        ? `${reporte.sinCosto} insumo(s) con stock no tienen costo (todavía no se les registró una compra) y no suman al valor.`
        : "El valor va a costo de hoy de cada insumo (última compra, sin IVA)."),
  ]);

  // ------------------------------------------------------------ cómo quedó el stock final en cada almacén
  const almacenes = libro.addWorksheet("Por almacén");
  almacenes.columns = [{ width: 24 }, { width: 22 }, { width: 32 }, { width: 12 }, { width: 14 }, { width: 20 }];
  cabeceraComun(almacenes, "Insumos — stock final por almacén");
  filaTitulo(almacenes, ["Almacén", "Categoría", "Insumo", "Unidad", "Cantidad", "Valor (Gs.)"], 6);
  for (const f of reporte.porAlmacen) {
    almacenes.addRow([f.almacen, f.categoria, f.insumo, f.unidad, f.cantidad, f.valor != null ? Math.round(f.valor) : ""]);
  }

  return respuestaXlsx(libro, `insumos_${rango.desde}_a_${rango.hasta}.xlsx`);
}
