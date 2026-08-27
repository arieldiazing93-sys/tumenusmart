/**
 * Las reglas de los avisos de error.
 *
 * Sin base de datos y sin red, para poder probarlas: acá se decide si un aviso
 * sirve o se vuelve ruido, y esa diferencia no se ve mirando el código.
 *
 * La regla de oro es una sola: UN aviso por problema, no uno por vez que
 * ocurre. Si algo se rompe doscientas veces en una hora y llegan doscientos
 * correos, al tercero se dejan de leer y el sistema deja de existir.
 */

/** Cada cuánto se puede volver a avisar del MISMO problema. */
export const HORAS_ENTRE_AVISOS = 6;

/**
 * Tope diario de correos.
 *
 * El plan gratuito de Resend permite 100 por día. Se corta bastante antes por
 * las dudas: si un día se rompe todo, prefiero perder avisos repetidos a
 * quedarme sin correos justo cuando aparece un problema distinto.
 */
export const TOPE_AVISOS_POR_DIA = 30;

/**
 * La "huella" de un error: lo que hace que dos errores sean EL MISMO problema.
 *
 * Se le sacan las partes que cambian en cada ocurrencia —ids, números,
 * comillas, direcciones— para que "no existe el pedido abc123" y "no existe el
 * pedido xyz789" se agrupen en vez de contarse como dos problemas distintos.
 *
 * Es lo que decide si recibís un aviso o cuarenta.
 */
export function huellaDeError(mensaje: string, ruta: string): string {
  const limpio = mensaje
    .toLowerCase()
    // cuid / uuid / cualquier cadena larga de letras y números
    .replace(/\b[a-z0-9]{16,}\b/g, "«id»")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "«id»")
    // Números. El límite de palabra va solo al principio: sin eso, "5000ms"
    // no se normaliza —el 0 y la m son las dos letras para el motor— y dos
    // tiempos de espera distintos se cuentan como problemas distintos.
    .replace(/\b\d+/g, "«n»")
    // lo que venga entrecomillado suele ser un valor, no el problema
    .replace(/["'`][^"'`]*["'`]/g, "«valor»")
    // direcciones web completas
    .replace(/https?:\/\/\S+/g, "«url»")
    .replace(/\s+/g, " ")
    .trim();

  // La ruta también se normaliza: /admin/pedidos/abc123 y /admin/pedidos/xyz
  // son la misma pantalla.
  const rutaLimpia = ruta
    .replace(/\/[a-z0-9]{16,}/gi, "/«id»")
    .replace(/\/\d+/g, "/«n»");

  return `${rutaLimpia} :: ${limpio}`.slice(0, 300);
}

export type EstadoAviso = {
  /** Cuándo se avisó por última vez de ESTE problema. Nulo si nunca. */
  ultimoAvisoEn: Date | null;
  /** Cuántos correos se mandaron hoy, de cualquier problema. */
  avisosHoy: number;
};

export type Decision =
  | { avisar: true }
  | { avisar: false; motivo: "reciente" | "tope-diario" };

/**
 * Si corresponde mandar un correo por este error.
 *
 * Un problema nuevo avisa siempre y al instante — es el caso que importa. Uno
 * que ya se avisó hace poco espera; ya sabés que existe.
 */
export function decidirAviso(estado: EstadoAviso, ahora: Date): Decision {
  if (estado.avisosHoy >= TOPE_AVISOS_POR_DIA) {
    return { avisar: false, motivo: "tope-diario" };
  }
  if (estado.ultimoAvisoEn === null) return { avisar: true };

  const horas = (ahora.getTime() - estado.ultimoAvisoEn.getTime()) / 3_600_000;
  return horas >= HORAS_ENTRE_AVISOS
    ? { avisar: true }
    : { avisar: false, motivo: "reciente" };
}

/**
 * El asunto del correo.
 *
 * Tiene que decir lo suficiente para decidir si abrirlo o no desde la
 * notificación del celular: qué local y qué pantalla.
 */
export function asuntoDelAviso(local: string | null, ruta: string): string {
  const donde = local ? ` en ${local}` : "";
  return `Error${donde} · ${ruta}`.slice(0, 120);
}

/** Recorta un texto largo dejando el principio, que es donde está la causa. */
export function recortar(texto: string, maximo = 4000): string {
  return texto.length <= maximo ? texto : texto.slice(0, maximo) + "\n… (recortado)";
}
