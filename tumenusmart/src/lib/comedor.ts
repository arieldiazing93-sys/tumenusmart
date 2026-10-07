/**
 * Servicio comedor — la lógica que no toca la base (se puede probar sin Prisma).
 *
 * El mozo carga la cuenta de una mesa desde su celular o tablet; cada "Enviar" es una ronda de esa cuenta y manda una
 * comanda a cada impresora (Cocina, Barra...) según el área del producto. Acá viven las reglas del número de mesa y el
 * armado del texto de la comanda.
 */

import { armarDocumento, centrado, filaTabla, negrita, separador } from "./escpos";
import { formatearCantidad, formatearGuarani, formatearMiles, formatearNumero, sinAcentos } from "./format";
import { calcularDescuento, textoPorcentaje, type DescuentoPedido } from "./descuento-venta";
import { desglosarIva } from "./factura-pos";

/** Hasta cuántas letras puede tener el número o nombre de una mesa ("5", "Terraza 2"). */
export const MESA_LARGO_MAXIMO = 20;
/** Hasta cuántas letras puede tener la nota que el mozo le deja a la cocina en un producto. */
export const NOTA_LARGO_MAXIMO = 120;
/** Hasta cuántos segundos atrás cuenta el último latido de una estación para decir que "está imprimiendo". */
export const SEGUNDOS_LATIDO_IMPRESION = 25;
/** Cuántos trabajos de impresión entrega cada consulta de la estación (para no cargarla de golpe). */
export const TRABAJOS_POR_CONSULTA = 5;
/** Pasado este tiempo, un trabajo "imprimiendo" que nadie terminó vuelve a la fila (la estación se cayó a la mitad). */
export const SEGUNDOS_TRABAJO_COLGADO = 60;
/** Cuántas veces se reintenta un trabajo que dio error antes de dejarlo para revisar a mano. */
export const REINTENTOS_MAXIMOS = 3;

/**
 * Un texto sin caracteres de control (los de código 0 a 31 y el 127): lo que escribe el mozo no puede llevar comandos de la
 * impresora (cortar el papel, cambiar la letra) ni bytes 0x00, que la base de datos no acepta.
 */
function sinControles(texto: string): string {
  return texto.replace(/[\x00-\x1F\x7F]/g, " ");
}

/**
 * El número o nombre de la mesa como se muestra: sin espacios de más y con un largo razonable. Devuelve null si no
 * queda nada (o si es demasiado largo).
 */
export function normalizarMesa(texto: unknown): string | null {
  const limpio = sinControles(String(texto ?? "")).replace(/\s+/g, " ").trim();
  if (!limpio || limpio.length > MESA_LARGO_MAXIMO) return null;
  return limpio;
}

export const SECTOR_LARGO_MAXIMO = 30;

/** El nombre de un sector del restaurante ("Salón", "Terraza"), limpio y con tope; null si no queda nada o es muy largo. */
export function normalizarSector(texto: unknown): string | null {
  const limpio = sinControles(String(texto ?? "")).replace(/\s+/g, " ").trim();
  if (!limpio || limpio.length > SECTOR_LARGO_MAXIMO) return null;
  return limpio;
}

/**
 * La clave con la que se reconoce a una mesa: sin mayúsculas, acentos ni espacios repetidos, para que "Mesa 5", "mesa 5"
 * y "MESA  5" sean la misma mesa y no se puedan abrir dos cuentas a la vez en ella.
 */
