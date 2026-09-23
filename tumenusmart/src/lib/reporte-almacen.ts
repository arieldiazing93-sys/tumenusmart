import { prismaDelLocal } from "./prisma-local";
import { fechaAsuncionDesdeTexto } from "./timezone";
import { type RangoDias } from "./rango-dias";
import { etiquetaUnidadMedida } from "./unidad-medida";

/**
 * Reporte de almacén: qué pasó con el stock de cada insumo en un rango de
 * fechas — con cuánto arrancó, cuánto entró por compras, cuánto salió por
 * ventas, cuánto se corrigió con inventarios y con cuánto terminó.
 *
 * Sale del ledger (MovimientoStock), que es la fuente de verdad del stock:
 * lo que había al arrancar es la suma de todos los movimientos anteriores al
 * primer día. Los días se toman en hora de Asunción y ambos extremos entran.
 *
 * El valor del stock final va a costo de HOY de cada insumo (el de su última
 * compra, sin IVA): no se guardó el costo de cada día.
 *
 * Lo usan el Excel (almacenes/exportar) y la versión imprimible/PDF
 * (almacenes/imprimir), para que los dos digan siempre lo mismo.
 */

export type FilaAlmacenReporte = {
  almacenId: string | null;
  /** "Sin almacén" para el stock viejo, de antes de que se repartiera por almacén. */
  almacen: string;
  categoria: string;
  insumo: string;
  unidad: string;
  /** Lo que había al empezar el primer día. */
  inicial: number;
  /** Entradas por compras (positivo). */
  compras: number;
  /** Salidas por ventas (negativo). */
  ventas: number;
  /** Correcciones por inventario (positivo o negativo). */
  ajustes: number;
  /** Ventas o compras canceladas: lo que se devolvió o se sacó de nuevo. */
  anulaciones: number;
  /** inicial + compras + ventas + ajustes + anulaciones. */
  final: number;
  /** Costo de HOY de una unidad de stock. Null si el insumo no tiene costo. */
  costoUnitario: number | null;
  /** final × costoUnitario. Null si no hay costo. */
  valorFinal: number | null;
};

export type ResumenAlmacenReporte = {
  almacen: string;
  /** Insumos con stock distinto de cero al final del período. */
  insumos: number;
  /** Valor del stock final, de los que tienen costo. */
  valorFinal: number;
  /** Cuántos insumos con stock no tienen costo y no suman al valor. */
  sinCosto: number;
};

export type ReporteAlmacen = {
  rango: RangoDias;
  /** Nombre del almacén por el que se filtró, si se filtró. */
  almacenFiltrado: string | null;
  filas: FilaAlmacenReporte[];
  porAlmacen: ResumenAlmacenReporte[];
  totalValorFinal: number;
};

const DIA_MS = 24 * 60 * 60 * 1000;

