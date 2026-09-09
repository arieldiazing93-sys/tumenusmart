import { prismaDelLocal } from "./prisma-local";
import { PEDIDO_REAL, type RangoFecha } from "./estadisticas";

export type FilaProductoReporte = {
  nombre: string;
  cantidad: number;
  /**
   * Precio de venta del PRODUCTO EN SÍ — para un producto normal, es
   * siempre su precio de catálogo actual, sin importar si esa venta puntual
   * llevó agregados pagos o no. Antes esto era un promedio entre "se vendió
   * solo" y "se vendió con agregados", y un producto que se vendía siempre
   * con extras caros terminaba mostrando un precio (y una ganancia) que no
   * eran los suyos, sino mezclados con lo que en realidad se vendió aparte.
   *
   * Para un combo "mitad y mitad" (que no tiene un precio de catálogo
   * único, depende de qué dos mitades se combinaron cada vez) sigue siendo
   * el promedio ponderado del período, como antes — ahí no hay un número
   * "propio" del cual separarse.
   */
  precioVentaUnitario: number;
  /** Costo ACTUAL del producto en sí (sin agregados). Null si el producto
   * nunca tuvo costo cargado. Siempre null para combos. */
  costoUnitario: number | null;
  /** Venta del producto solo = precioVentaUnitario × cantidad. */
  totalVenta: number;
  totalCosto: number | null;
  /** Ganancia del producto solo, sin contar lo que aportaron sus agregados. */
  ganancia: number | null;
  /** Porcentaje: ganancia sobre venta, del producto solo. */
  margen: number | null;
  /**
   * Lo que aportaron los agregados vendidos junto con este producto (papas,
   * extras...), aparte del producto en sí. 0 si nunca se le vendió ninguno.
   * `costoAgregados` es null si se vendió alguno sin costo cargado — mismo
   * criterio que el resto del reporte: avisar que falta el dato en vez de
   * mezclarlo sin avisar.
   */
  ventaAgregados: number;
  costoAgregados: number | null;
  gananciaAgregados: number | null;
};

