import { prismaDelLocal } from "./prisma-local";
import { PEDIDO_REAL, type RangoFecha } from "./estadisticas";
import { costoDelProducto } from "./costo-receta";
import { aplanarReceta } from "./insumo-elaborado";
import { cargarElaborados } from "./cargar-elaborados";
import { factorDeDescuento } from "./descuento-venta";
import { TASAS_IVA } from "./iva";

/**
 * Cuánto queda de un monto CON IVA al sacarle el impuesto: 10.000 con IVA al
 * 10% son 9.090,91 sin IVA (÷ 1,10); al 5%, ÷ 1,05; exento queda igual. Es la
 * misma extracción que hace la factura (10% = total ÷ 11).
 *
 * Por qué acá todo va SIN IVA: el precio de venta que se le cobra al cliente
 * lleva el IVA adentro, pero ese impuesto no es del negocio — se le paga al
 * fisco. El costo de los insumos, en cambio, se guarda sin IVA (el de las
 * compras se recupera como crédito fiscal). Restar uno del otro sin igualar
 * las bases inflaba la ganancia. Con las dos cosas sin IVA la cuenta cierra:
 * ganancia = venta sin IVA - costo.
 */
function factorSinIva(iva: string): number {
  const porcentaje = TASAS_IVA.find((t) => t.valor === iva)?.porcentaje ?? 10;
  return 1 / (1 + porcentaje / 100);
}

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
  /** Costo del producto en sí (sin agregados) por unidad: el promedio de lo
   * que costó en cada venta del período (ver `costoProducto` del ítem). En un
   * combo mitad y mitad incluye lo de sus agregados, porque su venta no los
   * separa. Null si a alguna venta le falta el costo. */
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
    /** Porcentaje: ganancia sobre venta, de este agregado solo. */
    margen: number | null;
  }[];
};

export type CategoriaReporte = {
  categoriaId: string | null;
  categoriaNombre: string;
  filas: FilaProductoReporte[];
  totalCantidad: number;
  /** Lo cobrado en la categoría TAL CUAL, con IVA — producto más agregados. Es
   * la cifra que coincide con Estadísticas; sirve para reconciliar. */
  totalVentaConIva: number;
  /** Venta de la categoría SIN IVA — producto más agregados. Es la base de la
   * ganancia. */
  totalVenta: number;
  /** Venta SIN IVA de solo las filas cuyo costo se conoce por completo (el
   * producto y sus agregados): es la base de `totalCosto` y `totalGanancia`. Si
   * a algún producto le falta el costo, esta cifra es menor que `totalVenta`:
   * la ganancia se calcula solo sobre lo que se puede costear, en vez de contar
   * como ganancia pura la venta de lo que no tiene costo. */
  totalVentaConCosto: number;
  totalCosto: number | null;
  totalGanancia: number | null;
  /** true si algo de la categoría (un producto o un agregado suyo) no tiene
   * costo — no tiene receta, o a algún insumo de su receta todavía no se le
   * registró una compra. El total de costo/ganancia queda incompleto, no en cero. */
  costoIncompleto: boolean;
};