function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export async function calcularReporteAlmacen(
  storeId: string,
  rango: RangoDias,
  almacenId?: string | null
): Promise<ReporteAlmacen> {
  const db = prismaDelLocal(storeId);

  // Los días en hora de Asunción: desde el inicio del primero hasta el fin del último.
  const inicio = fechaAsuncionDesdeTexto(rango.desde) ?? new Date(rango.desde);
  const ultimoDia = fechaAsuncionDesdeTexto(rango.hasta) ?? new Date(rango.hasta);
  const fin = new Date(ultimoDia.getTime() + DIA_MS);

  const filtroAlmacen = almacenId ? { almacenId } : {};

  const [antes, enElRango, almacenes] = await Promise.all([
    db.movimientoStock.groupBy({
      by: ["insumoId", "almacenId"],
      where: { createdAt: { lt: inicio }, ...filtroAlmacen },
      _sum: { cantidad: true },
    }),
    db.movimientoStock.groupBy({
      by: ["insumoId", "almacenId", "tipo"],
      where: { createdAt: { gte: inicio, lt: fin }, ...filtroAlmacen },
      _sum: { cantidad: true },
    }),
    db.almacen.findMany({ select: { id: true, nombre: true } }),
  ]);

  type Acumulado = {
    almacenId: string | null;
    insumoId: string;
    inicial: number;
    compras: number;
    ventas: number;
    ajustes: number;
    anulaciones: number;
  };
  const acumulados = new Map<string, Acumulado>();
  const acumuladoDe = (idAlmacen: string | null, insumoId: string): Acumulado => {
    const clave = `${idAlmacen ?? ""}|${insumoId}`;
    let actual = acumulados.get(clave);
    if (!actual) {
      actual = { almacenId: idAlmacen, insumoId, inicial: 0, compras: 0, ventas: 0, ajustes: 0, anulaciones: 0 };
      acumulados.set(clave, actual);
    }
    return actual;
  };

  for (const f of antes) {
    acumuladoDe(f.almacenId, f.insumoId).inicial += Number(f._sum.cantidad ?? 0);
  }
  for (const f of enElRango) {
    const a = acumuladoDe(f.almacenId, f.insumoId);
    const cantidad = Number(f._sum.cantidad ?? 0);
    if (f.tipo === "compra") a.compras += cantidad;
    else if (f.tipo === "venta") a.ventas += cantidad;
    else if (f.tipo === "cancelacion") a.anulaciones += cantidad;
    else a.ajustes += cantidad;
  }

  // Los datos de cada insumo, en una sola consulta.
  const idsInsumos = [...new Set([...acumulados.values()].map((a) => a.insumoId))];
  const insumos =
    idsInsumos.length > 0
      ? await db.insumo.findMany({
          where: { id: { in: idsInsumos } },
          select: {
            id: true,
            nombre: true,
            unidadMedida: true,
            costoUnitario: true,
            categoria: { select: { nombre: true } },
          },
        })
      : [];
  const datosDeInsumo = new Map(insumos.map((i) => [i.id, i]));
  const nombreDeAlmacen = new Map(almacenes.map((a) => [a.id, a.nombre]));

  const filas: FilaAlmacenReporte[] = [];
  for (const a of acumulados.values()) {
    const inicial = redondear3(a.inicial);
    const compras = redondear3(a.compras);
    const ventas = redondear3(a.ventas);
    const ajustes = redondear3(a.ajustes);
    const anulaciones = redondear3(a.anulaciones);
    const final = redondear3(inicial + compras + ventas + ajustes + anulaciones);
    // Un insumo que no tuvo nada en el período y no tenía stock no aporta una fila.
    if (inicial === 0 && compras === 0 && ventas === 0 && ajustes === 0 && anulaciones === 0) continue;

    const insumo = datosDeInsumo.get(a.insumoId);
    if (!insumo) continue;
    const costoUnitario = insumo.costoUnitario != null ? Number(insumo.costoUnitario) : null;

    filas.push({
      almacenId: a.almacenId,
      almacen: a.almacenId ? (nombreDeAlmacen.get(a.almacenId) ?? "Almacén eliminado") : "Sin almacén",
      categoria: insumo.categoria?.nombre ?? "Sin categoría",
      insumo: insumo.nombre,
      unidad: etiquetaUnidadMedida(insumo.unidadMedida),
      inicial,
      compras,
      ventas,
      ajustes,
      anulaciones,
      final,
      costoUnitario,
      valorFinal: costoUnitario != null ? final * costoUnitario : null,
    });
  }

  // Por almacén (el "Sin almacén" al final), y adentro por categoría e insumo.
  filas.sort((x, y) => {
    if (x.almacenId === null && y.almacenId !== null) return 1;
    if (x.almacenId !== null && y.almacenId === null) return -1;
    return (
      x.almacen.localeCompare(y.almacen, "es") ||
      x.categoria.localeCompare(y.categoria, "es") ||
      x.insumo.localeCompare(y.insumo, "es")
    );
  });

  const resumen = new Map<string, ResumenAlmacenReporte>();
  for (const f of filas) {
    const r = resumen.get(f.almacen) ?? { almacen: f.almacen, insumos: 0, valorFinal: 0, sinCosto: 0 };
    if (f.final !== 0) {
      r.insumos += 1;
      if (f.valorFinal != null) r.valorFinal += f.valorFinal;
      else r.sinCosto += 1;
    }
    resumen.set(f.almacen, r);
  }
  const porAlmacen = [...resumen.values()];

  return {
    rango,
    almacenFiltrado: almacenId ? (nombreDeAlmacen.get(almacenId) ?? null) : null,
    filas,
    porAlmacen,
    totalValorFinal: porAlmacen.reduce((s, r) => s + r.valorFinal, 0),
  };
}
