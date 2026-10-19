/**
 * Qué se le exige a una contraseña nueva, según quién es. Puro (sin base de datos ni node:crypto) para que lo usen igual el servidor, que
 * es quien decide, y las pantallas, que solo muestran el aviso de lo que se pide.
 *
 * - Dueño (rol "local"), administrador y cajero (rol "empleado"): 5 caracteres o más, lo que quieran (solo números, solo letras,
 *   mayúsculas o minúsculas). Es la misma contraseña que se escribe en la caja para autorizar una cancelación o un descuento
 *   (Ajustes → Seguridad), así que una regla pesada la vuelve un estorbo en pleno servicio. Si la eligen floja, es decisión de ellos: en
 *   la Bitácora queda quién autorizó cada cosa.
 * - Superadmin (la cuenta que administra todos los locales): se mantiene la regla estricta (8 o más, con letras y números).
 */

export const LARGO_MINIMO_CLAVE_LOCAL = 5;
export const LARGO_MINIMO_CLAVE_SUPERADMIN = 8;
export const LARGO_MAXIMO_CLAVE = 200;

/** ¿A este rol se le exige la regla simple (5 caracteres) y no la estricta? */
export function usaClaveSimple(rol: string | null | undefined): boolean {
  return rol === "local" || rol === "empleado";
}

/** La regla de una contraseña nueva. Devuelve el error o null. Sin rol (o con uno desconocido) se aplica la estricta. */
export function revisarClave(plano: string, rol: string | null | undefined): string | null {
  if (usaClaveSimple(rol)) {
    if (plano.length < LARGO_MINIMO_CLAVE_LOCAL) {
      return `La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE_LOCAL} caracteres`;
    }
    if (plano.length > LARGO_MAXIMO_CLAVE) return "La contraseña es demasiado larga";
    if (plano.trim().length === 0) return "La contraseña no puede ser solo espacios";
    return null;
  }
  if (plano.length < LARGO_MINIMO_CLAVE_SUPERADMIN) {
    return `La contraseña tiene que tener al menos ${LARGO_MINIMO_CLAVE_SUPERADMIN} caracteres`;
  }
  if (plano.length > LARGO_MAXIMO_CLAVE) return "La contraseña es demasiado larga";
  if (!/[a-zA-Z]/.test(plano)) return "La contraseña tiene que incluir alguna letra";
  if (!/[0-9]/.test(plano)) return "La contraseña tiene que incluir algún número";
  return null;
}

/** El aviso que se muestra junto al campo de la contraseña nueva. */
export function requisitosDeClave(rol: string | null | undefined): string {
  return usaClaveSimple(rol)
    ? `Mínimo ${LARGO_MINIMO_CLAVE_LOCAL} caracteres. Puede ser alfanumérica: solo números, solo letras (mayúsculas o minúsculas) o mezclados. No puede ser igual a la de otra persona del local.`
    : `Mínimo ${LARGO_MINIMO_CLAVE_SUPERADMIN} caracteres, con letras y números.`;
}
