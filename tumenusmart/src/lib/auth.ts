import { cookies } from "next/headers";
import { cache } from "react";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { prisma } from "./prisma";

const COOKIE_NAME = "admin_session";
const DIAS_DE_SESION = 7;

/** Cuántos intentos fallidos seguidos antes de frenar, y por cuánto tiempo. */
const INTENTOS_ANTES_DE_FRENAR = 5;
const MINUTOS_DE_FRENO = 10;

// ---------------------------------------------------------------------------
//  Contraseñas
// ---------------------------------------------------------------------------
//  Se usa scrypt, que viene incluido en Node — no hace falta ninguna librería
//  extra. Es deliberadamente lento: si algún día alguien se lleva la tabla de
//  usuarios, probar contraseñas una por una le sale carísimo.
//
//  Lo guardado tiene la forma "scrypt:sal:hash". La sal es distinta para cada
//  usuario, así que dos personas con la misma contraseña no comparten hash.

const scrypt = promisify(scryptCallback) as (
  password: string,
  sal: Buffer,
  largo: number
) => Promise<Buffer>;

const LARGO_CLAVE = 64;

export async function cifrarPassword(plano: string): Promise<string> {
  const sal = randomBytes(16);
  const derivada = await scrypt(plano.normalize("NFKC"), sal, LARGO_CLAVE);
  return `scrypt:${sal.toString("hex")}:${derivada.toString("hex")}`;
}

export async function passwordCoincide(plano: string, guardado: string): Promise<boolean> {
  const partes = guardado.split(":");
  if (partes.length !== 3 || partes[0] !== "scrypt") return false;

  const sal = Buffer.from(partes[1], "hex");
  const esperado = Buffer.from(partes[2], "hex");
  if (sal.length === 0 || esperado.length !== LARGO_CLAVE) return false;

  const derivada = await scrypt(plano.normalize("NFKC"), sal, LARGO_CLAVE);
  // Comparación de tiempo constante: no revela cuántos bytes coincidían.
  return timingSafeEqual(derivada, esperado);
}

/** Reglas mínimas para una contraseña nueva. Devuelve el error o null. */
export function revisarPasswordNueva(plano: string): string | null {
  if (plano.length < 8) return "La contraseña tiene que tener al menos 8 caracteres";
  if (plano.length > 200) return "La contraseña es demasiado larga";
  if (!/[a-zA-Z]/.test(plano)) return "La contraseña tiene que incluir alguna letra";
  if (!/[0-9]/.test(plano)) return "La contraseña tiene que incluir algún número";
  return null;
}

export function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
//  Sesión
// ---------------------------------------------------------------------------
//  La cookie guarda el id del usuario y una firma. La firma impide que alguien
//  edite la cookie y se haga pasar por otro. El rol y el local NO viajan en la
//  cookie: se leen de la base en cada pedido, para que desactivar a alguien o
//  cambiarle el local tenga efecto en el acto y no dentro de siete días.

function firmar(valor: string): string {
  const secreto = process.env.SESSION_SECRET ?? "dev-secret-cambiar";
  return createHmac("sha256", secreto).update(valor).digest("hex");
}

/**
 * Sin SESSION_SECRET, la firma de las cookies usa un valor de ejemplo que
 * está escrito en el propio código. Cualquiera que lo conozca podría armarse
 * una cookie de administrador.
 *
 * Por eso en producción se corta acá, al momento de iniciar sesión: el aviso
 * es imposible de pasar por alto, las cartas públicas siguen funcionando
 * normalmente, y se arregla poniendo la variable en Vercel.
 */
export function faltaSecretoDeSesion(): boolean {
  return process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET;
}

export function exigirSecretoDeSesion(): void {
  if (faltaSecretoDeSesion()) {
    throw new Error(
      "Falta configurar SESSION_SECRET en las variables de entorno. " +
        "Sin esa clave las sesiones del panel no son seguras."
    );
  }
}

