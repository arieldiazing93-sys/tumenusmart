import { prisma } from "@/lib/prisma";
import { borrarImagenes, rutaDeImagenPropia, rutaEnUsoDeUrl } from "@/lib/supabase-storage";

/**
 * Descartar las imágenes que dejaron de usarse.
 *
 * Una foto que se cambia o se quita no puede quedar en el almacenamiento: son megas que se acumulan para siempre y nadie las ve.
 * Cada pantalla que reemplaza o quita una imagen (logo, portada, producto, servicio, personal, cliente, página de reservas,
 * colaborador) anota la dirección que había ANTES, guarda lo nuevo y, recién cuando eso salió bien, llama a `descartarImagenes`.
 *
 * Reglas que hacen seguro el borrado:
 *  - solo se borra una imagen de NUESTRO almacenamiento y con la forma de lo que sube este sistema (`rutaDeImagenPropia`): una
 *    foto que un formulario trajo de afuera nunca se toca;
 *  - antes de borrar se mira si ALGUNA fila de CUALQUIER local todavía la usa (un producto duplicado comparte la foto con el
 *    original; y un local no puede pedir que se borre la foto de otro apuntando a su dirección): si se usa, se conserva;
 *  - es "lo mejor posible": si borrar falla, el cambio que el usuario hizo ya está guardado y no se le muestra ningún error. Lo
 *    que quede sin borrar lo recoge la limpieza diaria (`limpiarImagenesHuerfanas`).
 */

/** Las direcciones de imágenes de la galería de una página de reservas (guardadas como [{ url, descripcion }]). */
export function urlsDeGaleria(galeria: unknown): string[] {
  if (!Array.isArray(galeria)) return [];
  const urls: string[] = [];
  for (const g of galeria) {
    const url = g && typeof g === "object" ? (g as { url?: unknown }).url : null;
    if (typeof url === "string" && url) urls.push(url);
  }
  return urls;
}

/** ¿Alguna fila de cualquier local guarda una dirección que apunte a esta ruta del almacenamiento? */
export async function imagenEnUso(ruta: string): Promise<boolean> {
  const hallazgos = await Promise.all([
    prisma.store.findFirst({ where: { OR: [{ logoUrl: { contains: ruta } }, { portadaUrl: { contains: ruta } }] }, select: { id: true } }),
    prisma.product.findFirst({ where: { imagenUrl: { contains: ruta } }, select: { id: true } }),
    prisma.customer.findFirst({ where: { fotoUrl: { contains: ruta } }, select: { id: true } }),
    prisma.miembroPersonal.findFirst({ where: { fotoUrl: { contains: ruta } }, select: { id: true } }),
    prisma.colaborador.findFirst({ where: { fotoUrl: { contains: ruta } }, select: { id: true } }),
    prisma.marcacionAsistencia.findFirst({ where: { fotoUrl: { contains: ruta } }, select: { id: true } }),
    prisma.paginaReservas.findFirst({ where: { OR: [{ fotoUrl: { contains: ruta } }, { bannerUrl: { contains: ruta } }] }, select: { storeId: true } }),
  ]);
  if (hallazgos.some((h) => h !== null)) return true;

  // La galería es una lista dentro de una columna: no se puede buscar con un filtro, se mira en memoria (una fila por local).
  const paginas = await prisma.paginaReservas.findMany({ select: { galeria: true } });
  return paginas.some((p) => urlsDeGaleria(p.galeria).some((u) => (rutaEnUsoDeUrl(u) ?? "") === ruta));
}

/**
 * Borra del almacenamiento las imágenes de la lista que ya no usa ninguna fila. Acepta null / vacías / repetidas y direcciones de
 * cualquier lado. Nunca lanza: devuelve cuántas borró.
 */
export async function descartarImagenes(urls: Array<string | null | undefined>): Promise<number> {
  const rutas = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    const ruta = rutaDeImagenPropia(u);
    if (ruta) rutas.add(ruta);
  }

  let borradas = 0;
  for (const ruta of rutas) {
    try {
      if (await imagenEnUso(ruta)) continue;
      await borrarImagenes([ruta]);
      borradas += 1;
    } catch (e) {
      console.error("[imagenes] no se pudo descartar una imagen que ya no se usa", ruta, e);
    }
  }
  return borradas;
}

/** Las direcciones que estaban y ya no están: para páginas con varias imágenes (perfil, portada y galería). */
export function urlsQueSeFueron(antes: Array<string | null | undefined>, ahora: Array<string | null | undefined>): string[] {
  const siguen = new Set(ahora.filter((u): u is string => !!u));
  return antes.filter((u): u is string => !!u && !siguen.has(u));
}