export type CategoriaReporte = {
  categoriaId: string | null;
  categoriaNombre: string;
  filas: FilaProductoReporte[];
  totalCantidad: number;
  /** Venta REAL de la categoría — producto más agregados, la plata que
   * realmente entró en el período (coincide con Estadísticas). */
  totalVenta: number;
  totalCosto: number | null;
  totalGanancia: number | null;
  /** true si algo de la categoría (un producto o un agregado suyo) no tiene
   * costo cargado — el total de costo/ganancia queda incompleto, no en cero. */
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
 * El precio/costo de cada producto normal es siempre el suyo (de catálogo),
 * nunca mezclado con lo que aportaron sus agregados en cada venta puntual
 * — eso se calcula y se muestra por separado (`ventaAgregados`,
 * `costoAgregados`). Los totales de categoría y del período sí suman las
 * dos cosas juntas: esa es la plata real que entró, y tiene que coincidir
 * con lo que muestran Estadísticas y Analytics.
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
      precioAgregados: true,
      costoAgregados: true,
      product: {
        select: {
          precio: true,
          costo: true,
          category: { select: { id: true, nombre: true, orden: true } },
        },
      },
    },
  });

  type Acumulado = {
    nombre: string;
    cantidad: number;
    esCombo: boolean;
    // Producto normal: precio/costo de catálogo — fijos, no dependen de
    // qué se vendió en cada línea puntual.
    precioCatalogo: number | null;
    costoCatalogo: number | null;
    // Combo: no tiene precio de catálogo propio, así que se sigue
    // promediando la venta real del período (agregados del combo incluidos,
    // como siempre se hizo — separarlos ahí no tiene un "propio" del cual
    // separarse).
    totalVentaCombo: number;
    // Lo que aportaron los agregados de productos normales, aparte.
    totalVentaAgregados: number;
    totalCostoAgregadosConocido: number;
    costoAgregadosIncompleto: boolean;
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
    const esCombo = !item.productId;
    const actual = acumulado.get(clave) ?? {
      nombre: item.nombreProducto,
      cantidad: 0,
      esCombo,
      precioCatalogo: !esCombo && item.product ? Number(item.product.precio) : null,
      costoCatalogo: !esCombo && item.product?.costo != null ? Number(item.product.costo) : null,
      totalVentaCombo: 0,
      totalVentaAgregados: 0,
      totalCostoAgregadosConocido: 0,
      costoAgregadosIncompleto: false,
      categoriaId: item.product?.category?.id ?? null,
      categoriaNombre: item.product?.category?.nombre ?? "Mitad y mitad / combos",
      categoriaOrden: item.product?.category?.orden ?? Number.MAX_SAFE_INTEGER,
    };

    actual.cantidad += item.cantidad;
    actual.totalVentaAgregados += item.cantidad * Number(item.precioAgregados);
    if (esCombo) {
      // El combo no separa agregados: su "venta total" ya los incluye,
      // igual que siempre.
      actual.totalVentaCombo += item.cantidad * Number(item.precioUnitario);
    }

    const costoAgregadosItem = item.costoAgregados != null ? Number(item.costoAgregados) : null;
    if (costoAgregadosItem != null) {
      actual.totalCostoAgregadosConocido += costoAgregadosItem * item.cantidad;
    } else {
      actual.costoAgregadosIncompleto = true;
    }

    acumulado.set(clave, actual);
  }

  const categoriasMap = new Map<
    string,
    Omit<CategoriaReporte, "totalCosto" | "totalGanancia" | "totalVenta"> & {
      totalVentaReal: number;
      totalCostoConocido: number;
      hayAlgunCosto: boolean;
      orden: number;
    }
  >();

  for (const a of acumulado.values()) {
    // Agregados: siempre se conoce cuánto vendieron; el costo puede faltar.
    const ventaAgregados = a.esCombo ? 0 : a.totalVentaAgregados;
    const costoAgregados = a.esCombo || a.costoAgregadosIncompleto ? null : a.totalCostoAgregadosConocido;
    const gananciaAgregados = costoAgregados != null ? ventaAgregados - costoAgregados : null;

    // Producto en sí: precio/costo fijos de catálogo. Combo: el promedio
    // ponderado de siempre (agregados del combo ya incluidos ahí).
    const precioVentaUnitario = a.esCombo
      ? a.cantidad > 0
        ? a.totalVentaCombo / a.cantidad
        : 0
      : a.precioCatalogo ?? 0;
    const costoUnitario = a.esCombo ? null : a.costoCatalogo;

    const totalVenta = precioVentaUnitario * a.cantidad;
    const totalCosto = costoUnitario != null ? costoUnitario * a.cantidad : null;
    const ganancia = totalCosto != null ? totalVenta - totalCosto : null;
    const margen = ganancia != null && totalVenta > 0 ? (ganancia / totalVenta) * 100 : null;

    const claveCategoria = a.categoriaId ?? SIN_CATEGORIA;
    let categoria = categoriasMap.get(claveCategoria);
    if (!categoria) {
      categoria = {
        categoriaId: a.categoriaId,
        categoriaNombre: a.categoriaNombre,
        filas: [],
        totalCantidad: 0,
        totalVentaReal: 0,
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
      precioVentaUnitario,
      costoUnitario,
      totalVenta,
      totalCosto,
      ganancia,
      margen,
      ventaAgregados,
      costoAgregados,
      gananciaAgregados,
    });

    categoria.totalCantidad += a.cantidad;
    // El total de categoría es la plata REAL: producto más agregados.
    categoria.totalVentaReal += totalVenta + ventaAgregados;
    if (totalCosto != null && costoAgregados != null) {
      categoria.totalCostoConocido += totalCosto + costoAgregados;
      categoria.hayAlgunCosto = true;
    } else {
      categoria.costoIncompleto = true;
    }
  }

  const categorias: CategoriaReporte[] = [...categoriasMap.values()]
    .sort((a, b) => a.orden - b.orden)
    .map((c) => {
      // Productos más rentables primero: acá interesa dónde está la plata,
      // no solo qué se movió más. La ganancia de cada fila incluye la de
      // sus agregados, para que el orden refleje lo que en verdad conviene
      // empujar (un producto con extras rentables sigue siendo un producto
      // que conviene empujar).
      const filas = [...c.filas].sort((a, b) => {
        const gananciaA = a.ganancia != null ? a.ganancia + (a.gananciaAgregados ?? 0) : -Infinity;
        const gananciaB = b.ganancia != null ? b.ganancia + (b.gananciaAgregados ?? 0) : -Infinity;
        return gananciaB - gananciaA;
      });
      const totalCosto = c.hayAlgunCosto ? c.totalCostoConocido : null;
      return {
        categoriaId: c.categoriaId,
        categoriaNombre: c.categoriaNombre,
        filas,
        totalCantidad: c.totalCantidad,
        totalVenta: c.totalVentaReal,
        totalCosto,
        totalGanancia: totalCosto != null ? c.totalVentaReal - totalCosto : null,
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
