/**
 * El enganche de errores de Next.
 *
 * `onRequestError` se dispara con CUALQUIER error del servidor: una pantalla
 * que revienta, una acción que falla, un cron que se cae. No hay que tocar el
 * código existente ni acordarse de envolver nada — se engancha una vez acá y
 * agarra todo lo que pase de ahora en adelante.
 *
 * Ese detalle importa más de lo que parece: un sistema de avisos que depende
 * de que alguien se acuerde de llamarlo es un sistema que va a tener agujeros
 * justo en el código nuevo, que es el que más falla.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  contexto: { routePath?: string }
) {
  // La importación va acá adentro, no arriba: este archivo lo carga Next al
  // arrancar, y cargar Prisma en ese momento haría más lento cada arranque en
  // frío aunque nunca ocurra un error.
  const { registrarError } = await import("./lib/aviso-errores");

  const e = error as { message?: string; stack?: string; digest?: string };

  await registrarError({
    mensaje: e?.message ?? String(error),
    detalle: e?.stack,
    // routePath es el patrón (/admin/pedidos/[id]); path es la dirección real.
    // Se prefiere el patrón: agrupa solo, sin depender de la normalización.
    ruta: contexto?.routePath || request?.path || "desconocida",
  });
}
