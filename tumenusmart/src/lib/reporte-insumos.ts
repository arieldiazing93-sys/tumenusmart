import { prismaDelLocal } from "./prisma-local";
import { stockPorAlmacen } from "./stock-almacen";
import { etiquetaUnidadMedida } from "./unidad-medida";

/**
 * Reporte de insumos: la foto de hoy de lo que hay de cada uno, con su costo y
 * el valor del stock. El stock es el total de todos los almacenes
 * (`Insumo.stockActual`) y, aparte, cómo está repartido por almacén.
 *
 * Para ver qué se movió entre dos fechas está el reporte de Almacén.
 *
 * Lo usan el Excel (insumos/exportar) y la versión imprimible/PDF
 * (insumos/imprimir), para que los dos digan siempre lo mismo.
 */

export type FilaInsumoReporte = {
  categoria: string;
  insumo: string;
  unidad: string;
  activo: boolean;
  /** El total de todos los almacenes. */
  stock: number;
  stockMinimo: number | null;
  /** Costo de una unidad de stock. Null si todavía no tiene. */
  costoUnitario: number | null;
  /** stock × costoUnitario. Null si no hay costo. */
  valor: number | null;
  /** "negativo" | "bajo" (bajo el mínimo) | "ok". */
  estado: "negativo" | "bajo" | "ok";
};

export type FilaInsumoPorAlmacen = {
  almacen: string;
  categoria: string;
  insumo: string;
  unidad: string;
  cantidad: number;
  valor: number | null;
};

export type ReporteInsumos = {
  /** Nombre de la categoría por la que se filtró ("Sin categoría" incluida), si se filtró. */
  categoriaFiltrada: string | null;
  filas: FilaInsumoReporte[];
  porAlmacen: FilaInsumoPorAlmacen[];
  totalValor: number;
  /** Cuántos insumos con stock no tienen costo y no suman al valor. */
  sinCosto: number;
};

/** "" o ausente = todas, "sin" = las que no tienen categoría, o el id de una. */
export const SIN_CATEGORIA_INSUMO = "sin";

export async function calcularReporteInsumos(
  storeId: string,
  categoria?: string | null
): Promise<ReporteInsumos> {
  const db = prismaDelLocal(storeId);

  const [insumos, almacenes, categoriaElegida] = await Promise.all([
    db.insumo.findMany({
      where: !categoria ? {} : categoria === SIN_CATEGORIA_INSUMO ? { categoriaId: null } : { categoriaId: categoria },
      include: { categoria: { select: { nombre: true } } },
    }),
    db.almacen.findMany({ select: { id: true, nombre: true } }),
    categoria && categoria !== SIN_CATEGORIA_INSUMO
      ? db.categoriaInsumo.findUnique({ where: { id: categoria }, select: { nombre: true } })
      : Promise.resolve(null),
  ]);

  const nombreDeAlmacen = new Map(almacenes.map((a) => [a.id, a.nombre]));
  const stockDeCadaAlmacen = await stockPorAlmacen(
    storeId,
    insumos.map((i) => i.id)
  );

  const filas: FilaInsumoReporte[] = insumos.map((i) => {
    const stock = Number(i.stockActual);
    const stockMinimo = i.stockMinimo != null ? Number(i.stockMinimo) : null;
    const costoUnitario = i.costoUnitario != null ? Number(i.costoUnitario) : null;
    return {
      categoria: i.categoria?.nombre ?? "Sin categoría",
      insumo: i.nombre,
      unidad: etiquetaUnidadMedida(i.unidadMedida),
      activo: i.activo,
      stock,
      stockMinimo,
      costoUnitario,
      valor: costoUnitario != null ? stock * costoUnitario : null,
      estado: stock < 0 ? "negativo" : stockMinimo != null && stock < stockMinimo ? "bajo" : "ok",
    };
  });
  filas.sort(
    (a, b) => a.categoria.localeCompare(b.categoria, "es") || a.insumo.localeCompare(b.insumo, "es")
  );

  const porAlmacen: FilaInsumoPorAlmacen[] = [];
  for (const i of insumos) {
    const costo = i.costoUnitario != null ? Number(i.costoUnitario) : null;
    for (const s of stockDeCadaAlmacen.get(i.id) ?? []) {
      porAlmacen.push({
        almacen: s.almacenId ? (nombreDeAlmacen.get(s.almacenId) ?? "Almacén eliminado") : "Sin almacén",
        categoria: i.categoria?.nombre ?? "Sin categoría",
        insumo: i.nombre,
        unidad: etiquetaUnidadMedida(i.unidadMedida),
        cantidad: s.cantidad,
        valor: costo != null ? s.cantidad * costo : null,
      });
    }
  }
  porAlmacen.sort(
    (a, b) =>
      a.almacen.localeCompare(b.almacen, "es") ||
      a.categoria.localeCompare(b.categoria, "es") ||
      a.insumo.localeCompare(b.insumo, "es")
  );

  return {
    categoriaFiltrada: !categoria
      ? null
      : categoria === SIN_CATEGORIA_INSUMO
        ? "Sin categoría"
        : (categoriaElegida?.nombre ?? null),
    filas,
    porAlmacen,
    totalValor: filas.reduce((s, f) => s + (f.valor ?? 0), 0),
    sinCosto: filas.filter((f) => f.stock !== 0 && f.costoUnitario == null).length,
  };
}