export function claveDeMesa(mesa: string): string {
  return mesa
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** La nota de un producto, limpia y con tope; null si no escribió nada. */
export function normalizarNota(texto: unknown): string | null {
  const limpio = sinControles(String(texto ?? "")).replace(/\s+/g, " ").trim().slice(0, NOTA_LARGO_MAXIMO);
  return limpio || null;
}

/** Lo que se imprime de cada producto en la comanda. */
export type LineaComanda = {
  cantidad: number;
  nombre: string;
  /** "Extra queso, Cheddar" */
  opciones?: string | null;
  /** "Sin: tomate, cebolla" */
  quitados?: string | null;
  /** La nota del mozo para la cocina. */
  nota?: string | null;
};

/**
 * La comanda de UN área (Cocina, Barra...) para una ronda de una mesa, en texto crudo ESC/POS listo para la impresora
 * térmica (mismos helpers que el resto de los comprobantes, ver escpos.ts). Sin acentos ni eñes: la impresora en modo
 * "Generic / Text Only" los muestra mal, igual que pasaba con el ticket.
 */
export function textoComanda(datos: {
  mesa: string;
  mozo: string;
  ronda: number;
  area: string;
  /** La hora ya formateada ("03/10 12:45"). */
  hora: string;
  lineas: LineaComanda[];
  /** Si no es una mesa (la comanda de una cuenta de delivery): el título que va en lugar de "MESA 5" ("DELIVERY 12"). */
  titulo?: string;
  /** La línea que va en lugar de "Mozo: Ana" ("Cliente: Pedro"). */
  persona?: string;
}): string {
  // Sin acentos y sin caracteres de control: nada de lo que viene de afuera puede colar comandos de impresora en la comanda.
  const s = (texto: string) => sinControles(sinAcentos(texto));
  const l: string[] = [separador()];
  l.push(negrita(centrado(s(datos.titulo ?? `MESA ${datos.mesa}`).toUpperCase())));
  l.push(centrado(s(datos.area).toUpperCase()));
  l.push(separador());
  l.push(`${datos.hora}   Pedido ${datos.ronda}`);
  l.push(s(datos.persona ?? `Mozo: ${datos.mozo}`));
  l.push(separador());
  for (const x of datos.lineas) {
    l.push(s(`${x.cantidad} x ${x.nombre}`).toUpperCase());
    if (x.opciones) l.push(s(`  + ${x.opciones}`));
    if (x.quitados) l.push(`  ${negrita(s(`** ${x.quitados} **`))}`);
    if (x.nota) l.push(s(`  >> ${x.nota}`));
  }
  l.push(separador());
  return armarDocumento(l);
}

// Los comandos de la impresora (negrita apagada, corte de papel) llevan el byte 0x00, y PostgreSQL no deja guardar ese byte
// en un campo de texto ("invalid byte sequence for encoding UTF8: 0x00"). Se guarda una marca en su lugar y se vuelve a
// poner el byte justo antes de imprimir. U+E000 es un carácter de uso privado: no aparece en ningún texto real.
const MARCA_NUL = String.fromCharCode(0xe000);

/** El texto de una comanda tal como se guarda en la base: sin bytes 0x00. */
export function contenidoParaGuardar(texto: string): string {
  return texto.split(MARCA_NUL).join("").replace(/\x00/g, MARCA_NUL);
}

/** Lo que se le manda a la impresora: el texto guardado con los bytes 0x00 de vuelta en su lugar. */
export function contenidoParaImprimir(guardado: string): string {
  return guardado.split(MARCA_NUL).join("\x00");
}

/**
 * La comanda tal como se lee en pantalla: sin los comandos de la impresora (inicio, negrita, corte), que solo ella entiende.
 * Sirve para ver qué se va a imprimir sin gastar papel (o cuando la "impresora" es un PDF y no entiende ESC/POS).
 */
export function comandaLegible(guardado: string): string {
  return contenidoParaImprimir(guardado)
    .replace(/\x1B\x40|\x1B\x45[\x00\x01]|\x1D\x56[\x00-\x03]/g, "")
    .replace(/[\x00-\x09\x0B-\x1F]/g, "")
    .trim();
}

/**
 * Lo que vale UNA línea de la cuenta (precio por cantidad), en guaraníes enteros: lo que se muestra en la cuenta y lo que se
 * cobra. Con cantidades enteras no cambia nada; con cantidades con decimales (la parte de una cuenta dividida en partes iguales,
 * ver src/lib/division-cuenta.ts) se redondea AL GUARANÍ, y esas líneas se arman para que el producto dé justo un entero.
 */
export function importeDeLinea(x: { precioUnitario: number; cantidad: number }): number {
  return Math.round(x.precioUnitario * x.cantidad);
}

/** Lo que vale una lista de productos de una cuenta (el importe entero de cada línea, sumado). */
export function totalDeLineas(lineas: { precioUnitario: number; cantidad: number }[]): number {
  return lineas.reduce((suma, x) => suma + importeDeLinea(x), 0);
}

/**
 * La clave con la que dos líneas de una cuenta cuentan como "el mismo producto": mismo nombre, mismas opciones y mismo precio
 * (y, si `conNotas`, la misma nota de cocina y los mismos ingredientes quitados: dos papas, una "sin sal" y otra normal, siguen
 * siendo dos filas en la pantalla de la caja). Para el papel de la cuenta y para la factura las notas de cocina no cuentan.
 */
export function claveDeLinea(
  l: {
    productId?: string | null;
    nombre: string;
    opciones?: string | null;
    quitados?: string | null;
    nota?: string | null;
    precioUnitario: number;
    iva?: string | null;
    costoProducto?: number | null;
    costoAgregados?: number | null;
    precioAgregados?: number | null;
  },
  conNotas: boolean
): string {
  return [
    l.productId ?? "",
    l.nombre,
    l.opciones ?? "",
    conNotas ? (l.quitados ?? "") : "",
    conNotas ? (l.nota ?? "") : "",
    l.precioUnitario,
    l.iva ?? "",
    l.costoProducto ?? "",
    l.costoAgregados ?? "",
    l.precioAgregados ?? "",
  ].join("\u0001");
}

/** Junta las líneas por clave, en el orden en que aparece por primera vez cada una. */
export function agruparPorClave<T>(lineas: T[], clave: (l: T) => string): T[][] {
  const grupos = new Map<string, T[]>();
  for (const l of lineas) {
    const k = clave(l);
    const grupo = grupos.get(k);
    if (grupo) grupo.push(l);
    else grupos.set(k, [l]);
  }
  return [...grupos.values()];
}

/**
 * Reparte `cantidad` unidades entre las filas de un producto que se muestra en una sola línea (las filas van de la más vieja
 * a la más nueva): se toma primero de la más nueva —lo último que se cargó, que es lo que suele sobrar— y, si no alcanza, de la
 * anterior. Devuelve cuántas unidades salen de cada fila (solo las que aportan). Si se pide todo, salen todas completas.
 */
export function repartirEnFilas(filas: { id: string; cantidad: number }[], cantidad: number): { itemId: string; cantidad: number }[] {
  const partes: { itemId: string; cantidad: number }[] = [];
  let faltan = cantidad;
  for (let i = filas.length - 1; i >= 0 && faltan > 1e-9; i--) {
    const toma = Math.min(faltan, filas[i].cantidad);
    partes.push({ itemId: filas[i].id, cantidad: toma });
    faltan -= toma;
  }
  return partes;
}

/**
 * Une las líneas iguales en una sola con la cantidad sumada (la primera de cada grupo, con su cantidad cambiada). Lo que se
 * cobra no cambia: el total de las líneas unidas es la suma de los totales de las originales (cada una es un entero de
 * guaraníes y comparten el precio).
 */
export function sumarLineasIguales<T extends { cantidad: number }>(lineas: T[], clave: (l: T) => string): T[] {
  return agruparPorClave(lineas, clave).map((grupo) => ({
    ...grupo[0],
    cantidad: Math.round(grupo.reduce((s, l) => s + l.cantidad, 0) * 10000) / 10000,
  }));
}

/** Una línea de la cuenta con lo que hace falta para cobrarla y facturarla. */
export type LineaDeCobro = {
  productId: string | null;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  iva: string;
  opcionesTexto: string | null;
  costoProducto: number | null;
  costoAgregados: number | null;
  precioAgregados: number;
  /** true en el costo de envío de un delivery: no recibe nada del descuento general (ver desglosarIva). */
  sinDescuento?: boolean;
};

/**
 * Las líneas tal como se cobran y se facturan: el mismo producto cargado en varios pedidos va en UNA línea con la cantidad
 * sumada (la nota de cocina no cuenta: no sale en la venta ni en la factura). Lo usan el cobro y la pantalla de la caja, así lo
 * que se ve en el pie de la cuenta (impuestos incluidos) es lo que después sale en la factura.
 */
export function lineasDeCobro<T extends LineaDeCobro>(items: T[]): T[] {
  return sumarLineasIguales(items, (l) =>
    claveDeLinea(
      {
        productId: l.productId,
        nombre: l.nombreProducto,
        opciones: l.opcionesTexto,
        precioUnitario: l.precioUnitario,
        iva: l.iva,
        costoProducto: l.costoProducto,
        costoAgregados: l.costoAgregados,
        precioAgregados: l.precioAgregados,
      },
      false
    )
  );
}

/** El IVA que lleva una cuenta, en guaraníes enteros (ya sobre lo que se cobra, con el descuento aplicado). */
export type ImpuestosDeCuenta = {
  /** IVA contenido en las ventas gravadas al 10 %. */
  iva10: number;
  /** IVA contenido en las ventas gravadas al 5 %. */
  iva5: number;
  /** Lo que se vende exento (sin IVA). */
  exento: number;
  /** iva10 + iva5: lo que va en "Impuestos" al pie de la cuenta. */
  total: number;
};

/**
 * Los impuestos de la cuenta, con la misma cuenta que la factura (`desglosarIva`: el precio ya incluye el IVA, se saca ÷11 al 10 %
 * y ÷21 al 5 %, con el descuento repartido línea por línea). El precio de la carta ya lo trae adentro: no suma al total.
 */
export function impuestosDeCuenta(lineas: LineaDeCobro[], descuento: number): ImpuestosDeCuenta {
  const d = desglosarIva(lineas, descuento);
  const iva10 = Math.round(d.iva10);
  const iva5 = Math.round(d.iva5);
  return { iva10, iva5, exento: Math.round(d.exento), total: iva10 + iva5 };
}

/**
 * Agrupa por Área de Impresión. Los productos sin área quedan afuera a propósito: no salen en ninguna comanda, igual que
 * en los pedidos de la carta y el Punto de Venta.
 */
export function agruparPorArea<T extends { areaImpresionId: string | null }>(lineas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const x of lineas) {
    if (!x.areaImpresionId) continue;
    const grupo = mapa.get(x.areaImpresionId);
    if (grupo) grupo.push(x);
    else mapa.set(x.areaImpresionId, [x]);
  }
  return mapa;
}

