/**
 * Dividir la cuenta de una mesa (Servicio comedor): dos amigos comen, se carga todo en UNA cuenta y cada uno quiere su
 * factura. La cuenta se divide en cuentas separadas, cada una con su total, su IVA y su comprobante, de dos maneras:
 *
 *  - En PARTES IGUALES: cada parte lleva una fracción de cada producto (media pizza, medio lomito…).
 *  - POR PRODUCTO: se eligen productos (y cuántas unidades) y pasan a una cuenta nueva; las cantidades quedan enteras.
 *
 * La cuenta original se queda con su nombre ("Mesa 1") y las nuevas se llaman "1-A", "1-B"… Todo lo que hace falta calcular
 * está acá, sin base de datos y sin pantalla: la pantalla lo usa para mostrar cómo quedaría y el servidor para hacerlo de
 * verdad, así que lo que se ve es exactamente lo que se guarda.
 *
 * LA REGLA QUE NO SE ROMPE: no puede quedar ningún guaraní de más ni de menos.
 *
 *  1. Cada línea vale un número ENTERO de guaraníes (cantidad × precio, ver `importeDeLinea`). Al dividir una línea de L
 *     guaraníes en n partes, las partes son enteros que suman EXACTAMENTE L (los guaraníes que sobran se turnan entre las
 *     partes, no se los lleva siempre la misma).
 *  2. Cada parte arma su línea de modo que cantidad × precio dé justo ese entero. Si la fracción es exacta (½, ¼, ⅕…), la parte
 *     lleva la cantidad con decimales (0,5) y el precio de lista de siempre. Si no lo es (⅓…), la parte lleva una línea
 *     "Pizza (1/3)" de cantidad 1 por su monto. En los dos casos el documento que se emite (ticket, factura autoimpresor o
 *     electrónica) no tiene ni un decimal de diferencia entre lo que dice y lo que suma.
 *  3. El descuento de la cuenta se reparte en enteros que suman exactamente el descuento original (en proporción a lo que vale
 *     cada parte). Si era un porcentaje y aplicarlo a cada parte da exactamente el mismo total, se conserva como porcentaje;
 *     si el redondeo se desviaría aunque sea un guaraní, pasa a monto fijo.
 *  4. El total de cada parte es su subtotal menos su descuento, y la suma de los totales de todas las partes es IGUAL al total
 *     de la cuenta original. Si por cualquier motivo no cierra, no se divide (`ok: false`).
 *  5. El IVA de cada comprobante se saca de SU total (÷11 al 10 %, ÷21 al 5 %): cada documento es consistente por sí mismo.
 *     La suma de los IVA de las partes puede diferir del IVA que habría dado el total entero en fracciones de guaraní, algo
 *     inevitable (y correcto) cuando se emiten varios documentos.
 */

import { calcularDescuento, type DescuentoPedido } from "./descuento-venta";
import { MESA_LARGO_MAXIMO, claveDeMesa, importeDeLinea, totalesDeCuenta, type ConsumoGuardado } from "./comedor";
import { formatearCantidad } from "./format";

/** En cuántas cuentas se puede dividir una como máximo (la original cuenta como una). */
export const PARTES_MAXIMAS = 10;

/** Las cantidades se guardan con hasta 4 decimales. */
const ESCALA_CANTIDAD = 10000;

/** La columna de cantidad del ticket mide 3 caracteres (src/lib/escpos.ts): una cantidad con más no se usa, para no cortarla al imprimir. */
const MAXIMO_CARACTERES_CANTIDAD = 3;

// ---------------------------------------------------------------------------------------------------------------------
//  Tipos
// ---------------------------------------------------------------------------------------------------------------------

/** Una línea activa de la cuenta, tal como hace falta para dividirla. */
export type LineaBase = {
  id: string;
  nombreProducto: string;
  /** Entera al cargarla; con decimales si la cuenta ya se había dividido en partes iguales. */
  cantidad: number;
  precioUnitario: number;
  /** Cuánto de `precioUnitario` corresponde a agregados (para Rentabilidad). */
  precioAgregados?: number;
  /** Costo por unidad de la línea (null = no se conocía). */
  costoProducto?: number | null;
  costoAgregados?: number | null;
  /** Los insumos que descontó la línea (por su cantidad), para devolverlos si se cancela. */
  consumo?: ConsumoGuardado[];
};

