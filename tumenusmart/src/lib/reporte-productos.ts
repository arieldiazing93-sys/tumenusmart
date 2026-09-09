import { prismaDelLocal } from "./prisma-local";
import { PEDIDO_REAL, type RangoFecha } from "./estadisticas";

export type FilaProductoReporte = {
  nombre: string;
  cantidad: number;
  /**
   * Precio de venta promedio del PRODUCTO EN SÍ, sin lo que aportaron sus
   * agregados. Sigue siendo un promedio ponderado del período (si el
   * precio del producto cambió a mitad de camino, no es "el" precio, es lo
   * que en promedio pagó cada uno — igual que siempre) pero ya NUNCA
   * incluye lo que se cobró por agregados: antes esto mezclaba "se vendió
   * solo" con "se vendió con agregados pagos", y un producto que se vendía
   * seguido con extras caros terminaba mostrando un precio (y una
   * ganancia) que no eran los suyos, sino mezclados con lo que en realidad
   * se vendió aparte.
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
  /**
   * Qué agregados fueron, desglosados por combinación exacta (el mismo
   * texto que ve el cliente en su comprobante, ej: "Borde relleno, Extra
   * queso"). Puede haber más de una fila si a este producto se le
   * vendieron distintas combinaciones en el período. Vacío si nunca se le
   * vendió nada con costo.
   */
  agregadosDetalle: {
    texto: string;
    cantidad: number;
    venta: number;
    costo: number | null;
    ganancia: number | null;
  }[];
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
 * La venta de cada producto normal nunca mezcla lo que aportaron sus
 * agregados en cada venta puntual — eso se calcula y se muestra por
 * separado (`ventaAgregados`, `costoAgregados`). Para la venta se usa el
 * monto REAL cobrado en cada pedido (histórico), nunca el precio de
 * catálogo de hoy — así el total no se corre si el precio cambió a mitad
 * del período. El costo sí usa siempre el costo ACTUAL del producto,
 * porque nunca se guardó una foto del costo del día que se vendió.
 * Los totales de categoría y del período suman producto + agregados
 * juntos: esa es la plata real que entró, y tiene que coincidir con lo que
 * muestran Estadísticas y Analytics.
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
      opcionesTexto: true,
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
    esCombo: boolean;
    // Costo del producto en sí: siempre el ACTUAL de catálogo (igual que
    // toda esta pantalla — nunca se guardó una foto del costo del día que
    // se vendió, por diseño).
    costoCatalogo: number | null;
    // Venta del producto SOLO, real e histórica — la suma de lo que
    // realmente se cobró en cada venta, menos lo que en cada una
    // correspondía a agregados. A propósito NO es "precio actual × cantidad":
    // si el precio del producto cambió a mitad del período, usar el precio
    // de HOY para todo el período haría que este total ya no coincida con
    // la plata real que sumaron Estadísticas y Analytics para las mismas
    // fechas. Restar los agregados de cada venta sí es seguro, porque eso
    // es un valor histórico guardado (`OrderItem.precioAgregados`), no uno
    // que se recalcula con datos de hoy.
    totalVentaBase: number;
    // Combo: no tiene precio de catálogo propio, así que se sigue
    // promediando la venta real del período (agregados del combo incluidos,
    // como siempre se hizo — separarlos ahí no tiene un "propio" del cual
    // separarse).
    totalVentaCombo: number;
    // Lo que aportaron los agregados de productos normales, aparte.
    totalVentaAgregados: number;
    totalCostoAgregadosConocido: number;
    costoAgregadosIncompleto: boolean;
    // Desglosado por combinación exacta de opciones elegidas (el texto que
    // ve el cliente en su comprobante), para poder mostrar CUÁL agregado
    // fue y no solo un número suelto.
    detalleAgregados: Map<
      string,
      { texto: string; cantidad: number; venta: number; costo: number; costoIncompleto: boolean }
    >;
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
      costoCatalogo: !esCombo && item.product?.costo != null ? Number(item.product.costo) : null,
      totalVentaBase: 0,
      totalVentaCombo: 0,
      totalVentaAgregados: 0,
      totalCostoAgregadosConocido: 0,
      costoAgregadosIncompleto: false,
      detalleAgregados: new Map(),
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
    } else {
      // Lo que de verdad se cobró por el producto en ESTA venta, sin la
      // parte de agregados — ambos son valores históricos guardados en el
      // pedido, no algo que dependa del catálogo de hoy.
      actual.totalVentaBase +=
        item.cantidad * (Number(item.precioUnitario) - Number(item.precioAgregados));
    }

    const costoAgregadosItem = item.costoAgregados != null ? Number(item.costoAgregados) : null;
    if (costoAgregadosItem != null) {
      actual.totalCostoAgregadosConocido += costoAgregadosItem * item.cantidad;
    } else {
      actual.costoAgregadosIncompleto = true;
    }

    // Desglose por combinación exacta — solo tiene sentido para productos
    // normales (los combos no separan agregados) y solo cuando de verdad
    // se pagó algo extra (una variante gratis elegida no es "un agregado
    // vendido").
    const precioAgregadosItem = Number(item.precioAgregados);
    if (!esCombo && precioAgregadosItem > 0) {
      const texto = item.opcionesTexto ?? "Agregados";
      const entrada = actual.detalleAgregados.get(texto) ?? {
        texto,
        cantidad: 0,
        venta: 0,
        costo: 0,
        costoIncompleto: false,
      };
      entrada.cantidad += item.cantidad;
      entrada.venta += item.cantidad * precioAgregadosItem;
      if (costoAgregadosItem != null) {
        entrada.costo += costoAgregadosItem * item.cantidad;
      } else {
        entrada.costoIncompleto = true;
      }
      actual.detalleAgregados.set(texto, entrada);
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

    // Venta del producto en sí: la real e histórica (sin agregados), no el
    // precio de catálogo de hoy — así coincide con Estadísticas aunque el
    // precio haya cambiado a mitad del período. Combo: el promedio
    // ponderado de siempre (agregados del combo ya incluidos ahí).
    const totalVenta = a.esCombo ? a.totalVentaCombo : a.totalVentaBase;
    const precioVentaUnitario = a.cantidad > 0 ? totalVenta / a.cantidad : 0;
    // El costo sí es siempre el ACTUAL de catálogo — ver la nota en
    // `costoCatalogo` más arriba.
    const costoUnitario = a.esCombo ? null : a.costoCatalogo;

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

    // Del mismo Map de más arriba, una fila por combinación — ordenadas de
    // la que más vendió a la que menos, igual criterio que las filas de
    // productos.
    const agregadosDetalle = [...a.detalleAgregados.values()]
      .map((d) => ({
        texto: d.texto,
        cantidad: d.cantidad,
        venta: d.venta,
        costo: d.costoIncompleto ? null : d.costo,
        ganancia: d.costoIncompleto ? null : d.venta - d.costo,
      }))
      .sort((x, y) => y.venta - x.venta);

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
      agregadosDetalle,
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
