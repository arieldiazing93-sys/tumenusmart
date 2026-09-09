import { prismaDelLocal } from "./prisma-local";
import { PEDIDO_REAL, type RangoFecha } from "./estadisticas";

export type FilaProductoReporte = {
  nombre: string;
  cantidad: number;
  /** Precio de venta promedio ponderado del período — si el precio cambió a
   * mitad de camino, no es "el" precio, es lo que en promedio pagó cada uno. */
  precioVentaUnitario: number;
  totalVenta: number;
  /**
   * Costo promedio por unidad = costo ACTUAL del producto + costo promedio
   * de los agregados vendidos con él. El del producto se lee siempre
   * actual (no el de cuando se vendió, el pedido no guarda esa foto); el
   * de los agregados sí queda fijado al momento de la venta (ver
   * `OrderItem.costoAgregados`) porque no hay otra forma de reconstruirlo
   * después. Null si ALGUNA venta de este producto en el período tiene
   * algo sin costo — un promedio con parte inventada sería peor que
   * avisar que falta.
   */
  costoUnitario: number | null;
  totalCosto: number | null;
  ganancia: number | null;
  /** Porcentaje: ganancia sobre venta. */
  margen: number | null;
};

export type CategoriaReporte = {
  categoriaId: string | null;
  categoriaNombre: string;
  filas: FilaProductoReporte[];
  totalCantidad: number;
  totalVenta: number;
  totalCosto: number | null;
  totalGanancia: number | null;
  /** true si algún producto de la categoría no tiene costo cargado — el
   * total de costo/ganancia de la categoría queda incompleto, no en cero. */
  costoIncompleto: boolean;
};

export type ReporteProductosVendidos = {
  categorias: CategoriaReporte[];
  totalGeneral: {
    cantidad: number;
    venta: number;
    costo: number | null;
    ganancia: number | null;
    costoIncompleto: boolean;
  };
};

/**
 * Productos vendidos en el período, agrupados por categoría, con costo,
 * margen y ganancia.
 *
 * Usa el mismo criterio de "venta real" que Estadísticas (PEDIDO_REAL, sin
 * cancelados) — un mismo pedido no puede contar como venta en una pantalla
 * y no contar en otra.
 *
 * Los combos "mitad y mitad" no tienen un producto único (`productId` nulo
 * en el ítem), así que no se les puede calcular costo ni categoría real:
 * caen todos juntos en una categoría aparte al final, con el costo marcado
 * como no disponible en vez de inventado.
 *
 * El costo de cada línea es el del producto (actual) MÁS el de los
 * agregados que se le eligieron en ESA venta puntual (`OrderItem.costoAgregados`,
 * ver el modelo). Antes solo se contaba el costo del producto: un
 * agregado pago (ej. una papa frita al lado de una milanesa) suma su
 * precio a la venta pero no restaba nada del costo, así que el margen de
 * ese producto salía inflado cada vez que se vendía con algo pago encima.
 */