/**
 * Cómo queda una línea en una de las cuentas resultantes.
 *  - "conservar": la fila no cambia y sigue en la cuenta original.
 *  - "mover": la fila existente pasa a otra cuenta (con la cantidad que lleva esa línea: la misma si pasa entera, o menos si el
 *    producto se repartió entre varias cuentas y ya no queda nada en la original).
 *  - "actualizar": la fila existente sigue en la cuenta original pero con otros datos (menos cantidad, o su parte).
 *  - "crear": una fila nueva en otra cuenta.
 */
export type AccionDeLinea = "conservar" | "mover" | "actualizar" | "crear";

export type LineaDeParte = {
  /** La fila de la cuenta original de la que sale. */
  origenId: string;
  accion: AccionDeLinea;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  precioAgregados: number;
  costoProducto: number | null;
  costoAgregados: number | null;
  consumo: ConsumoGuardado[];
  /** Lo que vale la línea, en guaraníes enteros (cantidad × precio, redondeado: da justo ese entero). */
  importe: number;
};

export type DescuentoDeParte = { tipo: "porcentaje" | "monto"; valor: number };

export type ParteDeCuenta = {
  /** 0 = la cuenta original; 1, 2… = las nuevas (A, B…). */
  indice: number;
  lineas: LineaDeParte[];
  subtotal: number;
  /** El descuento tal como se guarda en la cuenta (null = sin descuento). */
  descuento: DescuentoDeParte | null;
  /** Guaraníes que se restan. */
  montoDescuento: number;
  /** Lo que se cobra en esta cuenta. */
  total: number;
};

export type ResultadoDivision = { ok: true; partes: ParteDeCuenta[]; totalOriginal: number } | { ok: false; error: string };

