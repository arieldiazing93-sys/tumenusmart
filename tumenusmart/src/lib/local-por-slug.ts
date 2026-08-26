import { notFound } from "next/navigation";
import { prisma } from "./prisma";
import { SLUGS_RESERVADOS } from "./alcance-local";
import { estaVencido } from "./suscripcion";

/**
 * Encuentra el local a partir del nombre que viene en la URL.
 *
 * Es LA puerta de entrada de todo lo público: el menú, el carrito, el
 * checkout y las reservas resuelven acá de qué negocio son. Nada más abajo
 * vuelve a preguntarse "¿de qué local es esto?" — lo reciben ya resuelto.
 *
 * Si el nombre no existe, devuelve 404. Un nombre reservado (admin, api...)
 * tampoco es un local válido, aunque en la práctica esas rutas ya las
 * atiende la aplicación antes de llegar acá.
 */
export async function localPorSlug(slug: string) {
  if (!slug || SLUGS_RESERVADOS.has(slug.toLowerCase())) notFound();

  const local = await prisma.store.findUnique({
    where: { slug: slug.toLowerCase() },
  });

  if (!local) notFound();
  return local;
}

export type Local = Awaited<ReturnType<typeof localPorSlug>>;

/**
 * Un local suspendido conserva todos sus datos pero deja de atender al
 * público. El aviso al cliente es neutro a propósito: nunca dice que el
 * negocio no pagó — eso lo expondría frente a sus propios clientes.
 */
export function estaSuspendido(local: { estado: string; vencimiento: Date | null }): boolean {
  if (local.estado === "suspendido") return true;
  // El corte lo decide una sola regla, compartida con el panel de cobranza:
  // la fecha significa "pagado hasta ese día inclusive". Comparar la fecha a
  // secas apagaría el local al EMPEZAR el día que pagó, no al terminarlo.
  return estaVencido(local.vencimiento);
}
