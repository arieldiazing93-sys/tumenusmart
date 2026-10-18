/**
 * El enlace de trabajo de una persona del personal (/personal/<enlace>).
 *
 * El id de cada profesional NO es secreto: la página pública de reservas lo manda al navegador (el cliente elige "con quién" y
 * ese id viaja en la reserva). Por eso el enlace privado no puede ser solo el id: cualquiera que abriera la página de reservas
 * podría armar /personal/<id> y ver la agenda con los nombres de los clientes, lo que ganó la persona, y buscar en toda la lista
 * de clientes del local. El enlace lleva además una firma calculada con la clave secreta del servidor: `<id>-<firma>`.
 *
 * Solo del servidor (usa la clave secreta). No hace falta guardar nada en la base: la firma se vuelve a calcular cada vez.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** 32 caracteres hexadecimales = 128 bits: imposible de adivinar. */
const LARGO_FIRMA = 32;

function secreto(): string {
  const valor = process.env.SESSION_SECRET;
  if (valor) return valor;
  // Sin clave configurada, en producción NO se usa un valor de ejemplo (está escrito en el código y cualquiera lo conoce).
  if (process.env.NODE_ENV === "production") {
    throw new Error("Falta configurar SESSION_SECRET en las variables de entorno.");
  }
  return "dev-secret-cambiar";
}

function firmaDe(personalId: string): string {
  return createHmac("sha256", secreto()).update(`enlace-personal:${personalId}`).digest("hex").slice(0, LARGO_FIRMA);
}

/** Lo que va en la dirección: `<id>-<firma>`. */
export function enlaceDePersonal(personalId: string): string {
  return `${personalId}-${firmaDe(personalId)}`;
}

/** El id de la persona si la firma del enlace es correcta; `null` si el enlace es falso, está incompleto o es solo el id. */
export function personalIdDeEnlace(enlace: unknown): string | null {
  if (typeof enlace !== "string") return null;
  const corte = enlace.lastIndexOf("-");
  if (corte <= 0) return null;
  const id = enlace.slice(0, corte);
  const dada = enlace.slice(corte + 1);
  const esperada = firmaDe(id);
  if (dada.length !== esperada.length) return null;
  return timingSafeEqual(Buffer.from(dada), Buffer.from(esperada)) ? id : null;
}