function falla(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/** ¿Es un guaraní entero (sin centavos)? */
function esEntero(n: number): boolean {
  return Math.abs(n - Math.round(n)) < 1e-9;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Repartir enteros sin perder ni inventar un guaraní
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Reparte `total` (entero) en `n` partes enteras que suman EXACTAMENTE `total`. Los guaraníes que sobran (menos de `n`) se
 * dan de a uno a partir de la parte `desde`, dando la vuelta: si cada línea empieza por una parte distinta, no es siempre la
 * misma la que se lleva el guaraní de más.
 */
export function repartirEntero(total: number, n: number, desde = 0): number[] {
  const base = Math.floor(total / n);
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => base + ((((i - desde) % n) + n) % n < resto ? 1 : 0));
}

/**
 * Reparte `monto` (entero) en proporción a `pesos`, en enteros que suman EXACTAMENTE `monto`: cada uno recibe lo que le toca
 * hacia abajo y los guaraníes que faltan van a los que más cerca estaban del siguiente entero (el de mayor resto primero).
 */
export function repartirProporcional(monto: number, pesos: number[]): number[] {
  const suma = pesos.reduce((s, p) => s + p, 0);
  if (suma <= 0 || monto <= 0) return pesos.map(() => 0);
  const exactos = pesos.map((p) => (monto * p) / suma);
  const resultado = exactos.map((e) => Math.floor(e + 1e-9));
  let faltan = monto - resultado.reduce((s, r) => s + r, 0);
  const orden = exactos
    .map((e, i) => ({ i, resto: e - resultado[i] }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; faltan > 0 && orden.length > 0; k = (k + 1) % orden.length) {
    resultado[orden[k].i] += 1;
    faltan -= 1;
  }
  return resultado;
}

/**
 * Reparte lo que descontó una línea (de cada insumo) en proporción a `factores` (que suman 1): la última parte se lleva el resto.
 * También lo usa la cancelación de ALGUNAS unidades de un producto (4 se quedan, 1 se cancela y se devuelve su parte al stock).
 *
 * Cada parte (menos la última) se redondea a 3 decimales, que es la precisión del stock: lo que se devuelve al cancelar una parte es
 * justo lo que se le saca a la línea, sin un redondeo posterior que sume o reste 0,001. La última parte es lo que falta, exacto.
 */
export function repartirConsumo(consumo: ConsumoGuardado[], factores: number[]): ConsumoGuardado[][] {
  const n = factores.length;
  const salida: ConsumoGuardado[][] = Array.from({ length: n }, () => []);
  for (const c of consumo) {
    let acumulado = 0;
    for (let i = 0; i < n; i++) {
      const cantidad = i === n - 1 ? Math.max(0, redondear(c.cantidad - acumulado, 6)) : redondear(c.cantidad * factores[i], 3);
      acumulado += cantidad;
      salida[i].push({ insumoId: c.insumoId, almacenId: c.almacenId, cantidad });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Los nombres de las cuentas nuevas
// ---------------------------------------------------------------------------------------------------------------------

/** A, B, C… Z, AA, AB… */
function letrasDe(n: number): string {
  let texto = "";
  let k = n;
  do {
    texto = String.fromCharCode(65 + (k % 26)) + texto;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return texto;
}

/**
 * Los nombres de las cuentas nuevas: la mesa original con un guion y una letra ("1-A", "1-B"). Salta los que ya están en uso
 * (otra cuenta abierta con ese nombre). Devuelve null si no entran en el largo de un nombre de mesa.
 */
export function nombresDeCuentasNuevas(base: string, cantidad: number, enUso: (clave: string) => boolean): string[] | null {
  const nombres: string[] = [];
  for (let n = 0; nombres.length < cantidad && n < 52; n++) {
    const nombre = `${base}-${letrasDe(n)}`;
    if (nombre.length > MESA_LARGO_MAXIMO) return null;
    if (enUso(claveDeMesa(nombre))) continue;
    nombres.push(nombre);
  }
  return nombres.length === cantidad ? nombres : null;
}

// ---------------------------------------------------------------------------------------------------------------------
//  El descuento
// ---------------------------------------------------------------------------------------------------------------------

type ReparticionDeDescuento =
  | { ok: true; descuentos: (DescuentoDeParte | null)[]; montos: number[] }
  | { ok: false; error: string };

/**
 * Reparte el descuento general de la cuenta entre las partes, en enteros que suman EXACTAMENTE el descuento original.
 * Un porcentaje se conserva como porcentaje solo si aplicarlo a cada parte suma justo lo mismo; si no, cada parte lleva su
 * monto fijo (en proporción a lo que vale).
 */
function repartirDescuentoGeneral(subtotales: number[], pedido: DescuentoPedido | null): ReparticionDeDescuento {
  const sinDescuento = { ok: true as const, descuentos: subtotales.map(() => null), montos: subtotales.map(() => 0) };
  if (!pedido) return sinDescuento;

  const subtotal = subtotales.reduce((s, x) => s + x, 0);
  const original = calcularDescuento(subtotal, pedido);
  if (!original.ok) return falla(original.error);
  const descuentoTotal = original.monto;
  if (descuentoTotal <= 0) return sinDescuento;

  if (pedido.tipo === "porcentaje") {
    const porPartes = subtotales.map((s) => calcularDescuento(s, { tipo: "porcentaje", valor: pedido.valor }));
    const todasOk = porPartes.every((p) => p.ok);
    if (todasOk) {
      const montos = porPartes.map((p) => (p.ok ? p.monto : 0));
      if (montos.reduce((s, m) => s + m, 0) === descuentoTotal) {
        return {
          ok: true,
          descuentos: montos.map((m) => (m > 0 ? { tipo: "porcentaje" as const, valor: pedido.valor } : null)),
          montos,
        };
      }
    }
  }

  // Monto fijo (o un porcentaje cuyo redondeo no cierra): cada parte lleva lo que le toca del total, en enteros exactos.
  const montos = repartirProporcional(descuentoTotal, subtotales);
  for (let i = 0; i < montos.length; i++) {
    if (montos[i] >= subtotales[i]) {
      return falla("El descuento de la cuenta es muy grande para repartirlo entre las partes. Quitalo o bajalo y volvé a dividir.");
    }
  }
  return {
    ok: true,
    descuentos: montos.map((m) => (m > 0 ? { tipo: "monto" as const, valor: m } : null)),
    montos,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Armar las partes y comprobar que todo cierra
// ---------------------------------------------------------------------------------------------------------------------

function armarPartes(porParte: LineaDeParte[][], pedido: DescuentoPedido | null, totalOriginal: number): ResultadoDivision {
  if (porParte.some((l) => l.length === 0)) return falla("Cada cuenta tiene que quedar con al menos un producto.");

  const subtotales = porParte.map((lineas) => lineas.reduce((s, l) => s + l.importe, 0));
  const reparto = repartirDescuentoGeneral(subtotales, pedido);
  if (!reparto.ok) return reparto;

  const partes: ParteDeCuenta[] = porParte.map((lineas, i) => ({
    indice: i,
    lineas,
    subtotal: subtotales[i],
    descuento: reparto.descuentos[i],
    montoDescuento: reparto.montos[i],
    total: subtotales[i] - reparto.montos[i],
  }));

  // Los controles de siempre, por si algún día se cambia algo de acá y se rompe sin querer: nunca se divide con un hueco.
  if (partes.some((p) => !Number.isInteger(p.total) || p.total <= 0)) {
    return falla("No se pudo dividir: una de las cuentas quedaría con un total que no es válido.");
  }
  if (partes.reduce((s, p) => s + p.total, 0) !== totalOriginal) {
    return falla("No se pudo dividir sin diferencias de guaraníes entre las cuentas. No se hizo ningún cambio.");
  }
  for (const p of partes) {
    for (const l of p.lineas) {
      if (importeDeLinea(l) !== l.importe) {
        return falla("No se pudo dividir: una línea no daría un número exacto de guaraníes. No se hizo ningún cambio.");
      }
    }
  }
  return { ok: true, partes, totalOriginal };
}

function lineaIntacta(l: LineaBase, accion: AccionDeLinea): LineaDeParte {
  return {
    origenId: l.id,
    accion,
    nombreProducto: l.nombreProducto,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    precioAgregados: l.precioAgregados ?? 0,
    costoProducto: l.costoProducto ?? null,
    costoAgregados: l.costoAgregados ?? null,
    consumo: l.consumo ?? [],
    importe: importeDeLinea(l),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Dividir en partes iguales
// ---------------------------------------------------------------------------------------------------------------------

/** "Pizza (1/3)", o "Pizza (1/3 de 2)" si la línea era de más de una unidad. */
function nombreConFraccion(nombre: string, cantidad: number, partes: number): string {
  return cantidad === 1 ? `${nombre} (1/${partes})` : `${nombre} (1/${partes} de ${formatearCantidad(cantidad)})`;
}

/**
 * La línea de UNA parte cuando se divide una línea de `importe` guaraníes: a esta parte le toca `parte` (entero).
 * Si la fracción es exacta (cantidad con hasta 4 decimales × precio de lista = justo `parte`) lleva esa cantidad y el precio
 * de lista; si no, una línea de cantidad 1 por su monto, con la fracción en el nombre.
 */
function lineaDeParteIgual(
  origen: LineaBase,
  importe: number,
  parte: number,
  partes: number,
  consumo: ConsumoGuardado[],
  accion: AccionDeLinea
): LineaDeParte {
  const precio = origen.precioUnitario;
  const agregados = origen.precioAgregados ?? 0;
  const factor = importe > 0 ? parte / importe : 1 / partes;

  if (parte > 0 && precio > 0 && esEntero(precio) && (parte * ESCALA_CANTIDAD) % Math.round(precio) === 0) {
    const cantidad = Math.round((parte * ESCALA_CANTIDAD) / Math.round(precio)) / ESCALA_CANTIDAD;
    // Que la cantidad entre en la columna del ticket (3 caracteres: "0,5", "1,5", "0,2"): lo que no entra ("0,25") va como "(1/4)".
    if (cantidad > 0 && formatearCantidad(cantidad).length <= MAXIMO_CARACTERES_CANTIDAD && importeDeLinea({ precioUnitario: precio, cantidad }) === parte) {
      return {
        origenId: origen.id,
        accion,
        nombreProducto: origen.nombreProducto,
        cantidad,
        precioUnitario: precio,
        precioAgregados: agregados,
        // El costo es por unidad y la unidad no cambió: solo hay menos unidades.
        costoProducto: origen.costoProducto ?? null,
        costoAgregados: origen.costoAgregados ?? null,
        consumo,
        importe: parte,
      };
    }
  }

  // Fracción que no es exacta (⅓, ⅙…): una línea de cantidad 1 por el monto de la parte. El costo es el de esa porción.
  return {
    origenId: origen.id,
    accion,
    nombreProducto: nombreConFraccion(origen.nombreProducto, origen.cantidad, partes),
    cantidad: 1,
    precioUnitario: parte,
    precioAgregados: precio > 0 ? redondear((agregados / precio) * parte, 2) : 0,
    costoProducto: origen.costoProducto == null ? null : redondear(origen.costoProducto * origen.cantidad * factor, 2),
    costoAgregados: origen.costoAgregados == null ? null : redondear(origen.costoAgregados * origen.cantidad * factor, 2),
    consumo,
    importe: parte,
  };
}

/**
 * Divide la cuenta en `partes` cuentas por igual (la original cuenta como una): cada una lleva una fracción de cada producto.
 * La parte 0 es la cuenta original (sus filas se actualizan) y las demás son cuentas nuevas (filas nuevas).
 */
export function dividirEnPartesIguales(
  lineas: LineaBase[],
  descuento: DescuentoPedido | null,
  partes: number
): ResultadoDivision {
  if (!Number.isInteger(partes) || partes < 2 || partes > PARTES_MAXIMAS) {
    return falla(`Se puede dividir en de 2 a ${PARTES_MAXIMAS} partes.`);
  }
  if (lineas.length === 0) return falla("La cuenta no tiene productos para dividir.");

  const original = totalesDeCuenta(lineas, descuento);
  if (original.descuentoInvalido) return falla(`El descuento ya no corresponde a esta cuenta (${original.descuentoInvalido}) Cambialo o quitalo.`);

  const porParte: LineaDeParte[][] = Array.from({ length: partes }, () => []);
  for (let k = 0; k < lineas.length; k++) {
    const origen = lineas[k];
    const importe = importeDeLinea(origen);
    if (importe > 0 && importe < partes) {
      return falla(`"${origen.nombreProducto}" vale muy poco para dividirlo en ${partes} partes.`);
    }
    // Cada línea empieza el turno de los guaraníes sobrantes en una parte distinta.
    const partesDeLinea = repartirEntero(importe, partes, k);
    const factores = partesDeLinea.map((p) => (importe > 0 ? p / importe : 1 / partes));
    const consumos = repartirConsumo(origen.consumo ?? [], factores);
    for (let i = 0; i < partes; i++) {
      porParte[i].push(lineaDeParteIgual(origen, importe, partesDeLinea[i], partes, consumos[i], i === 0 ? "actualizar" : "crear"));
    }
  }
  return armarPartes(porParte, descuento, original.total);
}

// ---------------------------------------------------------------------------------------------------------------------
//  Dividir por producto
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Qué producto (y cuántas unidades) pasa a qué cuenta nueva. `destino` va de 1 (la cuenta "A") a `destinos` (la última).
 * Un mismo producto puede aparecer varias veces con destinos distintos: 3 parrilladas para 3 personas son 1 que se queda, 1 a la
 * cuenta A y 1 a la B.
 */
export type AsignacionDeLinea = { itemId: string; destino: number; cantidad: number };

/**
 * Pasa productos a cuentas nuevas. Los que no se mencionan se quedan en la cuenta original. Una línea se pasa entera a una sola
 * cuenta, o, si es de varias unidades enteras, se reparte: algunas unidades a una cuenta, otras a otra y el resto se queda (de 3
 * pizzas, 1 a la A, 1 a la B y 1 se queda). Las cantidades quedan enteras y el precio de lista no cambia.
 */
export function dividirPorProducto(
  lineas: LineaBase[],
  descuento: DescuentoPedido | null,
  destinos: number,
  asignaciones: AsignacionDeLinea[]
): ResultadoDivision {
  if (!Number.isInteger(destinos) || destinos < 1 || destinos > PARTES_MAXIMAS - 1) {
    return falla(`Se pueden crear de 1 a ${PARTES_MAXIMAS - 1} cuentas nuevas.`);
  }
  if (lineas.length === 0) return falla("La cuenta no tiene productos para dividir.");

  const original = totalesDeCuenta(lineas, descuento);
  if (original.descuentoInvalido) return falla(`El descuento ya no corresponde a esta cuenta (${original.descuentoInvalido}) Cambialo o quitalo.`);

  // Lo que se pasa de cada producto, por cuenta de destino (lo repetido para la misma cuenta se suma).
  const porId = new Map<string, { destino: number; cantidad: number }[]>();
  for (const a of asignaciones) {
    if (!lineas.some((l) => l.id === a.itemId)) return falla("Uno de los productos ya no está en la cuenta. Actualizá la pantalla.");
    if (!Number.isInteger(a.destino) || a.destino < 1 || a.destino > destinos) return falla("Una cuenta de destino no es válida.");
    if (!Number.isFinite(a.cantidad) || a.cantidad <= 0) return falla("La cantidad a pasar tiene que ser mayor a cero.");
    const lista = porId.get(a.itemId) ?? [];
    const igual = lista.find((x) => x.destino === a.destino);
    if (igual) igual.cantidad += a.cantidad;
    else lista.push({ destino: a.destino, cantidad: a.cantidad });
    porId.set(a.itemId, lista);
  }

  const porParte: LineaDeParte[][] = Array.from({ length: destinos + 1 }, () => []);
  for (const origen of lineas) {
    const lista = [...(porId.get(origen.id) ?? [])].sort((x, y) => x.destino - y.destino);
    if (lista.length === 0) {
      porParte[0].push(lineaIntacta(origen, "conservar"));
      continue;
    }
    const pasa = lista.reduce((s, x) => s + x.cantidad, 0);
    if (pasa > origen.cantidad + 1e-9) {
      return falla(`No se pueden pasar ${formatearCantidad(pasa)} de "${origen.nombreProducto}": hay ${formatearCantidad(origen.cantidad)}.`);
    }
    const quedan = Math.abs(origen.cantidad - pasa) < 1e-9 ? 0 : origen.cantidad - pasa;

    // Se pasa la línea entera a una sola cuenta.
    if (lista.length === 1 && quedan === 0) {
      porParte[lista[0].destino].push(lineaIntacta(origen, "mover"));
      continue;
    }
    // Se reparte la línea: tiene que ser de unidades enteras y a precio entero, para que cada pedazo siga dando enteros exactos.
    if (!Number.isInteger(origen.cantidad) || lista.some((x) => !Number.isInteger(x.cantidad)) || !esEntero(origen.precioUnitario)) {
      return falla(`"${origen.nombreProducto}" solo se puede pasar entero y a una sola cuenta.`);
    }
    const consumos = repartirConsumo(origen.consumo ?? [], [quedan, ...lista.map((x) => x.cantidad)].map((c) => c / origen.cantidad));
    if (quedan > 0) {
      porParte[0].push({
        ...lineaIntacta(origen, "actualizar"),
        cantidad: quedan,
        consumo: consumos[0],
        importe: importeDeLinea({ ...origen, cantidad: quedan }),
      });
    }
    lista.forEach((x, i) => {
      // Si no queda nada en la original, su fila pasa a la primera cuenta (con su parte); las demás son filas nuevas.
      const accion: AccionDeLinea = quedan === 0 && i === 0 ? "mover" : "crear";
      porParte[x.destino].push({
        ...lineaIntacta(origen, accion),
        cantidad: x.cantidad,
        consumo: consumos[i + 1],
        importe: importeDeLinea({ ...origen, cantidad: x.cantidad }),
      });
    });
  }

  if (porParte[0].length === 0) return falla("Dejá al menos un producto en la cuenta original.");
  for (let d = 1; d <= destinos; d++) {
    if (porParte[d].length === 0) return falla(`La cuenta nueva ${letrasDe(d - 1)} no tiene ningún producto: elegí al menos uno.`);
  }
  return armarPartes(porParte, descuento, original.total);
}