/** Los insumos que descontó un producto al enviarse, tal como se guardan para poder devolverlos al anularlo. */
export type ConsumoGuardado = { insumoId: string; almacenId: string | null; cantidad: number };

// ---------------------------------------------------------------------------------------------------------------------
//  La cuenta que opera la caja (Fase 2)
// ---------------------------------------------------------------------------------------------------------------------

/** Los estados en que una mesa sigue ocupada: la cuenta todavía no se pagó ni se canceló. */
export const ESTADOS_CUENTA_ABIERTA = ["abierta", "por_cobrar"] as const;

/** Lo que dice el estado de una cuenta, en palabras del salón. */
export function textoEstadoCuenta(estado: string): string {
  if (estado === "abierta") return "Abierta";
  if (estado === "por_cobrar") return "Cuenta impresa";
  if (estado === "pagada") return "Pagada";
  return "Cancelada";
}

/** El descuento guardado en la cuenta, como lo entiende `calcularDescuento`; null si no tiene ninguno. */
export function descuentoDeCuenta(cuenta: { descuentoTipo: string | null; descuentoValor: unknown }): DescuentoPedido | null {
  if (cuenta.descuentoTipo !== "porcentaje" && cuenta.descuentoTipo !== "monto") return null;
  const valor = Number(cuenta.descuentoValor);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return { tipo: cuenta.descuentoTipo, valor };
}

