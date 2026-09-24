import { prismaDelLocal } from "./prisma-local";
import { type RangoDias } from "./rango-dias";
import { acumularMovimientos, redondear3, SIN_CATEGORIA_INSUMO } from "./reporte-almacen";
import { etiquetaUnidadMedida } from "./unidad-medida";

/**
 * Reporte de insumos en un rango de fechas: por cada insumo, con cuánto stock
 * arrancó, cuánto entró por compras, cuánto salió por ventas, cuánto se
 * corrigió con inventarios y con cuánto terminó (sumando todos los almacenes),
 * más su costo y el valor del stock final. Aparte, cómo quedó repartido el
 * stock final por almacén.
 *
 * Sale del mismo cálculo que el reporte de Almacén (el ledger de movimientos,
 * `acumularMovimientos`), así los dos siempre coinciden. Con un rango que
 * termina hoy, "stock final" es lo que hay ahora.
 *
 * Lo usan el Excel (insumos/exportar) y la versión imprimible/PDF
 * (insumos/imprimir), para que los dos digan siempre lo mismo.
 */

export type FilaInsumoReporte = {
  categoria: string;
  insumo: string;
  unidad: string;
  activo: boolean;
  /** Lo que había al empezar el primer día (todos los almacenes). */
  inicial: number;
  /** Entradas por compras (positivo). */
  compras: number;
  /** Salidas por ventas (negativo). */
  ventas: number;
  /** Correcciones por inventario (positivo o negativo). */
  ajustes: number;
  /** Ventas o compras canceladas: lo que se devolvió o se sacó de nuevo. */
  anulaciones: number;
  /** Movimientos de almacén: entradas (+) y salidas (−) manuales — mermas, roturas, consumo del personal. */
  movimientos: number;
  /** El stock al terminar el último día del rango (todos los almacenes). */
  stock: number;
  stockMinimo: number | null;
  /** Costo de HOY de una unidad de stock. Null si todavía no tiene. */
  costoUnitario: number | null;
  /** stock × costoUnitario. Null si no hay costo. */
  valor: number | null;
  /** Sobre el stock final: "negativo" | "bajo" (bajo el mínimo) | "ok". */
  estado: "negativo" | "bajo" | "ok";
};

export type FilaInsumoPorAlmacen = {
  almacen: string;
  categoria: string;
  insumo: string;
  unidad: string;
  /** Cuánto había en ese almacén al terminar el último día del rango. */
  cantidad: number;
  valor: number | null;
};

export type ReporteInsumos = {
  rango: RangoDias;
  /** Nombre de la categoría por la que se filtró ("Sin categoría" incluida), si se filtró. */
  categoriaFiltrada: string | null;
  filas: FilaInsumoReporte[];
  porAlmacen: FilaInsumoPorAlmacen[];
  totalValor: number;
  /** Cuántos insumos con stock no tienen costo y no suman al valor. */
  sinCosto: number;
};

export async function calcularReporteInsumos(
  storeId: string,
  rango: RangoDias,
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
  const datosDeInsumo = new Map(insumos.map((i) => [i.id, i]));

  const acumulados = await acumularMovimientos(storeId, rango, { insumoIds: insumos.map((i) => i.id) });

  // Lo de todos los almacenes, sumado por insumo.
  type Totales = {
    inicial: number;
    compras: number;
    ventas: number;
    ajustes: number;
    anulaciones: number;
    movimientos: number;
  };
  const sinMovimientos = (): Totales => ({
    inicial: 0,
    compras: 0,
    ventas: 0,
    ajustes: 0,
    anulaciones: 0,
    movimientos: 0,
  });
  const totalesPorInsumo = new Map<string, Totales>();
  for (const a of acumulados) {
    const t = totalesPorInsumo.get(a.insumoId) ?? sinMovimientos();
    t.inicial += a.inicial;
    t.compras += a.compras;
    t.ventas += a.ventas;
    t.ajustes += a.ajustes;
    t.anulaciones += a.anulaciones;
    t.movimientos += a.movimientos;
    totalesPorInsumo.set(a.insumoId, t);
  }

  const filas: FilaInsumoReporte[] = insumos.map((i) => {
    const t = totalesPorInsumo.get(i.id) ?? sinMovimientos();
    const inicial = redondear3(t.inicial);
    const compras = redondear3(t.compras);
    const ventas = redondear3(t.ventas);
    const ajustes = redondear3(t.ajustes);
    const anulaciones = redondear3(t.anulaciones);
    const movimientos = redondear3(t.movimientos);
    const stock = redondear3(inicial + compras + ventas + ajustes + anulaciones + movimientos);
    const stockMinimo = i.stockMinimo != null ? Number(i.stockMinimo) : null;
    const costoUnitario = i.costoUnitario != null ? Number(i.costoUnitario) : null;
    return {
      categoria: i.categoria?.nombre ?? "Sin categoría",
      insumo: i.nombre,
      unidad: etiquetaUnidadMedida(i.unidadMedida),
      activo: i.activo,
      inicial,
      compras,
      ventas,
      ajustes,
      anulaciones,
      movimientos,
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

  // Cómo quedó el stock final repartido por almacén (solo lo que tiene algo).
  const porAlmacen: FilaInsumoPorAlmacen[] = [];
  for (const a of acumulados) {
    const cantidad = redondear3(a.inicial + a.compras + a.ventas + a.ajustes + a.anulaciones + a.movimientos);
    if (cantidad === 0) continue;
    const i = datosDeInsumo.get(a.insumoId);
    if (!i) continue;
    const costo = i.costoUnitario != null ? Number(i.costoUnitario) : null;
    porAlmacen.push({
      almacen: a.almacenId ? (nombreDeAlmacen.get(a.almacenId) ?? "Almacén eliminado") : "Sin almacén",
      categoria: i.categoria?.nombre ?? "Sin categoría",
      insumo: i.nombre,
      unidad: etiquetaUnidadMedida(i.unidadMedida),
      cantidad,
      valor: costo != null ? cantidad * costo : null,
    });
  }
  porAlmacen.sort(
    (a, b) =>
      a.almacen.localeCompare(b.almacen, "es") ||
      a.categoria.localeCompare(b.categoria, "es") ||
      a.insumo.localeCompare(b.insumo, "es")
  );

  return {
    rango,
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
