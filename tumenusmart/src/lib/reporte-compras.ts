import { prismaDelLocal } from "./prisma-local";
import { calcularCompra } from "./compra-calculo";
import { rangoDeDias, limitesDelRango, fechaDeDia, diaEnTexto, type RangoDias } from "./rango-dias";
import { etiquetaUnidadMedida } from "./unidad-medida";

/**
 * Reporte de compras: lo que se compró en un rango de fechas, con su detalle.
 *
 * Las fechas de una compra son el DÍA de la factura (se guardan a medianoche
 * UTC, ver registrarCompra), así que el rango se maneja también en días
 * "YYYY-MM-DD", sin horas ni zonas horarias, y ambos extremos entran. Las
 * compras canceladas no se cuentan: esa plata no se gastó.
 *
 * Lo usan el Excel (compras/exportar) y la versión imprimible/PDF
 * (compras/imprimir), para que los dos digan siempre lo mismo.
 */

export type RangoCompras = RangoDias;

// Los mismos helpers de rango que usa el reporte de Gastos (ver rango-dias.ts).
export { rangoDeDias as rangoDeCompras, fechaDeDia as fechaDeCompra, diaEnTexto };

export type LineaReporteCompra = {
  insumo: string;
  almacen: string;
  /** Cuántas unidades de compra (ej: 10 packs). */
  cantidad: number;
  /** Unidad en la que se cuenta el stock (ej: "Unidad"). */
  unidadMedida: string;
  /** Unidades de stock que trae cada unidad de compra (ej: 12). */
  rendimiento: number;
  /** cantidad × rendimiento: lo que entró al stock. */
  unidadesAlStock: number;
  /** Costo de una unidad de compra, sin IVA ni descuentos. */
  costoUnitario: number;
  descuentoPorcentaje: number | null;
  /** "gravado10" | "gravado5" | "exento". */
  iva: string;
  /** Importe de la línea sin IVA, con su descuento. */
  importe: number;
};

export type CompraReporte = {
  id: string;
  fecha: Date;
  proveedor: string;
  folio: string | null;
  condicionPago: "contado" | "credito";
  vencimiento: Date | null;
  subtotal: number;
  descuentoGeneralPorcentaje: number | null;
  descuentoGeneral: number;
  neto: number;
  iva: number;
  total: number;
  notas: string | null;
  lineas: LineaReporteCompra[];
};

export type ProveedorReporte = {
  proveedor: string;
  compras: number;
  neto: number;
  iva: number;
  total: number;
};

export type ReporteCompras = {
  rango: RangoCompras;
  /** Nombre del proveedor por el que se filtró, si se filtró. */
  proveedorFiltrado: string | null;
  compras: CompraReporte[];
  totales: {
    compras: number;
    subtotal: number;
    descuentoGeneral: number;
    neto: number;
    iva: number;
    total: number;
    contado: number;
    credito: number;
  };
  porProveedor: ProveedorReporte[];
};

export async function calcularReporteCompras(
  storeId: string,
  rango: RangoCompras,
  proveedorId?: string | null
): Promise<ReporteCompras> {
  const db = prismaDelLocal(storeId);

  const [compras, proveedor] = await Promise.all([
    db.compra.findMany({
      where: {
        cancelada: false,
        fecha: limitesDelRango(rango),
        ...(proveedorId ? { proveedorId } : {}),
      },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      include: {
        proveedor: { select: { nombre: true } },
        items: {
          orderBy: { id: "asc" },
          include: {
            insumo: { select: { nombre: true, unidadMedida: true } },
            almacen: { select: { nombre: true } },
          },
        },
      },
    }),
    proveedorId
      ? db.proveedor.findUnique({ where: { id: proveedorId }, select: { nombre: true } })
      : Promise.resolve(null),
  ]);

  const filas: CompraReporte[] = compras.map((c) => {
    const descuentoGeneralPorcentaje =
      c.descuentoGeneralPorcentaje != null ? Number(c.descuentoGeneralPorcentaje) : null;

    // Se parte del importe ya guardado de cada línea, igual que el detalle de
    // la compra: recalcular desde el costo unitario (redondeado a centavos)
    // podría desviarse un guaraní del total guardado.
    const calculo = calcularCompra(
      c.items.map((i) => ({
        cantidad: 1,
        costoUnitario: Number(i.subtotal),
        descuentoPorcentaje: 0,
        iva: i.iva,
      })),
      descuentoGeneralPorcentaje ?? 0
    );

    return {
      id: c.id,
      fecha: c.fecha,
      proveedor: c.proveedor?.nombre ?? "Sin proveedor",
      folio: c.numeroComprobante,
      condicionPago: c.condicionPago === "credito" ? "credito" : "contado",
      vencimiento: c.fechaVencimiento,
      subtotal: calculo.subtotal,
      descuentoGeneralPorcentaje,
      descuentoGeneral: calculo.descuentoGeneral,
      neto: calculo.neto,
      iva: calculo.iva,
      total: Number(c.total),
      notas: c.notas,
      lineas: c.items.map((i) => {
        const cantidad = Number(i.cantidad);
        const rendimiento = Number(i.rendimiento);
        return {
          insumo: i.insumo.nombre,
          almacen: i.almacen?.nombre ?? "—",
          cantidad,
          unidadMedida: etiquetaUnidadMedida(i.insumo.unidadMedida),
          rendimiento,
          unidadesAlStock: Math.round(cantidad * rendimiento * 1000) / 1000,
          costoUnitario: Number(i.costoUnitario),
          descuentoPorcentaje: i.descuentoPorcentaje != null ? Number(i.descuentoPorcentaje) : null,
          iva: i.iva,
          importe: Number(i.subtotal),
        };
      }),
    };
  });

  const totales = {
    compras: filas.length,
    subtotal: 0,
    descuentoGeneral: 0,
    neto: 0,
    iva: 0,
    total: 0,
    contado: 0,
    credito: 0,
  };
  const porProveedor = new Map<string, ProveedorReporte>();
  for (const f of filas) {
    totales.subtotal += f.subtotal;
    totales.descuentoGeneral += f.descuentoGeneral;
    totales.neto += f.neto;
    totales.iva += f.iva;
    totales.total += f.total;
    if (f.condicionPago === "credito") totales.credito += f.total;
    else totales.contado += f.total;

    const acumulado = porProveedor.get(f.proveedor) ?? { proveedor: f.proveedor, compras: 0, neto: 0, iva: 0, total: 0 };
    acumulado.compras += 1;
    acumulado.neto += f.neto;
    acumulado.iva += f.iva;
    acumulado.total += f.total;
    porProveedor.set(f.proveedor, acumulado);
  }

  return {
    rango,
    proveedorFiltrado: proveedor?.nombre ?? null,
    compras: filas,
    totales,
    porProveedor: [...porProveedor.values()].sort((a, b) => b.total - a.total),
  };
}
