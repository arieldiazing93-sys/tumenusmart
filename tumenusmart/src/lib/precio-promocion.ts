/**
 * Precios de promoción: el precio de un producto que vale solo en ciertos días
 * y horas de la semana, y que vuelve solo al precio normal cuando pasa la franja
 * (ej: "la pizza mozzarella sale 30.000, pero de lunes a viernes entre las 18 y
 * las 20 sale 27.000").
 *
 * Cada producto puede tener hasta una promoción por día de inicio (como la hoja
 * "Precios de promoción" de SoftRestaurant): un día y hora de inicio, un día y
 * hora de fin (que puede ser otro día, para las que cruzan la medianoche) y el
 * precio. Todo en hora de Asunción, la del local.
 *
 * Es lógica PURA (sin base de datos ni Prisma): la usan por igual el servidor,
 * que es quien manda el precio que se cobra, y las pantallas, que lo muestran.
 * Así los dos calculan exactamente lo mismo y se puede probar de verdad, que es
 * lo mínimo para algo que toca plata.
 *
 * LAS REGLAS DEL TIEMPO (acá no puede quedar ningún hueco ni ningún segundo con
 * dos precios):
 *  - La semana es un círculo de 604.800 segundos (domingo 00:00:00 = 0). Cada
 *    instante cae en un único segundo de ese círculo.
 *  - Una promoción vale desde su hora de inicio, INCLUIDA, hasta su hora de fin,
 *    EXCLUIDA: a las 20:00:00 ya vale el precio normal. Una hora de fin con
 *    segundos en 59 ("19:59:59", "23:59:59") se lee como "hasta el final de ese
 *    minuto": 19:59:59 y 20:00:00 significan lo mismo. Así dos promociones
 *    seguidas ("18 a 20" y "20 a 22") encajan sin hueco y sin pisarse, y
 *    "00:00:00 a 23:59:59" cubre el día entero, sin el segundo suelto del
 *    medio.
 *  - El fin puede caer en otro día: "viernes 22:00 a sábado 02:00". Cruzar del
 *    sábado al domingo también anda (el círculo se cierra).
 *  - Dos promociones de un mismo producto no pueden pisarse: un momento tiene un
 *    solo precio. Se rechaza al guardar; si de todos modos llegaran dos (datos
 *    viejos), gana la que empezó más recientemente.
 */

import { ZONA_NEGOCIO } from "./timezone";
import { NOMBRES_DIA } from "./horario-atencion";
import { formatearGuarani } from "./format";

export const SEGUNDOS_DIA = 86_400;
export const SEGUNDOS_SEMANA = 7 * SEGUNDOS_DIA;
/** Tope de un precio (guaraníes enteros): el mismo orden de magnitud que el de un producto. */
export const PRECIO_MAXIMO = 99_999_999;

/** Una promoción. Los días son 0 = domingo … 6 = sábado; las horas "HH:MM:SS". */
export type TramoPromocion = {
  diaInicio: number;
  horaInicio: string;
  diaFin: number;
  horaFin: string;
  precio: number;
};

// ---------------------------------------------------------------------------------------------------------------------
//  Horas
// ---------------------------------------------------------------------------------------------------------------------

