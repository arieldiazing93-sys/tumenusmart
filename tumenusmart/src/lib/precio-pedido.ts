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

/** Un insumo y cuánto de él se consume — ver Control de stock. */
export type RecetaInsumoBase = { insumoId: string; cantidad: Monto };

export type OpcionBase = {
  id: string;
  nombre: string;
  /** "variante" | "agregado" */
  tipo: string;
  precioExtra: Monto;
  /** Null si el dueño nunca cargó un costo para esta opción. */
  costo: Monto | null;
  /**
   * Insumos que consume ESTA opción, por unidad elegida — [] si no tiene
   * receta armada (la gran mayoría, mientras el negocio no controle stock).
   * Un agregado de grupo (ver Grupos de agregados) es un Product real, así
   * que trae la receta de SU PROPIA ficha, igual que cualquier producto.
   */
  receta: RecetaInsumoBase[];
  /** Almacén del que descuenta esa receta. Null o ausente = el almacén principal del local. */
  almacenId?: string | null;
};

export type ProductoBase = {
  id: string;
  nombre: string;
  precio: Monto;
  disponible: boolean;
  ingredientes: string[];
  mitadYMitadGrupo: string | null;
  mitadYMitadModo: string;
  /** "gravado10" | "gravado5" | "exento" — ver src/lib/iva.ts. */
  iva: string;
  /** Ya ordenadas como las ve el cliente. */
  opciones: OpcionBase[];
  /**
   * Cuánto cuesta preparar UNA unidad de este producto (sin agregados), según
   * su receta — ver src/lib/costo-receta.ts. Null si no se puede calcular (sin
   * receta, o un insumo sin costo). Solo sirve para guardar el costo en cada
   * línea vendida; no interviene en el precio.
   */
  costo?: Monto | null;
  /** Insumos que consume este producto, por unidad vendida — ver OpcionBase.receta. */
  receta: RecetaInsumoBase[];
  /** Almacén del que descuenta esa receta. Null o ausente = el almacén principal del local. */
  almacenId?: string | null;
};

/**
 * Cuánto de un insumo hay que descontar, y de qué almacén — ver Control de
 * stock. `almacenId` null significa "el almacén principal": quien guarda el
 * movimiento (movimientos-stock.ts) lo resuelve, este módulo no toca la base.
 */
export type ConsumoInsumo = { insumoId: string; almacenId: string | null; cantidad: number };

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
  /** "gravado10" | "gravado5" | "exento" — ver src/lib/iva.ts. */
  iva: string;
  opcionesTexto?: string;
  ingredientesQuitadosTexto?: string;
  /**
   * Costo (por unidad) de las opciones elegidas, sumadas. 0 si no se elige
   * ninguna. Null si se elige alguna pero le falta el costo — el reporte de
   * rentabilidad necesita distinguir "no tiene agregados" de "tiene
   * agregados pero no sabemos cuánto cuestan", para no inventar un número.
   */
  costoAgregados: number | null;
  /**
   * Costo (por unidad) del PRODUCTO en sí, sin agregados, según su receta. En
   * un combo mitad y mitad es la mitad del costo de cada lado. Null si no se
   * puede calcular (un producto sin receta, o con un insumo sin costo — en un
   * combo, con que UNO de los dos lados no lo tenga). Se guarda en el ítem al
   * vender, para que Rentabilidad use el costo de ese día.
   */
  costoProducto: number | null;
  /** Precio (por unidad) de las opciones elegidas, sumadas. Nunca null: a
   * diferencia del costo, el precio de un agregado siempre está cargado. */
  precioAgregados: number;
  /**
   * Insumos que descuenta ESTA línea, POR UNIDAD — igual que precioUnitario,
   * no viene multiplicado por `cantidad` (quien llama multiplica). [] si
   * nada de lo elegido tiene receta armada — no descuenta nada, no bloquea
   * nada.
   */
  consumo: ConsumoInsumo[];
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

/**
 * Suma el costo de un grupo de opciones elegidas. 0 si el grupo está vacío
 * (no se eligió ningún agregado — costo conocido y es cero). Null si se
 * eligió alguna pero al menos una no tiene costo cargado: no se puede
 * saber el costo real de esta línea, y sumar solo las que sí tienen costo
 * daría un número que parece exacto pero no lo es.
 */
function sumaCostoOpciones(opciones: OpcionBase[]): number | null {
  if (opciones.length === 0) return 0;
  let total = 0;
  for (const o of opciones) {
    if (o.costo == null) return null;
    total += aNumero(o.costo);
  }
  return total;
}

