/**
 * El precio del pedido, armado desde la base y no desde el navegador.
 *
 * Antes el checkout recibía `precioUnitario` ya calculado por el teléfono del
 * cliente y lo guardaba tal cual. Eso quiere decir que cualquiera con la
 * consola del navegador abierta —o mandando la acción del servidor a mano, sin
 * pasar por la pantalla— podía pedir una pizza a 1 Gs. Mientras el único local
 * era el mío daba lo mismo; con locales ajenos adentro es plata de otro.
 *
 * La regla nueva es corta: el navegador dice QUÉ quiere (identificadores y
 * cantidades) y el servidor dice CUÁNTO SALE. Ningún precio, ningún nombre y
 * ningún texto que salga en la comanda viaja desde el cliente.
 *
 * Acá adentro no hay Prisma: se le pasa la carta ya leída y devuelve las
 * líneas listas para guardar. Así se puede probar de verdad, que es lo mínimo
 * para algo que toca plata.
 */

import { calcularPrecioMitadYMitad, type ModoPrecioMitad } from "./mitad-mitad";

/**
 * Un monto como puede llegar desde donde sea — mismo criterio que en
 * `rendicion.ts`: Prisma devuelve los Decimal como objeto, no como número,
 * y este módulo no importa Prisma justamente para poder probarse.
 */
export type Monto = number | string | { toString(): string };

export type OpcionBase = {
  id: string;
  nombre: string;
  /** "variante" | "agregado" */
  tipo: string;
  precioExtra: Monto;
};

export type ProductoBase = {
  id: string;
  nombre: string;
  precio: Monto;
  disponible: boolean;
  ingredientes: string[];
  mitadYMitadGrupo: string | null;
  mitadYMitadModo: string;
  /** Ya ordenadas como las ve el cliente. */
  opciones: OpcionBase[];
};

/**
 * Lo único que el navegador tiene derecho a mandar: qué eligió.
 *
 * Notar lo que NO está: precio, nombre, y el modo de precio del combo. Los
 * tres los pone el servidor.
 */
export type LineaPedida = {
  /** Producto normal. Excluyente con `mitadYMitad`. */
  productId?: string;
  /** Combo mitad y mitad. Excluyente con `productId`. */
  mitadYMitad?: { productIdA: string; productIdB: string };
  opcionIds?: string[];
  ingredientesQuitados?: string[];
  cantidad: number;
};

/** Una línea ya verificada, con los valores que van a la base. */
export type LineaArmada = {
  /** Ausente en los combos: no corresponden a un único producto. */
  productId?: string;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  opcionesTexto?: string;
  ingredientesQuitadosTexto?: string;
};

export type ResultadoArmado =
  | { ok: true; lineas: LineaArmada[]; subtotal: number }
  | { ok: false; motivo: string };

// Topes. No son una defensa contra el abuso —eso es el límite por minuto—
// sino contra el pedido absurdo que hace un total imposible de cobrar.
export const MAX_LINEAS = 40;
export const MAX_CANTIDAD_POR_LINEA = 50;
export const MAX_UNIDADES = 200;

/**
 * Cuánto puede diferir el total que vio el cliente del recalculado sin que
 * se lo considere un cambio de precio. Medio guaraní cubre el redondeo del
 * modo "proporcional"; cualquier cosa mayor es un precio que se movió.
 */
export const TOLERANCIA_TOTAL = 0.5;

function aNumero(valor: Monto): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

/** Dos grupos de mitad y mitad son el mismo si difieren solo en mayúsculas o espacios. */
export function mismoGrupoMitad(a: string | null, b: string | null): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  return x !== "" && x === y;
}

function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isInteger(valor) && valor > 0;
}

/**
 * Los agregados que el cliente pudo llegar a ver para un combo.
 *
 * Se reconstruye igual que en la pantalla: los de la primera mitad, después
 * los de la segunda, y de dos agregados con el mismo nombre queda solo el
 * primero. Esto no es cosmético — si aceptáramos cualquier agregado de A o de
 * B, un "queso extra" que en una mitad sale 10.000 y en la otra 2.000 dejaría
 * elegir el barato desde la consola aunque la pantalla ofrezca el caro.
 */
