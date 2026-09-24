import { prismaDelLocal } from "./prisma-local";
import { limitesEnAsuncion, type RangoDias } from "./rango-dias";

/**
 * Reporte de inventarios: los inventarios que se guardaron en un rango de
 * fechas, con lo que dijo el sistema, lo que se contó y la diferencia, en
 * cantidad y en guaraníes. Cada inventario trae también su planilla completa.
 *
 * Todo sale de lo que quedó guardado al registrar cada inventario (nombres,
 * stock del sistema, costo de ese momento): un inventario viejo se ve como se
 * contó, aunque después el insumo haya cambiado de nombre o de costo.
 *
 * Los días se toman en hora de Asunción y ambos extremos entran.
 *
 * Lo usan el Excel (inventario/exportar) y la versión imprimible/PDF
 * (inventario/imprimir), para que los dos digan siempre lo mismo.
 */

export type ItemInventarioReporte = {
  insumo: string;
  categoria: string;
  unidad: string;
  /** Lo que decía el sistema en ese almacén al guardar. */
  stockSistema: number;
  /** Lo que se contó. Null = no se contó este insumo. */
  contado: number | null;
  /** contado − stockSistema. Null si no se contó. */
  diferencia: number | null;
  /** Costo de una unidad al guardar. Null si el insumo no tenía costo. */
  costoUnitario: number | null;
  /** diferencia × costoUnitario. Null si no se contó o no hay costo. */
  valorDiferencia: number | null;
};

export type InventarioReporte = {
  id: string;
  fecha: Date;
  almacen: string;
  categorias: string;
  registradoPor: string | null;
  /** Cuántos insumos se escribieron como contados. */
  contados: number;
  /** De esos, cuántos no coincidían con el sistema. */
  conDiferencia: number;
  valorSistema: number;
  valorContado: number;
  /** valorContado − valorSistema: lo que sobró (+) o faltó (−), en guaraníes. */
  diferenciaValor: number;
  items: ItemInventarioReporte[];
};

export type ReporteInventarios = {
  rango: RangoDias;
  /** Nombre del almacén por el que se filtró, si se filtró. */
  almacenFiltrado: string | null;
  inventarios: InventarioReporte[];
  totales: {
    cantidad: number;
    /** Insumos contados en todos los inventarios juntos. */
    contados: number;
    conDiferencia: number;
    /** Suma de las diferencias de valor de todos los inventarios (neto). */
    diferenciaValor: number;
  };
};

export async function calcularReporteInventarios(
  storeId: string,
  rango: RangoDias,
  almacenId?: string | null
): Promise<ReporteInventarios> {
  const db = prismaDelLocal(storeId);
  const { gte, lt } = limitesEnAsuncion(rango);

  const [inventarios, almacenElegido] = await Promise.all([
    db.inventario.findMany({
      where: { createdAt: { gte, lt }, ...(almacenId ? { almacenId } : {}) },
      orderBy: { createdAt: "asc" },
      include: { items: { orderBy: { orden: "asc" } } },
    }),
    almacenId
      ? db.almacen.findUnique({ where: { id: almacenId }, select: { nombre: true } })
      : Promise.resolve(null),
  ]);

  const filas: InventarioReporte[] = inventarios.map((inv) => {
    const valorSistema = Number(inv.valorSistema);
    const valorContado = Number(inv.valorContado);
    return {
      id: inv.id,
      fecha: inv.createdAt,
      almacen: inv.almacenNombre,
      categorias: inv.categorias,
      registradoPor: inv.registradoPor,
      contados: inv.contados,
      conDiferencia: inv.conDiferencia,
      valorSistema,
      valorContado,
      diferenciaValor: valorContado - valorSistema,
      items: inv.items.map((it) => {
        const diferencia = it.diferencia != null ? Number(it.diferencia) : null;
        const costoUnitario = it.costoUnitario != null ? Number(it.costoUnitario) : null;
        return {
          insumo: it.insumoNombre,
          categoria: it.categoriaNombre ?? "Sin categoría",
          unidad: it.unidad,
          stockSistema: Number(it.stockSistema),
          contado: it.contado != null ? Number(it.contado) : null,
          diferencia,
          costoUnitario,
          valorDiferencia: diferencia != null && costoUnitario != null ? diferencia * costoUnitario : null,
        };
      }),
    };
  });

  return {
    rango,
    almacenFiltrado: almacenId ? (almacenElegido?.nombre ?? null) : null,
    inventarios: filas,
    totales: {
      cantidad: filas.length,
      contados: filas.reduce((s, f) => s + f.contados, 0),
      conDiferencia: filas.reduce((s, f) => s + f.conDiferencia, 0),
      diferenciaValor: filas.reduce((s, f) => s + f.diferenciaValor, 0),
    },
  };
}
