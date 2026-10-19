import { prisma } from "./prisma";
import { passwordCoincide } from "./auth";
import { registrarBitacora } from "./bitacora";
import { usaClaveSimple } from "./reglas-clave";

/**
 * Que dos personas de un mismo local (dueño, administrador, cajero) no tengan la misma contraseña.
 *
 * Por qué importa: la contraseña que se escribe en la caja para autorizar (Ajustes → Seguridad) identifica a quien autoriza SIN pedir
 * el usuario, y con contraseñas cortas ("12345") es fácil que dos personas elijan la misma. Se rechaza al elegirla; si igual
 * coincidieran (una vieja, dos cambios al mismo tiempo), `exigirAutorizacion` no autoriza a ninguna de las dos.
 *
 * Los PIN de los mozos y de los colaboradores (asistencia) ya no se pueden repetir dentro del local: lo impide la base de datos
 * (`@@unique([storeId, pinClave])`), por eso no pasan por acá.
 */

export const ERROR_CLAVE_REPETIDA = "Esa contraseña ya existe. Elegí otra distinta.";
export const ERROR_DEMASIADAS_PRUEBAS = "Probaste muchas contraseñas seguidas. Esperá unos minutos y volvé a intentar.";

/** Cuántos cambios o rechazos por repetida se permiten por persona, y en cuánto tiempo (ver `demasiadasPruebas`). */
const MAXIMO_PRUEBAS = 5;
const MINUTOS_DE_PRUEBAS = 10;

export const ACCION_CLAVE_CAMBIADA = "contrasena_cambiada";
export const ACCION_CLAVE_REPETIDA = "contrasena_repetida";

/**
 * ¿Otra persona del local ya tiene esta contraseña? Se mira a TODOS los usuarios del local con contraseña propia (dueño y empleados),
 * también a los desactivados: si los reactivan, no deberían chocar. `exceptoUsuarioId` es quien la está eligiendo (no cuenta contra sí mismo).
 */
export async function claveYaExiste(storeId: string, plano: string, exceptoUsuarioId: string | null): Promise<boolean> {
  const otros = await prisma.usuario.findMany({
    where: { storeId, rol: { in: ["local", "empleado"] }, ...(exceptoUsuarioId ? { id: { not: exceptoUsuarioId } } : {}) },
    select: { passwordHash: true },
  });
  for (const otro of otros) {
    if (await passwordCoincide(plano, otro.passwordHash)) return true;
  }
  return false;
}

/**
 * Freno para quien elige su contraseña: decir «ya existe» le avisa que OTRA persona usa justo ese texto. Sin un tope, alguien con su sesión
 * abierta podría ir probando contraseñas hasta dar con la del dueño. Cada cambio y cada rechazo por repetida quedan en la Bitácora, y con
 * 5 en 10 minutos se frena (suficiente para quien se equivoca o duda, inútil para adivinar).
 */
export async function demasiadasPruebas(storeId: string, email: string): Promise<boolean> {
  const desde = new Date(Date.now() - MINUTOS_DE_PRUEBAS * 60000);
  const recientes = await prisma.bitacora.count({
    where: { storeId, usuarioEmail: email, accion: { in: [ACCION_CLAVE_CAMBIADA, ACCION_CLAVE_REPETIDA] }, createdAt: { gte: desde } },
  });
  return recientes >= MAXIMO_PRUEBAS;
}

type Quien = { nombre?: string | null; email: string; rol?: string | null };

/** Deja en la Bitácora que alguien intentó una contraseña que ya existe (sin guardar ni decir cuál fue ni de quién). */
export async function anotarClaveRepetida(storeId: string, quien: Quien): Promise<void> {
  await registrarBitacora(storeId, quien, {
    modulo: "seguridad",
    accion: ACCION_CLAVE_REPETIDA,
    descripcion: `${quien.nombre?.trim() || quien.email} intentó usar una contraseña que ya existe en el local: no se guardó.`,
  });
}

/** Deja en la Bitácora que la persona cambió su contraseña. */
export async function anotarClaveCambiada(storeId: string, quien: Quien): Promise<void> {
  await registrarBitacora(storeId, quien, {
    modulo: "seguridad",
    accion: ACCION_CLAVE_CAMBIADA,
    descripcion: `${quien.nombre?.trim() || quien.email} cambió su contraseña.`,
  });
}

/** ¿A este rol le corresponde la regla de «no repetir»? Es la misma gente que tiene la regla simple (los que autorizan en la caja). */
export function debeSerUnica(rol: string | null | undefined): boolean {
  return usaClaveSimple(rol);
}
