/**
 * Freno a la adivinanza de PIN en los enlaces públicos (el celular fijo de asistencia y el de los mozos).
 *
 * Un PIN tiene de 4 a 6 números: sin freno se prueban todos en horas. El freno es POR LOCAL (el PIN es lo que identifica a
 * la persona, así que no se puede bloquear "a esa persona") y está hecho para resistir lo que un atacante haría:
 *
 *  - Ráfagas: el intento se CUENTA ANTES de mirar el PIN, con un incremento atómico en la base. Si llegan mil pedidos a la
 *    vez, solo los primeros `MAXIMO_INTENTOS_PIN` llegan a probar un PIN; el resto se rechaza sin tocarlo. (Contar después,
 *    como antes, deja pasar a todos los que ya habían pasado la revisión del bloqueo.)
 *  - Un PIN propio como llave maestra: acertar no borra los errores de los demás. Cada acierto solo devuelve su propio
 *    intento; los fallos se olvidan únicamente cuando pasa un rato sin intentos (`MINUTOS_VENTANA`). Antes, un empleado con su
 *    PIN válido podía alternar cuatro adivinanzas y un acierto propio para que el contador nunca llegara al tope.
 *  - Bloqueo que no se agranda: durante el bloqueo no se cuenta nada, así que no se puede "cargar" el contador para que al
 *    terminar el bloqueo vuelva a bloquear.
 *
 * Todo con la API de Prisma (sin SQL a mano). Los nombres de columna salen de una lista fija de acá, nunca de un dato de afuera.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { MAXIMO_INTENTOS_PIN, MINUTOS_BLOQUEO_PIN } from "./asistencia";

export type EspacioDePin = "mozos" | "asistencia";

/** Cuánto tiempo sin intentos hace falta para que el conteo de errores vuelva a cero. */
const MINUTOS_VENTANA = 10;

const COLUMNAS = {
  mozos: { intentos: "intentosPinMozos", bloqueo: "bloqueoMozosHasta", ultimo: "ultimoIntentoPinMozosEn" },
  asistencia: {
    intentos: "intentosPinAsistencia",
    bloqueo: "bloqueoAsistenciaHasta",
    ultimo: "ultimoIntentoPinAsistenciaEn",
  },
} as const;

type Columnas = (typeof COLUMNAS)[EspacioDePin];

/** "Sin bloqueo vigente": nunca se bloqueó, o el bloqueo ya terminó. */
function sinBloqueoVigente(c: Columnas, ahora: Date) {
  return { OR: [{ [c.bloqueo]: null }, { [c.bloqueo]: { lte: ahora } }] };
}

export type IntentoDePin = { ok: true; n: number } | { ok: false; minutos: number };

/** Cuántos minutos faltan para que termine el bloqueo de este local (al menos 1). */
async function minutosDeBloqueo(c: Columnas, storeId: string): Promise<number> {
  const fila = await prisma.store.findUnique({
    where: { id: storeId },
    select: { [c.bloqueo]: true } as Prisma.StoreSelect,
  });
  const hasta = (fila as Record<string, Date | null> | null)?.[c.bloqueo] ?? null;
  if (!hasta) return MINUTOS_BLOQUEO_PIN;
  return Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / 60000));
}

async function bloquear(c: Columnas, storeId: string): Promise<void> {
  await prisma.store.updateMany({
    where: { id: storeId },
    data: {
      [c.bloqueo]: new Date(Date.now() + MINUTOS_BLOQUEO_PIN * 60000),
      [c.intentos]: 0,
      [c.ultimo]: null,
    } as Prisma.StoreUpdateManyMutationInput,
  });
}

/**
 * Hay que llamarla ANTES de mirar el PIN. Cuenta el intento (atómico) y dice si se puede probar el PIN: `ok: true` con el
 * número de intento que es este, o `ok: false` con los minutos que faltan si el local está bloqueado o ya se pasó del tope.
 */
export async function pedirIntentoDePin(espacio: EspacioDePin, storeId: string): Promise<IntentoDePin> {
  const c = COLUMNAS[espacio];
  const ahora = new Date();
  const limiteDeVentana = new Date(ahora.getTime() - MINUTOS_VENTANA * 60000);

  // Un conteo viejo (sin intentos hace rato) arranca de nuevo en 1. Es una sola actualización condicional: si dos pedidos
  // llegan juntos, solo uno la gana; el otro cae al incremento de abajo.
  const reinicio = await prisma.store.updateMany({
    where: {
      id: storeId,
      AND: [sinBloqueoVigente(c, ahora), { OR: [{ [c.ultimo]: null }, { [c.ultimo]: { lt: limiteDeVentana } }] }],
    } as Prisma.StoreWhereInput,
    data: { [c.intentos]: 1, [c.ultimo]: ahora } as Prisma.StoreUpdateManyMutationInput,
  });

  let n: number;
  if (reinicio.count === 1) {
    n = 1;
  } else {
    try {
      // `update` devuelve el valor ya incrementado, en la misma operación: cada pedido recibe un número distinto.
      const fila = await prisma.store.update({
        where: { id: storeId, ...sinBloqueoVigente(c, ahora) } as Prisma.StoreWhereUniqueInput,
        data: { [c.intentos]: { increment: 1 }, [c.ultimo]: ahora } as Prisma.StoreUpdateInput,
        select: { [c.intentos]: true } as Prisma.StoreSelect,
      });
      n = (fila as unknown as Record<string, number>)[c.intentos];
    } catch (e) {
      // No encontró un local sin bloqueo vigente: está bloqueado (o el local ya no existe).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
        return { ok: false, minutos: await minutosDeBloqueo(c, storeId) };
      }
      throw e;
    }
  }

  if (n > MAXIMO_INTENTOS_PIN) {
    await bloquear(c, storeId);
    return { ok: false, minutos: MINUTOS_BLOQUEO_PIN };
  }
  return { ok: true, n };
}

export type ResultadoDeIntento = { bloqueado: true; minutos: number } | { bloqueado: false; quedan: number };

/**
 * Después de mirar el PIN: si acertó, devuelve el intento que había gastado (no borra los errores de nadie más); si falló y
 * era el último que quedaba, bloquea el local; si no, dice cuántos intentos quedan.
 */
export async function resolverIntentoDePin(
  espacio: EspacioDePin,
  storeId: string,
  acerto: boolean,
  n: number
): Promise<ResultadoDeIntento> {
  const c = COLUMNAS[espacio];

  if (acerto) {
    await prisma.store.updateMany({
      where: { id: storeId, [c.intentos]: { gt: 0 } } as Prisma.StoreWhereInput,
      data: { [c.intentos]: { decrement: 1 } } as Prisma.StoreUpdateManyMutationInput,
    });
    return { bloqueado: false, quedan: MAXIMO_INTENTOS_PIN };
  }

  if (n >= MAXIMO_INTENTOS_PIN) {
    await bloquear(c, storeId);
    return { bloqueado: true, minutos: MINUTOS_BLOQUEO_PIN };
  }
  return { bloqueado: false, quedan: MAXIMO_INTENTOS_PIN - n };
}