export type TotalesDeCuenta = {
  subtotal: number;
  /** Guaraníes que se restan (0 si no hay descuento). */
  descuento: number;
  porcentaje: number | null;
  /** Lo que se cobra. */
  total: number;
  /** Si el descuento ya no corresponde (se cancelaron productos y quedó igual o mayor a la cuenta): el motivo. */
  descuentoInvalido: string | null;
};

/**
 * Lo que vale una cuenta con su descuento. Se calcula siempre sobre los productos que siguen activos, así que si se
 * cancela algo el descuento por porcentaje se ajusta solo. Un descuento en monto fijo que ya no cabe en la cuenta no se
 * aplica y se avisa (`descuentoInvalido`): no se puede cobrar así hasta que la caja lo corrija.
 */
export function totalesDeCuenta(
  lineas: { precioUnitario: number; cantidad: number }[],
  pedido: DescuentoPedido | null
): TotalesDeCuenta {
  const subtotal = totalDeLineas(lineas);
  const calculado = calcularDescuento(subtotal, pedido);
  if (!calculado.ok) {
    return { subtotal, descuento: 0, porcentaje: null, total: subtotal, descuentoInvalido: calculado.error };
  }
  return {
    subtotal,
    descuento: calculado.monto,
    porcentaje: calculado.porcentaje,
    total: subtotal - calculado.monto,
    descuentoInvalido: null,
  };
}

