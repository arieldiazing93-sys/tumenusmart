import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_session";
const UN_DIA_EN_SEGUNDOS = 60 * 60 * 24;

function firmar(valor: string): string {
  const secreto = process.env.SESSION_SECRET ?? "dev-secret-cambiar";
  return createHmac("sha256", secreto).update(valor).digest("hex");
}

/**
 * Sesión de admin simple: una cookie firmada, sin base de datos de usuarios.
 * Alcanza para un solo negocio con un solo admin. Cuando haya roles de
 * empleado (Tanda 3 del roadmap) esto se reemplaza por autenticación real.
 */
export async function crearSesionAdmin() {
  const valor = "admin";
  const firma = firmar(valor);
  const store = await cookies();
  store.set(COOKIE_NAME, `${valor}.${firma}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: UN_DIA_EN_SEGUNDOS * 7,
    path: "/",
  });
}

export async function cerrarSesionAdmin() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function haySesionAdminValida(): Promise<boolean> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME)?.value;
  if (!cookie) return false;

  const [valor, firma] = cookie.split(".");
  if (!valor || !firma) return false;

  const firmaEsperada = firmar(valor);
  const bufA = Buffer.from(firma);
  const bufB = Buffer.from(firmaEsperada);
  if (bufA.length !== bufB.length) return false;

  return timingSafeEqual(bufA, bufB);
}

export function validarPassword(password: string): boolean {
  const esperado = process.env.ADMIN_PASSWORD;
  if (!esperado) return false;
  return password === esperado;
}