function firmaValida(valor: string, firma: string): boolean {
  const esperada = firmar(valor);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function abrirSesion(usuarioId: string): Promise<void> {
  exigirSecretoDeSesion();
  const store = await cookies();
  store.set(COOKIE_NAME, `${usuarioId}.${firmar(usuarioId)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * DIAS_DE_SESION,
    path: "/",
  });
}

export async function cerrarSesion(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type SesionUsuario = {
  id: string;
  email: string;
  nombre: string | null;
  rol: string;
  storeId: string | null;
  /** Todavía usa la contraseña que le entregaron. El panel se lo recuerda. */
  debeCambiarPassword: boolean;
};

/**
 * Quién está usando el panel ahora mismo, o null si no hay sesión válida.
 *
 * Va envuelto en cache() de React: aunque veinte lugares distintos lo
 * pregunten mientras se arma una pantalla, la base se consulta una sola vez.
 */
export const sesionActual = cache(async (): Promise<SesionUsuario | null> => {
  const cookie = (await cookies()).get(COOKIE_NAME)?.value;
  if (!cookie) return null;

  const corte = cookie.lastIndexOf(".");
  if (corte <= 0) return null;

  const usuarioId = cookie.slice(0, corte);
  const firma = cookie.slice(corte + 1);
  if (!firmaValida(usuarioId, firma)) return null;

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      email: true,
      nombre: true,
      rol: true,
      storeId: true,
      activo: true,
      debeCambiarPassword: true,
    },
  });

  if (!usuario || !usuario.activo) return null;

  // Un usuario de local sin local asignado no puede administrar nada: sería
  // una sesión sin alcance. Preferimos negarle la entrada a que vea de más.
  if (usuario.rol !== "superadmin" && !usuario.storeId) return null;

  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    storeId: usuario.storeId,
    debeCambiarPassword: usuario.debeCambiarPassword,
  };
});

/** La sesión, o un error si no hay. Para pantallas que ya están detrás del guardia. */
export async function sesionObligatoria(): Promise<SesionUsuario> {
  const sesion = await sesionActual();
  if (!sesion) throw new Error("Hay que iniciar sesión");
  return sesion;
}

export async function esSuperadmin(): Promise<boolean> {
  const sesion = await sesionActual();
  return sesion?.rol === "superadmin";
}

/** Corta la ejecución si quien entró no es superadmin. */
export async function exigirSuperadmin(): Promise<SesionUsuario> {
  const sesion = await sesionObligatoria();
  if (sesion.rol !== "superadmin") {
    throw new Error("No tenés permiso para hacer esto");
  }
  return sesion;
}

export async function haySesionAdminValida(): Promise<boolean> {
  return (await sesionActual()) !== null;
}

// ---------------------------------------------------------------------------
//  Ingreso
// ---------------------------------------------------------------------------

export type ResultadoIngreso =
  | { ok: true; usuarioId: string }
  | { ok: false; motivo: "credenciales" | "frenado"; minutos?: number };

/**
 * Verifica correo y contraseña.
 *
 * Cuando falla nunca dice si el error fue el correo o la contraseña: eso
 * evita que alguien use la pantalla de ingreso para averiguar qué correos
 * están dados de alta.
 */
export async function verificarIngreso(
  emailCrudo: string,
  password: string
): Promise<ResultadoIngreso> {
  const email = normalizarEmail(emailCrudo);

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      activo: true,
      rol: true,
      storeId: true,
      intentosFallidos: true,
      bloqueadoHasta: true,
    },
  });

  // Correo inexistente: igual se calcula un hash para que la respuesta demore
  // lo mismo que con un correo real y no se pueda deducir cuál existe.
  if (!usuario) {
    await cifrarPassword(password);
    return { ok: false, motivo: "credenciales" };
  }

  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
    const minutos = Math.max(
      1,
      Math.ceil((usuario.bloqueadoHasta.getTime() - Date.now()) / 60000)
    );
    return { ok: false, motivo: "frenado", minutos };
  }

  const coincide = await passwordCoincide(password, usuario.passwordHash);
  const puedeEntrar =
    coincide && usuario.activo && (usuario.rol === "superadmin" || !!usuario.storeId);

  if (!puedeEntrar) {
    const intentos = usuario.intentosFallidos + 1;
    const frenar = intentos >= INTENTOS_ANTES_DE_FRENAR;
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        intentosFallidos: frenar ? 0 : intentos,
        bloqueadoHasta: frenar
          ? new Date(Date.now() + MINUTOS_DE_FRENO * 60000)
          : null,
      },
    });
    if (frenar) return { ok: false, motivo: "frenado", minutos: MINUTOS_DE_FRENO };
    return { ok: false, motivo: "credenciales" };
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoIngreso: new Date() },
  });

  return { ok: true, usuarioId: usuario.id };
}

// ---------------------------------------------------------------------------
//  Primer arranque
// ---------------------------------------------------------------------------
//  Mientras no exista ningún usuario, la pantalla de ingreso ofrece crear la
//  cuenta de superadmin. Para hacerlo pide la contraseña vieja del sistema
//  (ADMIN_PASSWORD), que es lo único que había antes. Una vez creada la
//  primera cuenta, esta puerta se cierra sola y ADMIN_PASSWORD deja de servir.

export async function faltaCrearElPrimerUsuario(): Promise<boolean> {
  const cuantos = await prisma.usuario.count();
  return cuantos === 0;
}

export function passwordDeArranqueValida(password: string): boolean {
  const esperado = process.env.ADMIN_PASSWORD;
  if (!esperado) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
//  Contraseñas generadas por el sistema
// ---------------------------------------------------------------------------

/**
 * Alfabeto sin caracteres que se confunden al dictarlos.
 *
 * Estas contraseñas se pasan por WhatsApp o se dicen por teléfono, así que se
 * sacan el cero y la O, el uno y la ele, la i mayúscula. Un cliente que no
 * puede entrar porque leyó mal una letra es una llamada perdida para vos.
 */
const LETRAS_CLARAS = "abcdefghjkmnpqrstuvwxyz";
const NUMEROS_CLAROS = "23456789";

/**
 * Arma una contraseña fácil de dictar y difícil de adivinar.
 *
 * Sale en tres grupos separados por guiones —"kfrt-9mzq-2vbn"— porque así se
 * lee y se copia mucho mejor que doce caracteres seguidos. Siempre incluye
 * letras y números, para cumplir la misma regla que le pedimos a cualquiera.
 */
export function generarPassword(): string {
  const alfabeto = LETRAS_CLARAS + NUMEROS_CLAROS;
  const bytes = randomBytes(64);

  const caracteres: string[] = [];
  for (let i = 0; i < 12; i++) {
    caracteres.push(alfabeto[bytes[i] % alfabeto.length]);
  }

  // Se garantiza al menos una letra y un número, sin depender de la suerte.
  caracteres[0] = LETRAS_CLARAS[bytes[20] % LETRAS_CLARAS.length];
  caracteres[11] = NUMEROS_CLAROS[bytes[21] % NUMEROS_CLAROS.length];

  return [
    caracteres.slice(0, 4).join(""),
    caracteres.slice(4, 8).join(""),
    caracteres.slice(8, 12).join(""),
  ].join("-");
}