/**
 * La cuenta de la mesa para entregar al cliente (no es una factura), en texto crudo ESC/POS. Sale en la impresora del
 * ticket de la estación de caja. Mismos helpers y mismo ancho que el resto de los comprobantes.
 */
export function textoCuenta(datos: {
  local: string;
  mesa: string;
  numero: number;
  mozo: string;
  /** La hora ya formateada ("03/10 12:45"). */
  hora: string;
  lineas: (LineaComanda & { precioUnitario: number })[];
  totales: TotalesDeCuenta;
  /** Si la cuenta salió de dividir otra: la mesa original ("1" para la cuenta "1-A"). */
  divididaDe?: string | null;
  /** Si no es una mesa (la cuenta de un delivery): el encabezado que va en lugar de "Mesa 5   Cuenta 3" ("Delivery   Cuenta 12"). */
  titulo?: string;
  /** La línea que va en lugar de "Mozo: Ana" ("Cliente: Pedro"). */
  persona?: string;
  /** Una línea de dirección u otro dato de la entrega (ya sin enlaces largos), debajo de la persona. */
  detalle?: string;
  /** El costo de envío de un delivery: sale como línea aparte, sin descuento, y ya está sumado en `totales.total`. */
  envio?: number;
}): string {
  const s = (texto: string) => sinControles(sinAcentos(texto));
  const l: string[] = [separador()];
  l.push(negrita(centrado(s(datos.local).toUpperCase())));
  l.push(centrado("CUENTA - NO ES FACTURA"));
  l.push(separador());
  l.push(s(datos.titulo ?? `Mesa ${datos.mesa}   Cuenta ${formatearNumero(datos.numero)}`));
  if (datos.divididaDe) l.push(s(`Cuenta dividida de la mesa ${datos.divididaDe}`));
  l.push(s(datos.persona ?? `Mozo: ${datos.mozo}`));
  if (datos.detalle) l.push(s(datos.detalle));
  l.push(datos.hora);
  l.push(separador());
  l.push(filaTabla("Ctd", "Descripcion", "Importe"));
  for (const x of datos.lineas) {
    l.push(filaTabla(formatearCantidad(x.cantidad), s(x.nombre), formatearMiles(importeDeLinea(x))));
    if (x.opciones) l.push(s(`  + ${x.opciones}`));
  }
  l.push(separador());
  const t = datos.totales;
  const envio = datos.envio ?? 0;
  if (t.descuento > 0 || envio > 0) {
    l.push(`SUBTOTAL: ${formatearGuarani(t.subtotal)}`);
    if (t.descuento > 0) {
      l.push(`DESCUENTO${t.porcentaje != null ? ` ${textoPorcentaje(t.porcentaje)}%` : ""}: -${formatearGuarani(t.descuento)}`);
    }
    if (envio > 0) l.push(`ENVIO: ${formatearGuarani(envio)}`);
  }
  l.push(negrita(`TOTAL: ${formatearGuarani(t.total)}`));
  l.push(separador());
  l.push(centrado("Gracias por su visita"));
  return armarDocumento(l);
}