/** "18:00", "18:00:00" o "8:5:3" no: solo HH:MM o HH:MM:SS. Devuelve los segundos desde la medianoche, o null si no es una hora. */
export function segundosDeHora(texto: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(texto ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  return h * 3600 + mi * 60 + s;
}

/** Segundos desde la medianoche → "HH:MM:SS". */
export function textoDeHora(segundos: number): string {
  const s = Math.max(0, Math.min(SEGUNDOS_DIA - 1, Math.floor(segundos)));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/**
 * Hasta dónde llega la promoción, como límite que ya NO vale (excluido). Un fin con segundos en 59 se lee como "hasta
 * el final de ese minuto" (23:59:59 → las 24:00:00, o sea el principio del día siguiente).
 */
export function limiteFinExclusivo(segundosFin: number): number {
  return segundosFin % 60 === 59 ? segundosFin + 1 : segundosFin;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Ventanas sobre el círculo de la semana
// ---------------------------------------------------------------------------------------------------------------------

export type Ventana = { inicio: number; duracion: number; precio: number; tramo: TramoPromocion };

function esDia(d: unknown): d is number {
  return typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6;
}

/** La franja de un tramo sobre el círculo de la semana, o null si el tramo no es válido (día o hora inexistentes, fin antes del inicio el mismo día). */
export function ventanaDeTramo(t: TramoPromocion): Ventana | null {
  if (!esDia(t.diaInicio) || !esDia(t.diaFin)) return null;
  const si = segundosDeHora(t.horaInicio);
  const sf = segundosDeHora(t.horaFin);
  if (si === null || sf === null) return null;
  const inicio = t.diaInicio * SEGUNDOS_DIA + si;
  const finExclusivo = t.diaFin * SEGUNDOS_DIA + limiteFinExclusivo(sf);
  let duracion = finExclusivo - inicio;
  if (duracion <= 0) {
    // El mismo día, el fin tiene que quedar después del inicio: si no, no se sabe si quiso cruzar la medianoche.
    if (t.diaFin === t.diaInicio) return null;
    // Otro día cuyo número es menor (sábado → domingo): el círculo de la semana se cierra.
    duracion += SEGUNDOS_SEMANA;
  }
  return { inicio, duracion, precio: t.precio, tramo: t };
}

/** ¿Cae la posición `pos` (0..604799) dentro de la ventana? Es la cuenta de todo el módulo: una resta y un módulo. */
export function ventanaContiene(v: Ventana, pos: number): boolean {
  return (((pos - v.inicio) % SEGUNDOS_SEMANA) + SEGUNDOS_SEMANA) % SEGUNDOS_SEMANA < v.duracion;
}

/** La promoción que vale en el segundo `pos` de la semana, o null si ese segundo es de precio normal. */
export function tramoEnPosicion(tramos: TramoPromocion[] | undefined, pos: number): TramoPromocion | null {
  if (!tramos || tramos.length === 0) return null;
  let mejor: Ventana | null = null;
  let mejorDelta = Infinity;
  for (const t of tramos) {
    const v = ventanaDeTramo(t);
    if (!v) continue;
    const delta = (((pos - v.inicio) % SEGUNDOS_SEMANA) + SEGUNDOS_SEMANA) % SEGUNDOS_SEMANA;
    // Si dos se pisaran (datos viejos), gana la que empezó más cerca de este momento.
    if (delta < v.duracion && delta < mejorDelta) {
      mejor = v;
      mejorDelta = delta;
    }
  }
  return mejor ? mejor.tramo : null;
}

// ---------------------------------------------------------------------------------------------------------------------
//  El reloj del local
// ---------------------------------------------------------------------------------------------------------------------

const DIA_POR_NOMBRE: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
let formateador: Intl.DateTimeFormat | null = null;

/** El segundo de la semana (0 = domingo 00:00:00 … 604799 = sábado 23:59:59) de un instante, en hora de Asunción. */
export function segundoDeSemanaAsuncion(instante: Date | number): number {
  if (!formateador) {
    formateador = new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONA_NEGOCIO,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  }
  const f = new Date(typeof instante === "number" ? instante : instante.getTime());
  let dia = 0;
  let h = 0;
  let m = 0;
  let s = 0;
  for (const p of formateador.formatToParts(f)) {
    if (p.type === "weekday") dia = DIA_POR_NOMBRE[p.value] ?? 0;
    else if (p.type === "hour") h = Number(p.value) % 24;
    else if (p.type === "minute") m = Number(p.value);
    else if (p.type === "second") s = Number(p.value);
  }
  return dia * SEGUNDOS_DIA + h * 3600 + m * 60 + s;
}

// ---------------------------------------------------------------------------------------------------------------------
//  El precio de ahora
// ---------------------------------------------------------------------------------------------------------------------

export type PrecioVigente = { precio: number; precioNormal: number; enPromocion: boolean };

/** El precio de un producto (o agregado) en un segundo de la semana. */
export function precioEnPosicion(precioNormal: number, tramos: TramoPromocion[] | undefined, pos: number): PrecioVigente {
  const t = tramoEnPosicion(tramos, pos);
  return t
    ? { precio: t.precio, precioNormal, enPromocion: true }
    : { precio: precioNormal, precioNormal, enPromocion: false };
}

/** El precio de un producto (o agregado) en este momento: el de la promoción si estamos dentro de una, o el normal. */
export function precioVigente(
  precioNormal: number,
  tramos: TramoPromocion[] | undefined,
  ahora: Date | number = new Date()
): PrecioVigente {
  if (!tramos || tramos.length === 0) return { precio: precioNormal, precioNormal, enPromocion: false };
  return precioEnPosicion(precioNormal, tramos, segundoDeSemanaAsuncion(ahora));
}

/**
 * Cuántos segundos faltan para el próximo momento en que cambia algún precio (empieza o termina alguna promoción de
 * `tramos`). Null si no hay ninguna promoción. Sirve para que una pantalla abierta se actualice justo cuando cambia el
 * precio, sin consultar al servidor cada rato.
 */
export function segundosHastaElProximoCambio(
  tramos: TramoPromocion[] | undefined,
  ahora: Date | number = new Date()
): number | null {
  if (!tramos || tramos.length === 0) return null;
  const pos = segundoDeSemanaAsuncion(ahora);
  let menor: number | null = null;
  for (const t of tramos) {
    const v = ventanaDeTramo(t);
    if (!v) continue;
    const fin = (v.inicio + v.duracion) % SEGUNDOS_SEMANA;
    for (const limite of [v.inicio, fin]) {
      // Si el límite es justo este segundo, el cambio ya pasó: el próximo es de acá a una semana (o de otra promoción).
      const falta = (((limite - pos) % SEGUNDOS_SEMANA) + SEGUNDOS_SEMANA) % SEGUNDOS_SEMANA || SEGUNDOS_SEMANA;
      if (menor === null || falta < menor) menor = falta;
    }
  }
  return menor;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Guardar: validar lo que escribió el dueño
// ---------------------------------------------------------------------------------------------------------------------

/** "Lunes 18:00:00 a 19:59:59" / "Viernes 22:00:00 a Sábado 02:00:00" */
export function describirFranja(t: TramoPromocion): string {
  const ini = `${NOMBRES_DIA[t.diaInicio] ?? "?"} ${t.horaInicio}`;
  return t.diaFin === t.diaInicio
    ? `${ini} a ${t.horaFin}`
    : `${ini} a ${NOMBRES_DIA[t.diaFin] ?? "?"} ${t.horaFin}`;
}

export function describirTramo(t: TramoPromocion): string {
  return `${describirFranja(t)}, a ${formatearGuarani(t.precio)}`;
}

export type ResultadoValidacion = { ok: true; tramos: TramoPromocion[] } | { ok: false; error: string };

/**
 * Revisa las promociones que quiere guardar el dueño (llegan del navegador: no se confía en nada) y las deja
 * normalizadas ("HH:MM" → "HH:MM:SS", precio entero). Rechaza, con el motivo en castellano:
 *  - un día u hora que no existe, un precio que no es un monto entero entre 1 y 99.999.999;
 *  - dos promociones que empiezan el mismo día;
 *  - un fin que queda antes del inicio el mismo día (si cruza la medianoche, el fin es el día siguiente);
 *  - dos promociones que se pisan: un momento tiene un solo precio.
 */
export function validarTramos(entradas: unknown): ResultadoValidacion {
  if (!Array.isArray(entradas)) return { ok: false, error: "Las promociones no llegaron bien." };
  if (entradas.length > 7) return { ok: false, error: "Hay como máximo una promoción por día de inicio (7 en total)." };

  const tramos: TramoPromocion[] = [];
  const ventanas: Ventana[] = [];
  const diasUsados = new Set<number>();

  for (const e of entradas) {
    const crudo = (e ?? {}) as Record<string, unknown>;
    const diaInicio = typeof crudo.diaInicio === "number" ? crudo.diaInicio : Number(crudo.diaInicio);
    const diaFin = typeof crudo.diaFin === "number" ? crudo.diaFin : Number(crudo.diaFin);
    if (!esDia(diaInicio) || !esDia(diaFin)) return { ok: false, error: "Hay una promoción con un día que no existe." };
    const nombreDia = NOMBRES_DIA[diaInicio];

    const si = segundosDeHora(String(crudo.horaInicio ?? ""));
    const sf = segundosDeHora(String(crudo.horaFin ?? ""));
    if (si === null) return { ok: false, error: `La hora de inicio del ${nombreDia} no es válida.` };
    if (sf === null) return { ok: false, error: `La hora de fin del ${nombreDia} no es válida.` };

    const precioCrudo = typeof crudo.precio === "number" ? crudo.precio : Number(String(crudo.precio ?? "").replace(",", "."));
    if (!Number.isFinite(precioCrudo) || precioCrudo <= 0 || precioCrudo > PRECIO_MAXIMO) {
      return { ok: false, error: `El precio de promoción del ${nombreDia} tiene que ser un monto mayor a cero.` };
    }
    const precio = Math.round(precioCrudo);

    if (diasUsados.has(diaInicio)) {
      return { ok: false, error: `Hay dos promociones que empiezan el ${nombreDia}: dejá una sola.` };
    }
    diasUsados.add(diaInicio);

    const tramo: TramoPromocion = { diaInicio, horaInicio: textoDeHora(si), diaFin, horaFin: textoDeHora(sf), precio };
    const v = ventanaDeTramo(tramo);
    if (!v) {
      return {
        ok: false,
        error: `La promoción del ${nombreDia} termina antes de empezar (${tramo.horaInicio} a ${tramo.horaFin}). Si cruza la medianoche, elegí el día siguiente en "Fin".`,
      };
    }
    tramos.push(tramo);
    ventanas.push(v);
  }

  // Dos franjas se pisan si el inicio de una cae adentro de la otra (en el círculo de la semana).
  for (let i = 0; i < ventanas.length; i++) {
    for (let j = i + 1; j < ventanas.length; j++) {
      if (ventanaContiene(ventanas[i], ventanas[j].inicio) || ventanaContiene(ventanas[j], ventanas[i].inicio)) {
        return {
          ok: false,
          error: `La promoción del ${NOMBRES_DIA[tramos[i].diaInicio]} (${describirFranja(tramos[i])}) se pisa con la del ${NOMBRES_DIA[tramos[j].diaInicio]} (${describirFranja(tramos[j])}). Un mismo momento tiene un solo precio: ajustá las horas para que no se superpongan.`,
        };
      }
    }
  }

  return { ok: true, tramos };
}

// ---------------------------------------------------------------------------------------------------------------------
//  De la base al cálculo
// ---------------------------------------------------------------------------------------------------------------------

/** Lo que hay que pedirle a Prisma de las promociones de un producto (`promociones: SELECCION_PROMOCIONES`). */
export const SELECCION_PROMOCIONES = {
  select: { diaInicio: true, horaInicio: true, diaFin: true, horaFin: true, precio: true },
} as const;

/** Una fila de promoción como sale de la base (el precio llega como Decimal). */
export type FilaDePromocion = {
  diaInicio: number;
  horaInicio: string;
  diaFin: number;
  horaFin: string;
  precio: { toString(): string } | number | string;
};

/** Las filas de la base → los tramos que usa el cálculo. */
export function tramosDeFilas(filas: FilaDePromocion[] | undefined): TramoPromocion[] {
  return (filas ?? []).map((f) => ({
    diaInicio: f.diaInicio,
    horaInicio: f.horaInicio,
    diaFin: f.diaFin,
    horaFin: f.horaFin,
    precio: Number(f.precio.toString()),
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
//  Franjas sin precio (las usan las Promociones por descuento y por volumen)
// ---------------------------------------------------------------------------------------------------------------------

/** Un día y hora de inicio, un día y hora de fin: las mismas reglas del tiempo que las promociones de precio, pero sin precio. */
export type Franja = { diaInicio: number; horaInicio: string; diaFin: number; horaFin: string };

/** ¿Cae el segundo `pos` de la semana adentro de la franja? (la hora de fin queda excluida, igual que en `ventanaDeTramo`). */
export function franjaContiene(f: Franja, pos: number): boolean {
  const v = ventanaDeTramo({ ...f, precio: 0 });
  return !!v && ventanaContiene(v, pos);
}

/** ¿Se pisan dos conjuntos de franjas (alguna franja de uno comparte algún segundo con alguna del otro)? */
export function franjasSePisan(a: Franja[], b: Franja[]): boolean {
  for (const x of a) {
    const vx = ventanaDeTramo({ ...x, precio: 0 });
    if (!vx) continue;
    for (const y of b) {
      const vy = ventanaDeTramo({ ...y, precio: 0 });
      if (!vy) continue;
      if (ventanaContiene(vx, vy.inicio) || ventanaContiene(vy, vx.inicio)) return true;
    }
  }
  return false;
}

export type ResultadoFranjas = { ok: true; franjas: Franja[] } | { ok: false; error: string };

/**
 * Revisa las franjas que escribió el dueño (días y horas que existen, ninguna que termine antes de empezar, una sola por día de
 * inicio, ninguna que se pise con otra) y las deja normalizadas ("HH:MM" → "HH:MM:SS"). Mismas reglas y mismos mensajes que
 * `validarTramos`; acá no hay precio.
 */
export function validarFranjas(entradas: unknown): ResultadoFranjas {
  if (!Array.isArray(entradas)) return { ok: false, error: "Los días y horarios no llegaron bien." };
  const r = validarTramos(entradas.map((e) => ({ ...((e ?? {}) as object), precio: 1 })));
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    franjas: r.tramos.map((t) => ({ diaInicio: t.diaInicio, horaInicio: t.horaInicio, diaFin: t.diaFin, horaFin: t.horaFin })),
  };
}

/** "Lunes 18:00:00 a 20:00:00" / "Viernes 22:00:00 a Sábado 02:00:00" */
export function describirFranjaSola(f: Franja): string {
  return describirFranja({ ...f, precio: 0 });
}
