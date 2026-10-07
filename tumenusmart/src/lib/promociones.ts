/**
 * Promociones: descuentos y "por cada X, regalar Y" que rigen en ciertos días y horas para un grupo de productos.
 *
 *  - POR DESCUENTO: "PROMO 20 %". Mientras rige la franja, los productos elegidos se venden con ese porcentaje menos.
 *  - POR VOLUMEN: "2 por 1", "3 por 2". Por cada `porCada` unidades de esos productos que se piden, `regalar` salen de cortesía
 *    (cobradas a Gs. 0). Pidiendo 2 se regala 1; pidiendo 4, 2; pidiendo 6, 3. Con "por cada 3, regalar 1": pidiendo 3 se regala 1;
 *    pidiendo 6, 2. Las unidades de cortesía son las MÁS BARATAS del grupo.
 *
 * Es lógica PURA (sin base de datos): la usan el servidor (que manda el precio que se cobra en el mostrador, el comedor, el delivery
 * y el mozo) y las pantallas (que lo muestran), y se prueba de verdad. Las reglas del tiempo son las de precio-promocion.ts.
 *
 * CÓMO SE REFLEJA EN LAS LÍNEAS (para que los reportes, el IVA, las facturas y el stock funcionen sin tocarlos):
 *  - un descuento cambia el precio unitario de la línea (redondeado al guaraní) y la línea lleva el nombre de la promoción;
 *  - la cortesía se separa en su propia línea con precio unitario 0 (o solo el de los agregados, si la promoción no los incluye):
 *    así las unidades regaladas igual bajan stock y cuentan como entregadas, y lo que se cobra es exacto al guaraní.
 *
 * REGLAS:
 *  - Un producto está en UNA promoción a la vez: el panel no deja guardar dos promociones activas que compartan un producto y se
 *    pisen en el horario. Si por datos viejos llegaran dos, gana la que más le conviene al cliente.
 *  - Los combos "mitad y mitad" (que no son un único producto) no entran en las promociones.
 *  - En una cuenta (comedor, delivery) lo ya pedido cuenta: dos cervezas pedidas en dos pedidos distintos son "dos". La cortesía
 *    nueva se calcula con lo ya regalado (`previas`). Si después se cancelan productos, se recortan las cortesías que ya no
 *    corresponden (`cortesiasSobrantes`).
 */

import { franjaContiene, franjasSePisan, validarFranjas, type Franja } from "./precio-promocion";

export type TipoPromocion = "descuento" | "volumen";

export type PromoDef = {
  id: string;
  nombre: string;
  tipo: TipoPromocion;
  activa: boolean;
  /** Solo en "descuento": 0 < porcentaje < 100. */
  porcentaje: number | null;
  /** Solo en "volumen": por cada `porCada` unidades… */
  porCada: number | null;
  /** …se regalan `regalar` (1 ≤ regalar < porCada). */
  regalar: number | null;
  /** Solo en "volumen": cada producto cuenta por separado (hacen falta 2 del MISMO producto). Sin esto, todas las unidades de la promoción se suman. */
  forzarPorProducto: boolean;
  /** Si el descuento / la cortesía alcanza también a los agregados del producto. */
  aplicaAModificadores: boolean;
  franjas: Franja[];
  productIds: string[];
};

export const MAX_POR_CADA = 20;
export const MAX_PRODUCTOS_POR_PROMOCION = 500;
export const MAX_NOMBRE_PROMOCION = 80;

// ---------------------------------------------------------------------------------------------------------------------
//  Qué promoción rige para un producto en un momento
// ---------------------------------------------------------------------------------------------------------------------

function esValida(p: PromoDef): boolean {
  if (p.tipo === "descuento") return p.porcentaje !== null && p.porcentaje > 0 && p.porcentaje < 100;
  if (p.tipo === "volumen") {
    return (
      p.porCada !== null && p.regalar !== null && Number.isInteger(p.porCada) && Number.isInteger(p.regalar) && p.regalar >= 1 && p.regalar < p.porCada
    );
  }
  return false;
}

