import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { puede, type Permiso } from "./permisos";
import { cookies } from "next/headers";
import { cache } from "react";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { registrarBitacora } from "./bitacora";
import { revisarClave } from "./reglas-clave";

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

/**
 * Reglas mínimas para una contraseña nueva. Devuelve el error o null. Dependen de a quién le toca (ver reglas-clave.ts): el dueño, el
 * administrador y el cajero pueden tener una de 5 caracteres de cualquier tipo; el superadmin, no. El `rol` es de QUIEN va a usarla,
 * nunca lo que mande el navegador.
 */
export function revisarPasswordNueva(plano: string, rol: string | null | undefined): string | null {
  return revisarClave(plano, rol);
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
 * La huella de la contraseña ACTUAL de un usuario. Va dentro de la cookie de sesión (y firmada con ella): mientras la contraseña no
 * cambie, la huella coincide; en cuanto alguien la cambia o se la restablecen, la huella de la base es otra y TODAS las sesiones
 * abiertas con la contraseña anterior dejan de valer (una cookie robada, el celular de un empleado que ya no está, una computadora
 * que quedó abierta). No se guarda nada nuevo en la base: sale del mismo hash de la contraseña que ya está ahí.
 */
function huellaDeClave(passwordHash: string): string {
  const secreto = process.env.SESSION_SECRET ?? "dev-secret-cambiar";
  return createHmac("sha256", secreto).update(`sesion-clave:${passwordHash}`).digest("hex").slice(0, 32);
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

function huellasIguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function firmaValida(valor: string, firma: string): boolean {
  const esperada = firmar(valor);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Abre la sesión del usuario en este navegador. La cookie es `<id>.<huella de su contraseña>.<firma>`: el middleware (Edge) solo
 * comprueba la firma de todo lo anterior al último punto; que la huella siga siendo la de la contraseña actual lo comprueba
 * `sesionActual`, que ya consulta al usuario en cada pedido.
 */
export async function abrirSesion(usuarioId: string): Promise<void> {
  exigirSecretoDeSesion();
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { passwordHash: true } });
  if (!usuario) throw new Error("No encontré al usuario para abrirle la sesión");
  const base = `${usuarioId}.${huellaDeClave(usuario.passwordHash)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, `${base}.${firmar(base)}`, {
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

  const base = cookie.slice(0, corte);
  const firma = cookie.slice(corte + 1);
  if (!firmaValida(base, firma)) return null;

  // `<id>.<huella>`. Una cookie del formato anterior (solo el id, sin huella) ya no vale: hay que volver a entrar una vez.
  const separador = base.lastIndexOf(".");
  if (separador <= 0) return null;
  const usuarioId = base.slice(0, separador);
  const huella = base.slice(separador + 1);

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
      passwordHash: true,
    },
  });

  if (!usuario || !usuario.activo) return null;

  // La contraseña cambió después de abrir esta sesión: la sesión se cerró.
  if (!huellasIguales(huella, huellaDeClave(usuario.passwordHash))) return null;

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

/**
 * Corta la ejecución si quien entró no tiene ese permiso.
 *
 * Esto es el control DE VERDAD. Esconder un botón del menú no protege nada:
 * una acción del servidor se puede llamar desde afuera del panel, con el
 * navegador cerrado. Por eso toda acción que escriba en la base tiene que
 * empezar llamando acá, y no confiar en que la pantalla ya filtró.
 *
 * El mensaje de error es a propósito el mismo para todos los casos: no le
 * decimos a quien está probando qué permiso le falta.
 */
export async function exigirPermiso(permiso: Permiso): Promise<SesionUsuario> {
  const sesion = await sesionObligatoria();
  if (!puede(sesion.rol, permiso)) {
    throw new Error("No tenés permiso para hacer esto");
  }
  return sesion;
}

/**
 * Para las PANTALLAS: si no hay permiso, manda a Pedidos en vez de romper.
 *
 * Distinto de `exigirPermiso`, que lanza un error. Acá el error no aporta
 * nada: alguien escribió una dirección que no le corresponde, probablemente
 * porque tenía el link guardado de cuando era dueño, o porque probó. Se lo
 * lleva a la pantalla que sí puede ver.
 *
 * Las acciones del servidor NO usan esto: ahí sí hay que cortar.
 */
export async function pantallaConPermiso(permiso: Permiso): Promise<SesionUsuario> {
  const sesion = await sesionActual();
  if (!sesion) redirect("/admin/login");
  if (!puede(sesion.rol, permiso)) redirect("/admin/pos");
  return sesion;
}

export async function haySesionAdminValida(): Promise<boolean> {
  return (await sesionActual()) !== null;
}

/**
 * Para las rutas de API y las descargas (Excel, PDF): corta con 401 si no hay sesión y con 403 si quien entró no tiene ese
 * permiso, o devuelve null si puede seguir. Una ruta de API no pasa por el layout del panel ni por `pantallaConPermiso`, así
 * que sin esto cualquiera con sesión —aunque su rol no vea esa pantalla— bajaría el reporte si conoce la dirección.
 *
 *   const negado = await negarSiNoPuede("estadisticas.ver");
 *   if (negado) return negado;
 */
export async function negarSiNoPuede(permiso: Permiso): Promise<NextResponse | null> {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, permiso)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  return null;
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
 *
 * El freno por intentos se cuenta ANTES de mirar la contraseña, con un incremento
 * atómico en la base (mismo diseño que el de los PIN, ver limite-pin.ts). Comprobar la
 * contraseña tarda (scrypt es lento a propósito): si el intento se anotara DESPUÉS, cien
 * pedidos simultáneos leerían todos "0 intentos", todos probarían una contraseña y todos
 * escribirían "1": el freno no frenaría nada. Así, de una ráfaga solo llegan a probar
 * una contraseña los primeros INTENTOS_ANTES_DE_FRENAR; el resto se rechaza sin tocarla.
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
      bloqueadoHasta: true,
    },
  });

  // Correo inexistente: igual se calcula un hash para que la respuesta demore
  // lo mismo que con un correo real y no se pueda deducir cuál existe.
  if (!usuario) {
    await cifrarPassword(password);
    return { ok: false, motivo: "credenciales" };
  }

  const ahora = new Date();
  if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora) {
    return { ok: false, motivo: "frenado", minutos: minutosHasta(usuario.bloqueadoHasta) };
  }

  // Se cuenta el intento (atómico) y solo si no hay un freno vigente: `update` devuelve el valor ya incrementado, así que cada
  // pedido recibe un número distinto aunque lleguen todos juntos.
  let intento: number;
  try {
    const fila = await prisma.usuario.update({
      where: { id: usuario.id, OR: [{ bloqueadoHasta: null }, { bloqueadoHasta: { lte: ahora } }] },
      data: { intentosFallidos: { increment: 1 } },
      select: { intentosFallidos: true },
    });
    intento = fila.intentosFallidos;
  } catch (e) {
    // No encontró al usuario sin freno vigente: otro pedido lo frenó justo antes.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, motivo: "frenado", minutos: MINUTOS_DE_FRENO };
    }
    throw e;
  }

  // Pasó el tope: se frena y NO se mira la contraseña. En la bitácora queda UNA sola nota por ráfaga (la del primer pedido que se pasó).
  if (intento > INTENTOS_ANTES_DE_FRENAR) {
    await frenarUsuario(usuario.id, intento === INTENTOS_ANTES_DE_FRENAR + 1 ? { storeId: usuario.storeId, email } : null);
    return { ok: false, motivo: "frenado", minutos: MINUTOS_DE_FRENO };
  }

  const coincide = await passwordCoincide(password, usuario.passwordHash);
  const puedeEntrar =
    coincide && usuario.activo && (usuario.rol === "superadmin" || !!usuario.storeId);

  if (!puedeEntrar) {
    // El último intento permitido que falló: se frena.
    if (intento >= INTENTOS_ANTES_DE_FRENAR) {
      await frenarUsuario(usuario.id, { storeId: usuario.storeId, email });
      return { ok: false, motivo: "frenado", minutos: MINUTOS_DE_FRENO };
    }
    return { ok: false, motivo: "credenciales" };
  }

  // Entró: los errores seguidos se olvidan. Un freno que otro pedido haya puesto en este mismo instante NO se toca.
  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { intentosFallidos: 0, ultimoIngreso: new Date() },
  });

  return { ok: true, usuarioId: usuario.id };
}

/**
 * Frena el ingreso de un usuario por unos minutos y vuelve a cero el conteo (el freno ya impide seguir probando). Con `avisar`, deja
 * una nota en la Bitácora de su local: así el dueño se entera de que alguien estuvo probando contraseñas de esa cuenta.
 */
async function frenarUsuario(usuarioId: string, avisar: { storeId: string | null; email: string } | null): Promise<void> {
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + MINUTOS_DE_FRENO * 60000) },
  });
  if (avisar?.storeId) {
    await registrarBitacora(avisar.storeId, { nombre: "Sistema", email: "sistema", rol: "sistema" }, {
      modulo: "seguridad",
      accion: "ingreso_frenado",
      descripcion: `Se frenó el ingreso de ${avisar.email} por ${MINUTOS_DE_FRENO} minutos: hubo ${INTENTOS_ANTES_DE_FRENAR} contraseñas incorrectas seguidas. Si no fue esa persona, alguien está probando contraseñas.`,
      entidad: "Usuario",
      entidadId: usuarioId,
      detalle: { correo: avisar.email, minutos: MINUTOS_DE_FRENO },
    });
  }
}

/** Cuántos minutos faltan para esa hora (al menos 1). */
function minutosHasta(hasta: Date): number {
  return Math.max(1, Math.ceil((hasta.getTime() - Date.now()) / 60000));
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
