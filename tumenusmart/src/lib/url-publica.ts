/**
 * Las reglas para cambiar la dirección pública de un local.
 *
 * Está separado de la acción del servidor porque son dos cosas distintas: la
 * acción sabe consultar la base, esto sabe DECIDIR. Al no depender de Prisma,
 * las reglas se pueden probar de verdad — incluidos los casos que en la vida
 * real aparecen una vez cada dos años y son justo los que salen mal.
 */
import { normalizarSlug, SLUGS_RESERVADOS } from "./alcance-local";

export type Resultado =
  | { ok: true; slug: string; cambia: boolean }
  | { ok: false; error: string };

export type Situacion = {
  /** Lo que escribió la persona, tal cual. */
  pedido: string;
  /** La dirección que el local tiene ahora. */
  actual: string;
  /** Si otro local YA usa esa dirección. */
  ocupadaPorOtro: boolean;
  /** Si esa dirección fue de otro local y sus carteles todavía apuntan ahí. */
  fueDeOtro: boolean;
};

export function decidirCambioDeUrl(s: Situacion): Resultado {
  if (!s.pedido.trim()) {
    return { ok: false, error: "Escribí la nueva dirección" };
  }

  // Se normaliza en vez de rechazar: quien escribe "La Esquina del Fabri"
  // quiere "la-esquina-del-fabri", no un reto sobre mayúsculas y espacios.
  const slug = normalizarSlug(s.pedido);

  if (slug.length < 2) {
    return { ok: false, error: "Esa dirección queda muy corta. Usá al menos dos letras." };
  }
  if (SLUGS_RESERVADOS.has(slug)) {
    return { ok: false, error: `"${slug}" es una palabra que usa el sistema. Elegí otra.` };
  }

  // Guardar la misma que ya tenía no es un error, pero tampoco hay que tocar
  // nada: si se guardara igual, la dirección actual quedaría anotada como
  // "anterior" de sí misma y redirigiría en círculo.
  if (slug === s.actual) {
    return { ok: true, slug, cambia: false };
  }

  if (s.ocupadaPorOtro) {
    return { ok: false, error: `Ya hay un local usando /${slug}` };
  }
  if (s.fueDeOtro) {
    return {
      ok: false,
      error: `/${slug} fue la dirección de otro local y sus carteles todavía apuntan ahí.`,
    };
  }

  return { ok: true, slug, cambia: true };
}