export async function calcularReporteProductosVendidos(
  storeId: string,
  rango: RangoFecha
): Promise<ReporteProductosVendidos> {
  const db = prismaDelLocal(storeId);
  const items = await db.orderItem.findMany({
    where: {
      order: { createdAt: rango, estado: { not: "cancelado" }, ...PEDIDO_REAL },
    },
    select: {
      productId: true,
      nombreProducto: true,
      cantidad: true,
      precioUnitario: true,
      costoAgregados: true,
      product: {
        select: {
          costo: true,
          category: { select: { id: true, nombre: true, orden: true } },
        },
      },
    },
  });

  type Acumulado = {
    nombre: string;
    cantidad: number;
    totalVenta: number;
    totalCostoConocido: number;
    /** true si al menos una venta de este producto tiene el costo completo. */
    hayAlgunCosto: boolean;
    /** true si al menos una venta de este producto tiene ALGO sin costo
     * (el producto en sí, o alguno de sus agregados). */
    costoIncompleto: boolean;
    categoriaId: string | null;
    categoriaNombre: string;
    categoriaOrden: number;
  };

  // La clave es el producto si lo tiene, o el nombre del combo si no — así
  // dos combos "Mitad Napolitana / Mitad Muzzarella" pedidos por separado se
  // suman entre sí, sin mezclarse con un producto real de nombre parecido.
  const acumulado = new Map<string, Acumulado>();
  const SIN_CATEGORIA = "__combos__";

  for (const item of items) {
    const clave = item.productId ?? `combo:${item.nombreProducto}`;
    const actual = acumulado.get(clave) ?? {
      nombre: item.nombreProducto,
      cantidad: 0,
      totalVenta: 0,
      totalCostoConocido: 0,
      hayAlgunCosto: false,
      costoIncompleto: false,
      categoriaId: item.product?.category?.id ?? null,
      categoriaNombre: item.product?.category?.nombre ?? "Mitad y mitad / combos",
      categoriaOrden: item.product?.category?.orden ?? Number.MAX_SAFE_INTEGER,
    };
    actual.cantidad += item.cantidad;
    actual.totalVenta += item.cantidad * Number(item.precioUnitario);

    const costoProducto = item.product?.costo != null ? Number(item.product.costo) : null;
    const costoAgregados = item.costoAgregados != null ? Number(item.costoAgregados) : null;
    if (costoProducto != null && costoAgregados != null) {
      actual.totalCostoConocido += (costoProducto + costoAgregados) * item.cantidad;
      actual.hayAlgunCosto = true;
    } else {
      actual.costoIncompleto = true;
    }

    acumulado.set(clave, actual);
  }

  const categoriasMap = new Map<
    string,
    Omit<CategoriaReporte, "totalCosto" | "totalGanancia" | "totalVenta"> & {
      totalCostoConocido: number;
      hayAlgunCosto: boolean;
      orden: number;
    }
  >();

  for (const a of acumulado.values()) {
    // Parcial-pero-avisado, no todo-o-nada: si de 10 ventas de este
    // producto 8 tienen el costo completo y 2 no (les faltó cargar el
    // costo de un agregado nuevo, por ejemplo), se muestra lo que se sabe
    // de esas 8 y se marca `costoIncompleto` — perder el número entero por
    // un dato suelto sería peor que mostrarlo parcial y avisado.
    const totalCosto = a.hayAlgunCosto ? a.totalCostoConocido : null;
    const costoUnitario = totalCosto != null && a.cantidad > 0 ? totalCosto / a.cantidad : null;
    const ganancia = totalCosto != null ? a.totalVenta - totalCosto : null;
    const margen = ganancia != null && a.totalVenta > 0 ? (ganancia / a.totalVenta) * 100 : null;

    const claveCategoria = a.categoriaId ?? SIN_CATEGORIA;
    let categoria = categoriasMap.get(claveCategoria);
    if (!categoria) {
      categoria = {
        categoriaId: a.categoriaId,
        categoriaNombre: a.categoriaNombre,
        filas: [],
        totalCantidad: 0,
        totalCostoConocido: 0,
        hayAlgunCosto: false,
        costoIncompleto: false,
        orden: a.categoriaOrden,
      };
      categoriasMap.set(claveCategoria, categoria);
    }

    categoria.filas.push({
      nombre: a.nombre,
      cantidad: a.cantidad,
      precioVentaUnitario: a.cantidad > 0 ? a.totalVenta / a.cantidad : 0,
      totalVenta: a.totalVenta,
      costoUnitario,
      totalCosto,
      ganancia,
      margen,
    });
    categoria.totalCantidad += a.cantidad;
    if (totalCosto != null) categoria.totalCostoConocido += totalCosto;
    if (a.hayAlgunCosto) categoria.hayAlgunCosto = true;
    if (a.costoIncompleto) categoria.costoIncompleto = true;
  }

  const categorias: CategoriaReporte[] = [...categoriasMap.values()]
    .sort((a, b) => a.orden - b.orden)
    .map((c) => {
      const totalVenta = c.filas.reduce((s, f) => s + f.totalVenta, 0);
      // Productos más rentables primero: acá interesa dónde está la plata,
      // no solo qué se movió más.
      const filas = [...c.filas].sort(
        (a, b) => (b.ganancia ?? -Infinity) - (a.ganancia ?? -Infinity)
      );
      const totalCosto = c.hayAlgunCosto ? c.totalCostoConocido : null;
      return {
        categoriaId: c.categoriaId,
        categoriaNombre: c.categoriaNombre,
        filas,
        totalCantidad: c.totalCantidad,
        totalVenta,
        totalCosto,
        totalGanancia: totalCosto != null ? totalVenta - totalCosto : null,
        costoIncompleto: c.costoIncompleto,
      };
    });

  const cantidad = categorias.reduce((s, c) => s + c.totalCantidad, 0);
  const venta = categorias.reduce((s, c) => s + c.totalVenta, 0);
  const hayAlgunCostoGeneral = categorias.some((c) => c.totalCosto != null);
  const costo = hayAlgunCostoGeneral
    ? categorias.reduce((s, c) => s + (c.totalCosto ?? 0), 0)
    : null;
  const ganancia = costo != null ? venta - costo : null;
  const costoIncompleto = categorias.some((c) => c.costoIncompleto);

  return { categorias, totalGeneral: { cantidad, venta, costo, ganancia, costoIncompleto } };
}