/** El aviso para la cocina o la barra de que un producto que ya se había pedido se cancela: que no lo preparen. */
export function textoAnulacion(datos: {
  mesa: string;
  area: string;
  /** La hora ya formateada ("03/10 12:45"). */
  hora: string;
  quien: string;
  cantidad: number;
  nombre: string;
  opciones?: string | null;
  motivo: string;
  /** Si no es una mesa (un delivery): el título que va en lugar de "MESA 5" ("DELIVERY 12"). */
  titulo?: string;
}): string {
  const s = (texto: string) => sinControles(sinAcentos(texto));
  const l: string[] = [separador()];
  l.push(negrita(centrado("*** ANULADO ***")));
  l.push(negrita(centrado(s(datos.titulo ?? `MESA ${datos.mesa}`).toUpperCase())));
  l.push(centrado(s(datos.area).toUpperCase()));
  l.push(separador());
  l.push(datos.hora);
  l.push(s(`Anulo: ${datos.quien}`));
  l.push(separador());
  l.push(s(`${formatearCantidad(datos.cantidad)} x ${datos.nombre}`).toUpperCase());
  if (datos.opciones) l.push(s(`  + ${datos.opciones}`));
  l.push(s(`Motivo: ${datos.motivo}`));
  l.push(separador());
  return armarDocumento(l);
}

/** Lo que descontó un producto al enviarse, tal como quedó guardado (se ignora lo que no tenga la forma esperada). */
export function leerConsumoGuardado(valor: unknown): ConsumoGuardado[] {
  if (!Array.isArray(valor)) return [];
  const lista: ConsumoGuardado[] = [];
  for (const x of valor) {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      const o = x as { insumoId?: unknown; almacenId?: unknown; cantidad?: unknown };
      if (typeof o.insumoId === "string" && typeof o.cantidad === "number") {
        lista.push({
          insumoId: o.insumoId,
          almacenId: typeof o.almacenId === "string" ? o.almacenId : null,
          cantidad: o.cantidad,
        });
      }
    }
  }
  return lista;
}

// ---------------------------------------------------------------------------------------------------------------------
//  El PIN del mozo
// ---------------------------------------------------------------------------------------------------------------------

/**
 * El PIN con el que el mozo entra a su celular o tablet: SOLO NÚMEROS, de 3 a 5. Es más corto que el de asistencia (4 a 6) a
 * propósito: el mozo entra muchas veces por turno y le sirve algo fácil de recordar, como los últimos 3 de su cédula o de su
 * teléfono. Lo que puede hacer un mozo con su PIN es cargar pedidos: no cancela, no da descuentos ni cobra. Por eso el freno a los
 * intentos incorrectos (src/lib/limite-pin.ts) y el enlace secreto del local son lo que lo protege.
 */
export const PIN_MOZO_MINIMO = 3;
export const PIN_MOZO_MAXIMO = 5;
/** Al ENTRAR se siguen aceptando 6 (los PIN de 6 que ya se habían creado no se quedan afuera); al crear o cambiar, el tope es 5. */
export const PIN_MOZO_MAXIMO_AL_ENTRAR = 6;

/** ¿Sirve como PIN nuevo de un mozo? Solo números, de 3 a 5. */
export function pinDeMozoValido(pin: string): boolean {
  return /^\d{3,5}$/.test(pin);
}

/** ¿Es un PIN que se puede probar al entrar? Solo números, de 3 a 6 (por los PIN de 6 que ya existían). */
export function pinDeMozoAceptadoAlEntrar(pin: string): boolean {
  return /^\d{3,6}$/.test(pin);
}