/** Suma el precio extra de un grupo de opciones elegidas. A diferencia del
 * costo, nunca es null: el precio de un agregado no es un dato opcional. */
function sumaPrecioOpciones(opciones: OpcionBase[]): number {
  return opciones.reduce((s, o) => s + aNumero(o.precioExtra), 0);
}

/**
 * Junta varias listas de consumo en una sola, sumando lo repetido: el mismo
 * insumo del mismo almacén. El mismo insumo en dos almacenes distintos queda
 * en dos filas (cada una descuenta de su almacén).
 */
function combinarConsumo(...listas: ConsumoInsumo[][]): ConsumoInsumo[] {
  const mapa = new Map<string, ConsumoInsumo>();
  for (const lista of listas) {
    for (const c of lista) {
      const clave = `${c.insumoId}|${c.almacenId ?? ""}`;
      const actual = mapa.get(clave);
      if (actual) actual.cantidad += c.cantidad;
      else mapa.set(clave, { insumoId: c.insumoId, almacenId: c.almacenId, cantidad: c.cantidad });
    }
  }
  return [...mapa.values()];
}

/** Multiplica cada cantidad de una receta por un factor (ej: 0.5 para media mitad y mitad). */
function escalarConsumo(
  receta: RecetaInsumoBase[],
  factor: number,
  almacenId: string | null | undefined
): ConsumoInsumo[] {
  return receta.map((r) => ({
    insumoId: r.insumoId,
    almacenId: almacenId ?? null,
    cantidad: aNumero(r.cantidad) * factor,
  }));
}

/** El consumo de un grupo de opciones elegidas — su propia receta, sin escalar, de su propio almacén. */
function sumaConsumoOpciones(opciones: OpcionBase[]): ConsumoInsumo[] {
  return combinarConsumo(...opciones.map((o) => escalarConsumo(o.receta, 1, o.almacenId)));
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

  const precioAgregados = sumaPrecioOpciones(elegidas.opciones);
  const precioUnitario = aNumero(producto.precio) + precioAgregados;
  const consumo = combinarConsumo(
    escalarConsumo(producto.receta, 1, producto.almacenId),
    sumaConsumoOpciones(elegidas.opciones)
  );

  return {
    ok: true,
    linea: {
      productId: producto.id,
      nombreProducto: producto.nombre,
      cantidad: pedida.cantidad,
      precioUnitario,
      iva: producto.iva,
      opcionesTexto: textoOpciones(elegidas.opciones),
      ingredientesQuitadosTexto:
        quitadosOrdenados.length > 0 ? `Sin: ${quitadosOrdenados.join(", ")}` : undefined,
      costoAgregados: sumaCostoOpciones(elegidas.opciones),
      costoProducto: producto.costo != null ? aNumero(producto.costo) : null,
      precioAgregados,
      consumo,
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

  const precioAgregados = sumaPrecioOpciones(elegidas.opciones);
  const precioUnitario =
    calcularPrecioMitadYMitad(aNumero(a.precio), aNumero(b.precio), modo) + precioAgregados;
  // Físicamente se prepara la MITAD de la receta de cada lado, sin importar
  // el modo de precio ("mayor"/"proporcional" es solo para cobrar) — y los
  // agregados elegidos se preparan enteros, no se parten.
  const consumo = combinarConsumo(
    escalarConsumo(a.receta, 0.5, a.almacenId),
    escalarConsumo(b.receta, 0.5, b.almacenId),
    sumaConsumoOpciones(elegidas.opciones)
  );

  return {
    ok: true,
    linea: {
      // Sin productId a propósito: el combo no es un producto de la carta.
      nombreProducto: `Mitad ${a.nombre} / Mitad ${b.nombre}`,
      cantidad: pedida.cantidad,
      precioUnitario,
      // El combo usa el IVA del producto A: en la práctica las dos mitades
      // de un mismo grupo (pizzas) siempre van a tener la misma tasa.
      iva: a.iva,
      opcionesTexto: textoOpciones(elegidas.opciones),
      costoAgregados: sumaCostoOpciones(elegidas.opciones),
      // Físicamente se prepara la mitad de cada lado (igual que el consumo de
      // stock): el costo del combo es la mitad de cada uno. Si a uno le falta,
      // no se puede saber el del combo.
      costoProducto: a.costo != null && b.costo != null ? (aNumero(a.costo) + aNumero(b.costo)) / 2 : null,
      precioAgregados,
      consumo,
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