export type ReporteProductosVendidos = {
  categorias: CategoriaReporte[];
  totalGeneral: {
    cantidad: number;
    /** Lo cobrado TAL CUAL, con IVA: coincide con Estadísticas y Analytics. */
    ventaConIva: number;
    /** El IVA que va incluido en lo cobrado (ventaConIva - venta): se le paga al fisco. */
    iva: number;
    /** Venta SIN IVA de todo lo vendido. */
    venta: number;
    /** Venta SIN IVA de lo que se pudo costear por completo: la base de `costo`
     * y `ganancia`. Igual a `venta` cuando todo tiene costo; menor si no. */
    ventaConCosto: number;
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
 * y no contar en otra. También incluye las ventas de mostrador (`VentaPos`):
 * los dos tipos de ítem guardan lo mismo (precio, IVA, cuánto de eso fue de
 * agregados, y el costo del producto y de los agregados al vender), así que se
 * procesan juntos.
 *
 * Los combos "mitad y mitad" no tienen un producto único (`productId` nulo
 * en el ítem), así que caen todos juntos en una categoría aparte al final.
 * Su costo sí se conoce: al vender se guarda la mitad del costo de cada lado.
 *
 * La venta de cada producto normal nunca mezcla lo que aportaron sus
 * agregados en cada venta puntual — eso se calcula y se muestra por
 * separado (`ventaAgregados`, `costoAgregados`). Para la venta se usa el
 * monto REAL cobrado en cada pedido (histórico), nunca el precio de
 * catálogo de hoy — así el total no se corre si el precio cambió a mitad
 * del período.
 *
 * TODO va SIN IVA (venta, costo, ganancia, margen), salvo `ventaConIva`, que
 * es lo cobrado tal cual y sirve para reconciliar: coincide con lo que
 * muestran Estadísticas y Analytics para las mismas fechas. La diferencia
 * entre las dos es el IVA de la venta (`totalGeneral.iva`). Ver
 * `factorSinIva` para el porqué.
 *
 * El costo sale de la receta de cada producto (ver costo-receta.ts), con lo
 * que costó cada insumo en su última compra. Se usa el costo GUARDADO en cada
 * ítem al momento de la venta (`costoProducto`, `costoAgregados`): así un
 * período viejo no cambia cuando cambian los precios de compra. Si un ítem no
 * lo tiene guardado (ventas anteriores a que se guardara, o de un producto que
 * todavía no tenía receta), se usa el costo de hoy del producto; y si tampoco
 * hay, queda sin costo — el reporte lo avisa en vez de inventarlo.
 */
export async function calcularReporteProductosVendidos(
  storeId: string,
  rango: RangoFecha
): Promise<ReporteProductosVendidos> {
  const db = prismaDelLocal(storeId);
  const [items, itemsPos] = await Promise.all([
    db.orderItem.findMany({
      where: {
        order: { createdAt: rango, estado: { not: "cancelado" }, ...PEDIDO_REAL },
      },
      select: {
        productId: true,
        nombreProducto: true,
        cantidad: true,
        precioUnitario: true,
        iva: true,
        precioAgregados: true,
        costoAgregados: true,
        costoProducto: true,
        opcionesTexto: true,
        product: {
          select: {
            costo: true,
            // El costo de hoy, para lo vendido antes de que se guardara el costo en el ítem.
            receta: { select: { insumoId: true, cantidad: true, insumo: { select: { costoUnitario: true } } } },
            category: { select: { id: true, nombre: true, orden: true } },
          },
        },
      },
    }),
    db.ventaPosItem.findMany({
      where: { ventaPos: { creadoEn: rango, cancelada: false } },
      select: {
        productId: true,
        nombreProducto: true,
        cantidad: true,
        precioUnitario: true,
        iva: true,
        precioAgregados: true,
        costoAgregados: true,
        costoProducto: true,
        opcionesTexto: true,
        // Para repartir entre los ítems el descuento general de la cuenta.
        ventaPos: { select: { total: true, descuento: true } },
        product: {
          select: {
            costo: true,
            receta: { select: { insumoId: true, cantidad: true, insumo: { select: { costoUnitario: true } } } },
            category: { select: { id: true, nombre: true, orden: true } },
          },
        },
      },
    }),
  ]);
  // Una receta que lleva una preparación (salsa, masa…) se costea con los insumos con que se hace.
  const elaborados = await cargarElaborados(storeId);

  type Acumulado = {
    nombre: string;
    cantidad: number;
    esCombo: boolean;
    // Lo cobrado por este producto (con sus agregados) TAL CUAL, con IVA: es
    // la plata que entró y la que muestran Estadísticas y Analytics. Solo sirve
    // para reconciliar contra esas pantallas — todo lo demás de acá abajo
    // (venta, ganancia, margen) va SIN IVA, ver `factorSinIva`.
    ventaConIva: number;
    // Costo del producto en sí, sumado venta por venta (costo por unidad ×
    // unidades de esa venta): el guardado al vender, o el de hoy si no había.
    totalCostoProducto: number;
    // true si alguna venta no tenía costo ni guardado ni de hoy.
    costoProductoIncompleto: boolean;
    // Venta del producto SOLO, real e histórica — la suma de lo que
    // realmente se cobró en cada venta, menos lo que en cada una
    // correspondía a agregados. A propósito NO es "precio actual × cantidad":
    // si el precio del producto cambió a mitad del período, usar el precio
    // de HOY para todo el período haría que este total ya no coincida con
    // la plata real que sumaron Estadísticas y Analytics para las mismas
    // fechas. Restar los agregados de cada venta sí es seguro, porque eso
    // es un valor histórico guardado (`precioAgregados`), no uno que se
    // recalcula con datos de hoy.
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

  // Los ítems del mostrador guardan su precio SIN el descuento general de la
  // cuenta (así el ticket muestra lo que se pidió). Acá se lo reparte entre
  // todos en proporción, para que la venta del reporte sea la plata que de
  // verdad entró — la misma que suman Estadísticas y Analytics con `total`.
  const todosLosItems = [
    ...items.map((i) => ({ ...i, factorDescuento: 1 })),
    ...itemsPos.map(({ ventaPos, ...i }) => ({
      ...i,
      factorDescuento: factorDeDescuento(Number(ventaPos.total), Number(ventaPos.descuento)),
    })),
  ];

  for (const item of todosLosItems) {
    const clave = item.productId ?? `combo:${item.nombreProducto}`;
    const esCombo = !item.productId;
    const actual: Acumulado = acumulado.get(clave) ?? {
      nombre: item.nombreProducto,
      cantidad: 0,
      esCombo,
      ventaConIva: 0,
      totalCostoProducto: 0,
      costoProductoIncompleto: false,
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

    // La tasa de IVA es la que tenía el producto AL VENDER (snapshot en el
    // ítem). Los agregados comparten la del producto: no se separan en su
    // propia línea fiscal.
    const sinIva = factorSinIva(item.iva);
    const precioUnitario = Number(item.precioUnitario) * item.factorDescuento;
    const precioAgregadosItem = Number(item.precioAgregados) * item.factorDescuento;

    actual.cantidad += item.cantidad;
    actual.ventaConIva += item.cantidad * precioUnitario;
    actual.totalVentaAgregados += item.cantidad * precioAgregadosItem * sinIva;
    if (esCombo) {
      // El combo no separa agregados: su "venta total" ya los incluye,
      // igual que siempre.
      actual.totalVentaCombo += item.cantidad * precioUnitario * sinIva;
    } else {
      // Lo que de verdad se cobró por el producto en ESTA venta, sin la
      // parte de agregados — ambos son valores históricos guardados en el
      // ítem, no algo que dependa del catálogo de hoy.
      actual.totalVentaBase += item.cantidad * (precioUnitario - precioAgregadosItem) * sinIva;
    }

    // Costo del producto: el que quedó guardado al vender; si no lo hay
    // (ventas anteriores, o un producto que todavía no tenía receta), el de
    // hoy. Un combo no tiene "costo de hoy": sin el guardado, queda sin costo.
    const costoGuardado = item.costoProducto != null ? Number(item.costoProducto) : null;
    const costoDeHoy =
      !esCombo && item.product
        ? costoDelProducto(item.product.costo, aplanarReceta(item.product.receta, elaborados))
        : null;
    const costoPorUnidad = costoGuardado ?? costoDeHoy;
    if (costoPorUnidad != null) {
      actual.totalCostoProducto += costoPorUnidad * item.cantidad;
    } else {
      actual.costoProductoIncompleto = true;
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
      entrada.venta += item.cantidad * precioAgregadosItem * sinIva;
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
    Omit<CategoriaReporte, "totalCosto" | "totalGanancia" | "totalVenta" | "totalVentaConIva" | "totalVentaConCosto"> & {
      totalVentaReal: number;
      totalVentaConIvaAcumulada: number;
      ventaConCostoConocido: number;
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

    // Costo del producto en sí. En un combo la venta ya trae los agregados
    // adentro (no se separan), así que su costo se suma acá: si a alguno le
    // falta el costo, el combo entero queda sin costo.
    const costoCompleto = !a.costoProductoIncompleto && (!a.esCombo || !a.costoAgregadosIncompleto);
    const totalCosto = costoCompleto
      ? a.totalCostoProducto + (a.esCombo ? a.totalCostoAgregadosConocido : 0)
      : null;
    const costoUnitario = totalCosto != null && a.cantidad > 0 ? totalCosto / a.cantidad : null;
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
        totalVentaConIvaAcumulada: 0,
        ventaConCostoConocido: 0,
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
      .map((d) => {
        const costo = d.costoIncompleto ? null : d.costo;
        const ganancia = costo != null ? d.venta - costo : null;
        const margen = ganancia != null && d.venta > 0 ? (ganancia / d.venta) * 100 : null;
        return { texto: d.texto, cantidad: d.cantidad, venta: d.venta, costo, ganancia, margen };
      })
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
    // El total de categoría es la plata del período: producto más agregados.
    categoria.totalVentaReal += totalVenta + ventaAgregados;
    categoria.totalVentaConIvaAcumulada += a.ventaConIva;
    // Una fila entra al costo y a la ganancia solo si se conoce TODO su costo:
    // el del producto y, si no es combo, el de sus agregados (en un combo ya va
    // dentro de `totalCosto`).
    if (totalCosto != null && (a.esCombo || costoAgregados != null)) {
      categoria.totalCostoConocido += totalCosto + (costoAgregados ?? 0);
      categoria.ventaConCostoConocido += totalVenta + ventaAgregados;
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
        totalVentaConIva: c.totalVentaConIvaAcumulada,
        totalVenta: c.totalVentaReal,
        totalVentaConCosto: c.ventaConCostoConocido,
        totalCosto,
        // Ganancia solo sobre lo que tiene costo: restarle el costo conocido a TODA la
        // venta contaba como ganancia pura la de los productos sin costo.
        totalGanancia: totalCosto != null ? c.ventaConCostoConocido - totalCosto : null,
        costoIncompleto: c.costoIncompleto,
      };
    });

  const cantidad = categorias.reduce((s, c) => s + c.totalCantidad, 0);
  const ventaConIva = categorias.reduce((s, c) => s + c.totalVentaConIva, 0);
  const venta = categorias.reduce((s, c) => s + c.totalVenta, 0);
  const ventaConCosto = categorias.reduce((s, c) => s + c.totalVentaConCosto, 0);
  const hayAlgunCostoGeneral = categorias.some((c) => c.totalCosto != null);
  const costo = hayAlgunCostoGeneral
    ? categorias.reduce((s, c) => s + (c.totalCosto ?? 0), 0)
    : null;
  // Igual que en cada categoría: la ganancia es sobre lo que se pudo costear.
  const ganancia = costo != null ? ventaConCosto - costo : null;
  const costoIncompleto = categorias.some((c) => c.costoIncompleto);

  return {
    categorias,
    totalGeneral: {
      cantidad,
      ventaConIva,
      iva: ventaConIva - venta,
      venta,
      ventaConCosto,
      costo,
      ganancia,
      costoIncompleto,
    },
  };
}
