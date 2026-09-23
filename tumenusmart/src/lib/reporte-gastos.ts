import { prismaDelLocal } from "./prisma-local";
import { limitesDelRango, type RangoDias } from "./rango-dias";
import { CATEGORIAS_GASTO, etiquetaCategoriaGasto } from "./categoria-gasto";

/**
 * Reporte de gastos: lo que se gastó en un rango de fechas, con su detalle y
 * el total por categoría.
 *
 * La fecha de un gasto es el DÍA que se puso en el formulario (se guarda a
 * medianoche UTC), así que el rango se maneja en días "YYYY-MM-DD" y ambos
 * extremos entran — ver rango-dias.ts. Lo usan el Excel (gastos/exportar) y la
 * versión imprimible/PDF (gastos/imprimir), para que los dos digan siempre lo
 * mismo.
 */

export type GastoReporte = {
  id: string;
  fecha: Date;
  concepto: string;
  /** Ya con su etiqueta ("Alquiler", "Servicios"...). */
  categoria: string;
  proveedor: string | null;
  monto: number;
  notas: string | null;
  registradoPor: string | null;
};

export type CategoriaGastoReporte = {
  categoria: string;
  gastos: number;
  total: number;
  /** Porcentaje del total del período. */
  porcentaje: number;
};

export type ReporteGastos = {
  rango: RangoDias;
  /** Etiqueta de la categoría por la que se filtró, si se filtró. */
  categoriaFiltrada: string | null;
  /** Nombre del proveedor por el que se filtró, si se filtró. */
  proveedorFiltrado: string | null;
  gastos: GastoReporte[];
  total: number;
  porCategoria: CategoriaGastoReporte[];
};

export async function calcularReporteGastos(
  storeId: string,
  rango: RangoDias,
  filtros: { categoria?: string | null; proveedorId?: string | null } = {}
): Promise<ReporteGastos> {
  const db = prismaDelLocal(storeId);

  // La categoría se acepta solo si es una de las conocidas: lo que venga
  // escrito en la URL a mano no se usa tal cual.
  const categoria = CATEGORIAS_GASTO.find((c) => c.valor === filtros.categoria)?.valor ?? null;
  const proveedorId = filtros.proveedorId || null;

  const [gastos, proveedor] = await Promise.all([
    db.gasto.findMany({
      where: {
        fecha: limitesDelRango(rango),
        ...(categoria ? { categoria } : {}),
        ...(proveedorId ? { proveedorId } : {}),
      },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      include: { proveedor: { select: { nombre: true } } },
    }),
    proveedorId
      ? db.proveedor.findUnique({ where: { id: proveedorId }, select: { nombre: true } })
      : Promise.resolve(null),
  ]);

  const filas: GastoReporte[] = gastos.map((g) => ({
    id: g.id,
    fecha: g.fecha,
    concepto: g.concepto,
    categoria: etiquetaCategoriaGasto(g.categoria),
    proveedor: g.proveedor?.nombre ?? null,
    monto: Number(g.monto),
    notas: g.notas,
    registradoPor: g.registradoPor,
  }));

  const total = filas.reduce((s, f) => s + f.monto, 0);

  const porCategoriaMapa = new Map<string, { gastos: number; total: number }>();
  for (const f of filas) {
    const actual = porCategoriaMapa.get(f.categoria) ?? { gastos: 0, total: 0 };
    actual.gastos += 1;
    actual.total += f.monto;
    porCategoriaMapa.set(f.categoria, actual);
  }
  const porCategoria: CategoriaGastoReporte[] = [...porCategoriaMapa.entries()]
    .map(([nombre, c]) => ({
      categoria: nombre,
      gastos: c.gastos,
      total: c.total,
      porcentaje: total > 0 ? (c.total / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    rango,
    categoriaFiltrada: categoria ? etiquetaCategoriaGasto(categoria) : null,
    proveedorFiltrado: proveedor?.nombre ?? null,
    gastos: filas,
    total,
    porCategoria,
  };
}
