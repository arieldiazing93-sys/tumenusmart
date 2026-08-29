import { notFound, redirect } from "next/navigation";
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

  const buscado = slug.toLowerCase();

  const local = await prisma.store.findUnique({ where: { slug: buscado } });
  if (local) return local;

  // No existe con ese nombre. Antes de dar 404, se mira si fue el nombre
  // ANTERIOR de algún local: los carteles con QR pegados en las mesas y los
  // enlaces que quedaron en grupos de WhatsApp siguen apuntando ahí, y sería
  // una pena matarlos por un cambio de nombre.
  const anterior = await prisma.slugAnterior.findUnique({
    where: { slug: buscado },
    select: { store: { select: { slug: true } } },
  });

  if (anterior) {
    // Se manda a la portada del menú y no a la misma subpágina: acá solo
    // llega el nombre del local, no la dirección completa. En la práctica no
    // se pierde nada — los QR y lo que se comparte apuntan a la portada.
    redirect(`/${anterior.store.slug}`);
  }

  notFound();
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