/** Cuánto le conviene al cliente: el porcentaje que se ahorra (en un "2 por 1", la mitad de las unidades). */
export function favorDe(p: PromoDef): number {
  if (p.tipo === "descuento") return p.porcentaje ?? 0;
  return p.porCada && p.regalar ? (p.regalar / p.porCada) * 100 : 0;
}

/** ¿Rige esta promoción ahora (activa, dentro de alguna de sus franjas) para este producto? */
export function rigeParaProducto(p: PromoDef, productId: string, pos: number): boolean {
  return p.activa && esValida(p) && p.productIds.includes(productId) && p.franjas.some((f) => franjaContiene(f, pos));
}

/** La promoción que rige para un producto en el segundo `pos` de la semana, o null. Si hubiera dos, la que más conviene. */
export function promoVigenteDe(promos: PromoDef[], productId: string, pos: number): PromoDef | null {
  let mejor: PromoDef | null = null;
  for (const p of promos) {
    if (!rigeParaProducto(p, productId, pos)) continue;
    if (!mejor || favorDe(p) > favorDe(mejor) || (favorDe(p) === favorDe(mejor) && p.id < mejor.id)) mejor = p;
  }
  return mejor;
}

/** "−20 %", "2x1", "3x2": la etiqueta corta que se ve en la tarjeta del producto. */
export function etiquetaDePromo(p: PromoDef): string {
  if (p.tipo === "descuento") return `−${formatoPorcentaje(p.porcentaje ?? 0)} %`;
  const porCada = p.porCada ?? 0;
  return `${porCada}x${porCada - (p.regalar ?? 0)}`;
}

/** "20", "12,5": un porcentaje sin ceros de más. */
export function formatoPorcentaje(valor: number): string {
  return String(Math.round(valor * 100) / 100).replace(".", ",");
}