export function agregadosDeCombo(a: ProductoBase, b: ProductoBase): OpcionBase[] {
  const vistos = new Set<string>();
  const lista: OpcionBase[] = [];
  for (const p of [a, b]) {
    for (const o of p.opciones) {
      if (o.tipo !== "agregado") continue;
      const clave = o.nombre.trim().toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lista.push(o);
    }
  }
  return lista;
}

/**
 * Elige del catálogo las opciones que corresponden a los ids pedidos.
 *
 * Devuelve las opciones en el orden del catálogo —no en el que las mandó el
 * cliente— para que el texto de la comanda salga siempre igual.
 */
function elegirOpciones(
  disponibles: OpcionBase[],
  ids: string[]
): { ok: true; opciones: OpcionBase[] } | { ok: false; motivo: string } {
  const pedidos = new Set(ids);
  if (pedidos.size !== ids.length) {
    return { ok: false, motivo: "Hay una opción repetida en el pedido." };
  }
  const elegidas = disponibles.filter((o) => pedidos.has(o.id));
  if (elegidas.length !== pedidos.size) {
    return { ok: false, motivo: "Alguna de las opciones elegidas ya no está disponible." };
  }
  return { ok: true, opciones: elegidas };
}

/**
 * Arma el pedido completo a partir de la carta real y de lo que pidió el
 * cliente. Devuelve un motivo en castellano en vez de lanzar, así el que
 * llama decide qué hacer y las pruebas pueden mirar cada caso.
 */
export function armarPedido(
  catalogo: ProductoBase[],
  pedidas: LineaPedida[]
): ResultadoArmado {
  if (!Array.isArray(pedidas) || pedidas.length === 0) {
    return { ok: false, motivo: "El carrito está vacío" };
  }
  if (pedidas.length > MAX_LINEAS) {
    return { ok: false, motivo: `Un pedido no puede tener más de ${MAX_LINEAS} líneas.` };
  }

  const porId = new Map<string, ProductoBase>();
  for (const p of catalogo) porId.set(p.id, p);

  const lineas: LineaArmada[] = [];
  let subtotal = 0;
  let unidades = 0;

  for (const pedida of pedidas) {
    if (!esEnteroPositivo(pedida?.cantidad)) {
      return { ok: false, motivo: "La cantidad de un producto tiene que ser un número entero mayor a cero." };
    }
    if (pedida.cantidad > MAX_CANTIDAD_POR_LINEA) {
      return {
        ok: false,
        motivo: `No se pueden pedir más de ${MAX_CANTIDAD_POR_LINEA} unidades del mismo producto. Escribinos por WhatsApp para un pedido grande.`,
      };
    }
    unidades += pedida.cantidad;
    if (unidades > MAX_UNIDADES) {
      return {
        ok: false,
        motivo: `El pedido supera las ${MAX_UNIDADES} unidades. Escribinos por WhatsApp para coordinarlo.`,
      };
    }

    const opcionIds = pedida.opcionIds ?? [];
    const quitados = pedida.ingredientesQuitados ?? [];

    const armada = pedida.mitadYMitad
      ? armarCombo(porId, pedida, opcionIds)
      : armarProducto(porId, pedida, opcionIds, quitados);

    if (!armada.ok) return armada;

    subtotal += armada.linea.precioUnitario * armada.linea.cantidad;
    lineas.push(armada.linea);
  }

  return { ok: true, lineas, subtotal };
}

type ArmadoDeLinea = { ok: true; linea: LineaArmada } | { ok: false; motivo: string };

