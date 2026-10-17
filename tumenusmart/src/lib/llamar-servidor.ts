/**
 * Llamar a una acción del servidor sin que una caída de internet (o un error inesperado del servidor) rompa la pantalla.
 *
 * Una acción del servidor «lanza» cuando la red se corta o el servidor falla por algo que no previó (en lugar de devolver {ok:false}):
 * si la pantalla no lo atrapa, el botón se queda en «Guardando…» o «Cerrando…» para siempre, o toda la pantalla se cambia por «Algo salió
 * mal» y se pierde lo que se estaba cargando. Con un local con wifi flojo eso pasa de verdad.
 *
 *     const r = await llamarAlServidor(() => cerrarTurno(turnoId, datos));
 *     if (!r.ok) { setError(r.error); return; }     // el mismo camino de siempre para un error, también cuando se cortó la red
 *
 * OJO con las acciones que mueven plata: si la red se corta DESPUÉS de que el servidor ya guardó, la pantalla no se entera. Por eso el
 * mensaje pide mirar el historial antes de repetir (ver `MENSAJE_DUDOSO`).
 */
export const MENSAJE_SIN_RED = "No se pudo comunicar con el servidor. Revisá la conexión y probá de nuevo.";

/** Para lo que mueve plata o cierra algo: puede que el servidor SÍ lo haya guardado y solo se perdió la respuesta. */
export const MENSAJE_DUDOSO =
  "Se cortó la comunicación con el servidor y no sabemos si se guardó. Antes de repetirlo, revisá en el historial si ya quedó hecho.";

export async function llamarAlServidor<R>(
  accion: () => Promise<R>,
  mensaje: string = MENSAJE_SIN_RED
): Promise<R | { ok: false; error: string }> {
  try {
    return await accion();
  } catch {
    return { ok: false, error: mensaje };
  }
}