/** Una frase para la lista del panel: "20 % de descuento" / "Por cada 2, regalar 1 (2x1)". */
export function resumenDePromo(p: PromoDef): string {
  if (p.tipo === "descuento") return `${formatoPorcentaje(p.porcentaje ?? 0)} % de descuento`;
  return `Por cada ${p.porCada}, regalar ${p.regalar} (${etiquetaDePromo(p)})`;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Aplicar las promociones a las líneas
// ---------------------------------------------------------------------------------------------------------------------

/** Lo mínimo que tiene que tener una línea para que le apliquen una promoción. El resto de sus campos se conserva tal cual. */
export type LineaDePromo = {
  productId?: string | null;
  cantidad: number;
  /** El precio de UNA unidad, con los agregados incluidos. */
  precioUnitario: number;
  /** La parte de `precioUnitario` que corresponde a los agregados. */
  precioAgregados: number;
  opcionesTexto?: string | null;
};

export type LineaConPromo<T> = T & {
  /** La posición de la línea de la que salió (una línea con cortesía se parte en dos y las dos vienen de la misma). */
  origen: number;
  /** La promoción que se le aplicó, si alguna. */
  promocionId?: string;
  /** true en la parte regalada de una promoción por volumen. */
  cortesia?: boolean;
  /** El precio de UNA unidad antes de la promoción (con agregados): con él, el reporte sabe cuánto se descontó o se regaló. */
  precioAntesPromo?: number;
};

/** Lo ya pedido en la cuenta, por grupo de promoción: cuántas unidades cuentan y cuántas ya se regalaron. */
export type Previas = Map<string, { unidades: number; regaladas: number }>;

/** El grupo en que se suman las unidades: toda la promoción, o cada producto por separado si está "forzada por producto". */
export function claveDeGrupo(p: PromoDef, productId: string): string {
  return p.forzarPorProducto ? `${p.id}|${productId}` : p.id;
}

export type PromoAplicada = { promocionId: string; nombre: string; ahorro: number };

export type ResultadoPromos<T> = {
  lineas: LineaConPromo<T>[];
  /** Cuánto menos se cobra que a precio de lista, en guaraníes. */
  ahorro: number;
  aplicadas: PromoAplicada[];
};

function agregarTexto(base: string | null | undefined, extra: string): string {
  return base && base.trim() ? `${base} · ${extra}` : extra;
}

/** El precio de una unidad regalada: nada, o solo los agregados si la promoción no los incluye. */
function precioDeCortesia(l: LineaDePromo, p: PromoDef): number {
  return p.aplicaAModificadores ? 0 : Math.min(l.precioAgregados, l.precioUnitario);
}

/**
 * Aplica las promociones que rigen en el segundo `pos` de la semana a las líneas que se piden. Devuelve las líneas finales (las que
 * se cobran y se guardan) con el mismo orden que las de entrada; una línea con cortesía sale partida en la parte que se paga y la
 * regalada, una detrás de la otra. Lo que no tiene promoción pasa igual.
 *
 * `previas`: en una cuenta que ya tiene productos, lo que ya cuenta para cada grupo (ver `previasDeCuenta`).
 */
export function aplicarPromociones<T extends LineaDePromo>(
  lineas: T[],
  promos: PromoDef[],
  pos: number,
  previas?: Previas
): ResultadoPromos<T> {
  const promoDeLinea: (PromoDef | null)[] = lineas.map((l) =>
    l.productId && Number.isInteger(l.cantidad) && l.cantidad > 0 ? promoVigenteDe(promos, l.productId, pos) : null
  );

  // ---- por volumen: cuántas unidades se regalan en cada grupo, y a qué líneas (las más baratas primero)
  const grupos = new Map<string, { promo: PromoDef; indices: number[]; unidades: number }>();
  lineas.forEach((l, i) => {
    const p = promoDeLinea[i];
    if (!p || p.tipo !== "volumen") return;
    const clave = claveDeGrupo(p, l.productId as string);
    const g = grupos.get(clave) ?? { promo: p, indices: [], unidades: 0 };
    g.indices.push(i);
    g.unidades += l.cantidad;
    grupos.set(clave, g);
  });

  const regalosPorLinea = new Map<number, number>();
  for (const [clave, g] of grupos) {
    const previo = previas?.get(clave) ?? { unidades: 0, regaladas: 0 };
    const porCada = g.promo.porCada as number;
    const regalar = g.promo.regalar as number;
    // Lo que corresponde regalar con todo lo pedido, menos lo que ya se regaló antes (se ponen al día).
    const debenRegalarse = Math.floor((previo.unidades + g.unidades) / porCada) * regalar - previo.regaladas;
    let faltan = Math.max(0, Math.min(g.unidades, debenRegalarse));
    // Las de cortesía son las unidades más baratas (por precio de lista); si dos valen igual, la que se pidió primero.
    const masBaratasPrimero = [...g.indices].sort((a, b) => lineas[a].precioUnitario - lineas[b].precioUnitario || a - b);
    for (const i of masBaratasPrimero) {
      if (faltan <= 0) break;
      const dar = Math.min(faltan, lineas[i].cantidad);
      regalosPorLinea.set(i, dar);
      faltan -= dar;
    }
  }

  // ---- armar las líneas finales
  const salida: LineaConPromo<T>[] = [];
  const ahorroPorPromo = new Map<string, PromoAplicada>();
  const sumarAhorro = (p: PromoDef, monto: number) => {
    if (monto <= 0) return;
    const actual = ahorroPorPromo.get(p.id) ?? { promocionId: p.id, nombre: p.nombre, ahorro: 0 };
    actual.ahorro += monto;
    ahorroPorPromo.set(p.id, actual);
  };

  lineas.forEach((l, i) => {
    const p = promoDeLinea[i];
    if (!p) {
      salida.push({ ...l, origen: i });
      return;
    }

    if (p.tipo === "descuento") {
      const factor = 1 - (p.porcentaje as number) / 100;
      const producto = Math.max(0, l.precioUnitario - l.precioAgregados);
      const productoNuevo = Math.round(producto * factor);
      const agregadosNuevo = p.aplicaAModificadores ? Math.round(l.precioAgregados * factor) : l.precioAgregados;
      const unitario = productoNuevo + agregadosNuevo;
      salida.push({
        ...l,
        precioUnitario: unitario,
        precioAgregados: agregadosNuevo,
        opcionesTexto: agregarTexto(l.opcionesTexto, `Promo ${p.nombre}`),
        promocionId: p.id,
        precioAntesPromo: l.precioUnitario,
        origen: i,
      });
      sumarAhorro(p, (l.precioUnitario - unitario) * l.cantidad);
      return;
    }

    // por volumen
    const gratis = regalosPorLinea.get(i) ?? 0;
    const pagadas = l.cantidad - gratis;
    if (pagadas > 0) salida.push({ ...l, cantidad: pagadas, promocionId: p.id, precioAntesPromo: l.precioUnitario, origen: i });
    if (gratis > 0) {
      const precio = precioDeCortesia(l, p);
      salida.push({
        ...l,
        cantidad: gratis,
        precioUnitario: precio,
        precioAgregados: precio,
        opcionesTexto: agregarTexto(l.opcionesTexto, `Cortesía ${p.nombre}`),
        promocionId: p.id,
        precioAntesPromo: l.precioUnitario,
        cortesia: true,
        origen: i,
      });
      sumarAhorro(p, (l.precioUnitario - precio) * gratis);
    }
  });

  const aplicadas = [...ahorroPorPromo.values()];
  return { lineas: salida, ahorro: aplicadas.reduce((s, a) => s + a.ahorro, 0), aplicadas };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Cuentas: lo ya pedido cuenta, y si se cancela, se recortan las cortesías que sobran
// ---------------------------------------------------------------------------------------------------------------------

export type ItemDeCuenta = {
  id: string;
  productId: string | null;
  cantidad: number;
  promocionId: string | null;
  cortesia: boolean;
};

/** Lo ya cargado en la cuenta (productos activos) que cuenta para cada promoción por volumen. */
export function previasDeCuenta(items: ItemDeCuenta[], promos: PromoDef[]): Previas {
  const porId = new Map(promos.map((p) => [p.id, p]));
  const previas: Previas = new Map();
  for (const it of items) {
    if (!it.promocionId || !it.productId) continue;
    const p = porId.get(it.promocionId);
    if (!p || p.tipo !== "volumen") continue;
    const clave = claveDeGrupo(p, it.productId);
    const actual = previas.get(clave) ?? { unidades: 0, regaladas: 0 };
    actual.unidades += it.cantidad;
    if (it.cortesia) actual.regaladas += it.cantidad;
    previas.set(clave, actual);
  }
  return previas;
}

/**
 * Cuántas unidades de cortesía hay que sacar para que las que quedan correspondan a lo que queda pedido. Sacar una cortesía también
 * baja el total de unidades, así que se saca de a una hasta que cierra: con "por cada 2, regalar 1" y 1 paga + 3 de cortesía (4
 * unidades) corresponden 2 de cortesía… pero al sacar una quedan 3 unidades y corresponde 1; al sacar otra, quedan 2 unidades
 * (1 paga + 1 de cortesía) y corresponde 1: se sacan 2.
 */
export function unidadesDeCortesiaASacar(total: number, regaladas: number, porCada: number, regalar: number): number {
  let x = 0;
  while (x < regaladas && regaladas - x > Math.floor((total - x) / porCada) * regalar) x++;
  return x;
}

/**
 * Después de cancelar productos: qué unidades de cortesía ya no corresponden. Con "por cada 2, regalar 1" y 4 pedidos (2 de
 * cortesía), si se cancelan 2 pagos quedan 2 pedidos y solo 1 de cortesía: sobra 1. Devuelve qué unidades cancelar, empezando
 * por las últimas cargadas (`items` va en el orden en que se cargaron). Una promoción que ya no existe no se puede revisar: se deja.
 */
export function cortesiasSobrantes(items: ItemDeCuenta[], promos: PromoDef[]): { itemId: string; cantidad: number }[] {
  const porId = new Map(promos.map((p) => [p.id, p]));
  const grupos = new Map<string, { promo: PromoDef; total: number; regaladas: number; cortesias: ItemDeCuenta[] }>();
  for (const it of items) {
    if (!it.promocionId || !it.productId) continue;
    const p = porId.get(it.promocionId);
    if (!p || p.tipo !== "volumen" || !esValida(p)) continue;
    const clave = claveDeGrupo(p, it.productId);
    const g = grupos.get(clave) ?? { promo: p, total: 0, regaladas: 0, cortesias: [] };
    g.total += it.cantidad;
    if (it.cortesia) {
      g.regaladas += it.cantidad;
      g.cortesias.push(it);
    }
    grupos.set(clave, g);
  }

  const aCancelar: { itemId: string; cantidad: number }[] = [];
  for (const g of grupos.values()) {
    let sobran = unidadesDeCortesiaASacar(g.total, g.regaladas, g.promo.porCada as number, g.promo.regalar as number);
    for (let k = g.cortesias.length - 1; k >= 0 && sobran > 0; k--) {
      const cantidad = Math.min(sobran, g.cortesias[k].cantidad);
      aCancelar.push({ itemId: g.cortesias[k].id, cantidad });
      sobran -= cantidad;
    }
  }
  return aCancelar;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Guardar una promoción: validar lo que llega del navegador
// ---------------------------------------------------------------------------------------------------------------------

export type DatosPromocion = {
  nombre: unknown;
  tipo: unknown;
  activa: unknown;
  porcentaje?: unknown;
  porCada?: unknown;
  regalar?: unknown;
  forzarPorProducto?: unknown;
  aplicaAModificadores?: unknown;
  franjas: unknown;
  productIds: unknown;
};

export type ResultadoPromocion = { ok: true; promo: Omit<PromoDef, "id"> } | { ok: false; error: string };

function leerNumero(v: unknown): number {
  return typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
}

/**
 * Revisa una promoción antes de guardarla (todo llega del navegador: no se confía en nada). Rechaza, con el motivo en castellano:
 * un nombre vacío o larguísimo, un tipo que no existe, un porcentaje que no sea mayor a 0 y menor a 100, un "por cada" que no sea un
 * entero de 2 a 20 o un "regalar" que no sea un entero de 1 a por cada − 1, días y horarios mal armados (o ninguno) y una lista de
 * productos vacía.
 */
export function validarPromocion(d: DatosPromocion): ResultadoPromocion {
  const nombre = typeof d.nombre === "string" ? d.nombre.trim().replace(/\s+/g, " ") : "";
  if (!nombre) return { ok: false, error: "Escribí un nombre para la promoción (por ejemplo “PROMO 20 %”)." };
  if (nombre.length > MAX_NOMBRE_PROMOCION) return { ok: false, error: `El nombre puede tener hasta ${MAX_NOMBRE_PROMOCION} letras.` };

  if (d.tipo !== "descuento" && d.tipo !== "volumen") return { ok: false, error: "Elegí el tipo de promoción: por descuento o por volumen." };
  const tipo: TipoPromocion = d.tipo;

  let porcentaje: number | null = null;
  let porCada: number | null = null;
  let regalar: number | null = null;
  if (tipo === "descuento") {
    const n = leerNumero(d.porcentaje);
    if (!Number.isFinite(n) || n <= 0 || n >= 100) {
      return { ok: false, error: "El descuento tiene que ser mayor a 0 y menor a 100 %." };
    }
    porcentaje = Math.round(n * 100) / 100;
    if (porcentaje <= 0) return { ok: false, error: "El descuento tiene que ser mayor a 0 y menor a 100 %." };
  } else {
    const a = leerNumero(d.porCada);
    const b = leerNumero(d.regalar);
    if (!Number.isInteger(a) || a < 2 || a > MAX_POR_CADA) {
      return { ok: false, error: `“Por cada” tiene que ser un número entero de 2 a ${MAX_POR_CADA}.` };
    }
    if (!Number.isInteger(b) || b < 1 || b >= a) {
      return { ok: false, error: `“Regalar” tiene que ser un número entero de 1 a ${a - 1} (menos que “por cada”).` };
    }
    porCada = a;
    regalar = b;
  }

  const franjas = validarFranjas(d.franjas);
  if (!franjas.ok) return { ok: false, error: franjas.error };
  if (franjas.franjas.length === 0) {
    return { ok: false, error: "Elegí al menos un día en el que rige la promoción (y su horario)." };
  }

  if (!Array.isArray(d.productIds)) return { ok: false, error: "La lista de productos no llegó bien." };
  const productIds = [...new Set(d.productIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (productIds.length === 0) return { ok: false, error: "Agregá al menos un producto a la promoción." };
  if (productIds.length > MAX_PRODUCTOS_POR_PROMOCION) {
    return { ok: false, error: `Una promoción puede tener hasta ${MAX_PRODUCTOS_POR_PROMOCION} productos.` };
  }

  return {
    ok: true,
    promo: {
      nombre,
      tipo,
      activa: d.activa !== false,
      porcentaje,
      porCada,
      regalar,
      forzarPorProducto: tipo === "volumen" && d.forzarPorProducto === true,
      aplicaAModificadores: d.aplicaAModificadores === true,
      franjas: franjas.franjas,
      productIds,
    },
  };
}

/**
 * Un producto está en UNA promoción a la vez: si la nueva (activa) comparte algún producto con otra promoción activa y se pisan en
 * el horario, devuelve el motivo (con el nombre del producto y de la otra promoción); si no, null.
 */
export function conflictoConOtras(
  nueva: Pick<PromoDef, "id" | "activa" | "franjas" | "productIds">,
  otras: PromoDef[],
  nombreDeProducto: (id: string) => string
): string | null {
  if (!nueva.activa) return null;
  for (const o of otras) {
    if (o.id === nueva.id || !o.activa) continue;
    const compartidos = nueva.productIds.filter((id) => o.productIds.includes(id));
    if (compartidos.length === 0) continue;
    if (!franjasSePisan(nueva.franjas, o.franjas)) continue;
    const nombres = compartidos.slice(0, 3).map(nombreDeProducto).join(", ");
    const mas = compartidos.length > 3 ? ` y ${compartidos.length - 3} más` : "";
    return `${compartidos.length === 1 ? "El producto" : "Los productos"} ${nombres}${mas} ya ${compartidos.length === 1 ? "está" : "están"} en la promoción “${o.nombre}” y se pisa en el horario. Un producto solo puede estar en una promoción a la vez: sacalo de una, o cambiá los días y horas.`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Para mostrar: qué le pasó a cada línea
// ---------------------------------------------------------------------------------------------------------------------

export type DetalleDeLinea = {
  /** Cuánto menos se cobra de esa línea que a precio de lista (0 si no tiene promoción). */
  ahorro: number;
  /** "Promo 2 POR 1: 2 de cortesía" / "Promo PROMO 20 %" — null si no tiene promoción. */
  texto: string | null;
};

/**
 * Por cada línea que se pidió (en el mismo orden), cuánto se ahorra y qué promoción la tocó: para mostrarlo debajo de la línea en el
 * carrito. `resultado` es lo que devolvió `aplicarPromociones` con esas mismas líneas.
 */
export function detallePorLinea<T extends LineaDePromo>(
  entrada: T[],
  resultado: ResultadoPromos<T>,
  promos: PromoDef[]
): DetalleDeLinea[] {
  const porId = new Map(promos.map((p) => [p.id, p]));
  return entrada.map((l, i) => {
    const finales = resultado.lineas.filter((f) => f.origen === i);
    const lista = l.precioUnitario * l.cantidad;
    const cobrado = finales.reduce((s, f) => s + f.precioUnitario * f.cantidad, 0);
    const ahorro = lista - cobrado;
    if (ahorro <= 0) return { ahorro: 0, texto: null };
    const promo = porId.get(finales.find((f) => f.promocionId)?.promocionId ?? "");
    if (!promo) return { ahorro, texto: "Promoción" };
    const gratis = finales.filter((f) => f.cortesia).reduce((s, f) => s + f.cantidad, 0);
    return {
      ahorro,
      texto: gratis > 0 ? `${promo.nombre}: ${gratis} de cortesía` : `${promo.nombre} (${etiquetaDePromo(promo)})`,
    };
  });
}