function armarProducto(
  porId: Map<string, ProductoBase>,
  pedida: LineaPedida,
  opcionIds: string[],
  quitados: string[]
): ArmadoDeLinea {
  if (typeof pedida.productId !== "string" || pedida.productId === "") {
    return { ok: false, motivo: "Falta indicar qué producto se está pidiendo." };
  }
  const producto = porId.get(pedida.productId);
  // El catálogo se lee filtrado por el local del slug, así que un producto de
  // otro negocio simplemente no está en el mapa: no hace falta comparar
  // storeId acá, y no habría con qué compararlo.
  if (!producto) {
    return { ok: false, motivo: "Uno de los productos del carrito ya no está en la carta." };
  }
  if (!producto.disponible) {
    return { ok: false, motivo: `"${producto.nombre}" ya no está disponible.` };
  }

  const elegidas = elegirOpciones(producto.opciones, opcionIds);
  if (!elegidas.ok) return elegidas;

  const variantes = elegidas.opciones.filter((o) => o.tipo === "variante");
  if (variantes.length > 1) {
    return { ok: false, motivo: "Se puede elegir una sola variante por producto." };
  }

  // Los ingredientes quitados salen impresos en la comanda de cocina. Si se
  // aceptara texto libre, el cliente escribiría lo que quisiera en el papel
  // que sale en la cocina del local.
  const permitidos = new Set(producto.ingredientes);
  for (const i of quitados) {
    if (!permitidos.has(i)) {
      return { ok: false, motivo: "Uno de los ingredientes que se quiso sacar no es de ese producto." };
    }
  }
  const quitadosOrdenados = producto.ingredientes.filter((i) => quitados.includes(i));

  const precioUnitario =
    aNumero(producto.precio) +
    elegidas.opciones.reduce((s, o) => s + aNumero(o.precioExtra), 0);

  return {
    ok: true,
    linea: {
      productId: producto.id,
      nombreProducto: producto.nombre,
      cantidad: pedida.cantidad,
      precioUnitario,
      opcionesTexto: textoOpciones(elegidas.opciones),
      ingredientesQuitadosTexto:
        quitadosOrdenados.length > 0 ? `Sin: ${quitadosOrdenados.join(", ")}` : undefined,
    },
  };
}

function armarCombo(
  porId: Map<string, ProductoBase>,
  pedida: LineaPedida,
  opcionIds: string[]
): ArmadoDeLinea {
  const { productIdA, productIdB } = pedida.mitadYMitad!;
  if (pedida.productId) {
    return { ok: false, motivo: "Una línea no puede ser producto y combo a la vez." };
  }
  if (productIdA === productIdB) {
    return { ok: false, motivo: "Las dos mitades tienen que ser productos distintos." };
  }

  const a = porId.get(productIdA);
  const b = porId.get(productIdB);
  if (!a || !b) {
    return { ok: false, motivo: "Uno de los productos del combo ya no está en la carta." };
  }
  if (!a.disponible || !b.disponible) {
    return { ok: false, motivo: "Una de las mitades ya no está disponible." };
  }
  // Sin esto se podría combinar media pizza chica con media pizza familiar, o
  // media pizza con medio postre, y cobrar el precio del más barato.
  if (!mismoGrupoMitad(a.mitadYMitadGrupo, b.mitadYMitadGrupo)) {
    return { ok: false, motivo: "Esas dos mitades no se pueden combinar entre sí." };
  }

  // El modo lo dice la carta, no el navegador: si viniera del cliente,
  // "proporcional" sobre una pizza cara y una barata sería un descuento
  // elegido por el que pide.
  const modo: ModoPrecioMitad = a.mitadYMitadModo === "proporcional" ? "proporcional" : "mayor";

  const elegidas = elegirOpciones(agregadosDeCombo(a, b), opcionIds);
  if (!elegidas.ok) return elegidas;

  const precioUnitario =
    calcularPrecioMitadYMitad(aNumero(a.precio), aNumero(b.precio), modo) +
    elegidas.opciones.reduce((s, o) => s + aNumero(o.precioExtra), 0);

  return {
    ok: true,
    linea: {
      // Sin productId a propósito: el combo no es un producto de la carta.
      nombreProducto: `Mitad ${a.nombre} / Mitad ${b.nombre}`,
      cantidad: pedida.cantidad,
      precioUnitario,
      opcionesTexto: textoOpciones(elegidas.opciones),
    },
  };
}

function textoOpciones(opciones: OpcionBase[]): string | undefined {
  if (opciones.length === 0) return undefined;
  return opciones.map((o) => o.nombre).join(", ");
}

/**
 * Si el total que el cliente tenía en pantalla sigue siendo el que corresponde.
 *
 * Se usa para avisarle cuando el local cambió un precio mientras él llenaba
 * sus datos. No es una medida de seguridad —el precio bueno es siempre el
 * recalculado— sino de no cobrarle distinto de lo que vio.
 */
export function totalSinCambios(calculado: number, mostrado: unknown): boolean {
  if (typeof mostrado !== "number" || !Number.isFinite(mostrado)) return false;
  return Math.abs(calculado - mostrado) <= TOLERANCIA_TOTAL;
}
