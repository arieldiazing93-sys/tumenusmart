/**
 * Servicio comedor — quién es el mozo que tiene el enlace abierto.
 *
 * El enlace público del mozo (/mozo/<llave>) no tiene usuarios del panel: la llave lleva al local y el PIN identifica a
 * cada mozo. Después de poner el PIN se guarda una cookie FIRMADA (con el id del local y del mozo y cuándo vence) para
 * no pedirlo en cada mesa; cada acción vuelve a comprobar la firma, que no haya vencido, que sea del local de la llave y
 * que el mozo siga activo. Solo del servidor.
 *
 * Usa el cliente de Prisma SIN filtro porque acá todavía no hay un local "actual" de sesión: el `storeId` sale de la
 * llave y va explícito en cada consulta.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const COOKIE_MOZO = "mozo_sesion";
/** Cuánto dura la sesión de un mozo: un turno largo. Pasado ese tiempo vuelve a pedir el PIN. */
const HORAS_SESION = 12;

function secretoDePin(): string {
  return process.env.ASISTENCIA_PIN_SECRET || process.env.SESSION_SECRET || "dev-secret-cambiar";
}

function secretoDeSesion(): string {
  return process.env.SESSION_SECRET ?? "dev-secret-cambiar";
}

/**
 * La huella de un PIN de mozo: lo que se guarda en vez del PIN. Mismo mecanismo que el de asistencia, pero con otro
 * prefijo en lo que se firma: un PIN de asistencia no sirve de PIN de mozo, aunque sea el mismo número.
 */
export function claveDePinMozo(storeId: string, pin: string): string {
  return createHmac("sha256", secretoDePin()).update(`mozo:${storeId}:${pin}`).digest("hex");
}

/** El local al que lleva esta llave, o null si no existe o ya se apagó/regeneró. */
export async function localPorTokenMozos(token: string) {
  if (!FORMATO_TOKEN.test(token)) return null;
  return prisma.store.findUnique({
    where: { tokenMozos: token },
    select: {
      id: true,
      nombre: true,
      logoUrl: true,
      intentosPinMozos: true,
      bloqueoMozosHasta: true,
      // Las reglas que el dueño configura para los mozos (Ajustes → Configuración servicio comedor).
      mozosVenCuentasAjenas: true,
      mozoImprimeCuenta: true,
    },
  });
}

export type LocalMozos = NonNullable<Awaited<ReturnType<typeof localPorTokenMozos>>>;

export type MozoEnSesion = { id: string; nombre: string; apellido: string | null };

function firmar(valor: string): string {
  return createHmac("sha256", secretoDeSesion()).update(valor).digest("hex");
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Deja al mozo con la sesión abierta en este navegador (cookie firmada, solo del servidor). */
export async function abrirSesionMozo(storeId: string, mozoId: string): Promise<void> {
  const vence = Date.now() + HORAS_SESION * 3600 * 1000;
  const base = `${storeId}.${mozoId}.${vence}`;
  (await cookies()).set(COOKIE_MOZO, `${base}.${firmar(base)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/mozo",
    maxAge: HORAS_SESION * 3600,
  });
}

export async function cerrarSesionMozo(): Promise<void> {
  (await cookies()).set(COOKIE_MOZO, "", { path: "/mozo", maxAge: 0 });
}

/**
 * El mozo de esta sesión, o null si no hay sesión, está vencida, la firma no coincide, es de otro local o el mozo se
 * desactivó. `local` es el que sale de la llave de la dirección: nunca se confía en un local que mande el navegador.
 */
export async function mozoDeSesion(local: { id: string }): Promise<MozoEnSesion | null> {
  const valor = (await cookies()).get(COOKIE_MOZO)?.value;
  if (!valor) return null;

  const corte = valor.lastIndexOf(".");
  if (corte <= 0) return null;
  const base = valor.slice(0, corte);
  const firma = valor.slice(corte + 1);
  if (!igualesEnTiempoConstante(firma, firmar(base))) return null;

  const [storeId, mozoId, vence] = base.split(".");
  if (!storeId || !mozoId || storeId !== local.id) return null;
  if (!Number.isFinite(Number(vence)) || Number(vence) < Date.now()) return null;

  return prisma.mozo.findFirst({
    where: { id: mozoId, storeId: local.id, activo: true },
    select: { id: true, nombre: true, apellido: true },
  });
}

export function nombreDeMozo(m: { nombre: string; apellido: string | null }): string {
  return [m.nombre, m.apellido].filter(Boolean).join(" ");
}
