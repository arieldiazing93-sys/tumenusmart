"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { descartarImagenes, urlsDeGaleria, urlsQueSeFueron } from "@/lib/imagenes";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { sanearDatosPagina, type DatosPagina } from "@/lib/pagina-reservas";
import { resolverCoordenadasDeMaps } from "@/lib/ubicacion-maps-servidor";

export type ResultadoPagina = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Guarda la página pública de reservas del complejo, todo junto. Es SU página: aparte de la
 * de la Reserva de turnos (otra tabla) y de la configuración base (Store): no toca nada de eso.
 *
 * La dirección (/canchas/<slug>) es única entre todos los negocios, así que se
 * revisa que no la use otro.
 */
export async function guardarPaginaCanchas(entrada: DatosPagina): Promise<ResultadoPagina> {
  const sesion = await exigirPermiso("canchas.configurar");
  const storeId = await idLocalActual();

  const saneado = sanearDatosPagina(entrada);
  if (!saneado.ok) return saneado;
  const d = saneado.datos;

  // Cliente sin filtro por local a propósito: la dirección es única en TODOS los
  // negocios, así que la búsqueda no puede limitarse al propio.
  const ocupada = await prisma.paginaCanchas.findUnique({ where: { slug: d.slug }, select: { storeId: true } });
  if (ocupada && ocupada.storeId !== storeId) {
    return { ok: false, error: `La dirección /canchas/${d.slug} ya la usa otro negocio. Elegí otra.` };
  }

  const anterior = await prisma.paginaCanchas.findUnique({
    where: { storeId },
    select: {
      slug: true,
      habilitada: true,
      fotoUrl: true,
      bannerUrl: true,
      galeria: true,
      googleMapsUrl: true,
      ubicacionLat: true,
      ubicacionLng: true,
    },
  });

  // Del enlace de Google Maps se sacan las coordenadas (siguiendo el enlace corto de «Compartir»). Si no se pueden sacar, la página se
  // guarda igual y muestra el botón de abrir el enlace, sin mapa. Con el mismo enlace de antes no hace falta volver a pedirlas.
  let ubicacion: { lat: number; lng: number } | null = null;
  if (d.googleMapsUrl) {
    const mismoEnlace =
      !!anterior &&
      anterior.googleMapsUrl === d.googleMapsUrl &&
      anterior.ubicacionLat != null &&
      anterior.ubicacionLng != null;
    ubicacion = mismoEnlace
      ? { lat: Number(anterior?.ubicacionLat), lng: Number(anterior?.ubicacionLng) }
      : await resolverCoordenadasDeMaps(d.googleMapsUrl);
  }

  const datos = {
    slug: d.slug,
    habilitada: d.habilitada,
    nombre: d.nombre,
    industria: d.industria,
    descripcion: d.descripcion,
    email: d.email,
    telefono: d.telefono,
    fotoUrl: d.fotoUrl,
    bannerUrl: d.bannerUrl,
    instagram: d.instagram,
    tiktok: d.tiktok,
    facebook: d.facebook,
    whatsapp: d.whatsapp,
    avisoWhatsapp: d.avisoWhatsapp,
    entradaCalendario: d.entradaCalendario,
    galeria: d.galeria as unknown as Prisma.InputJsonValue,
    googleMapsUrl: d.googleMapsUrl,
    // Las coordenadas del enlace (ver más arriba): con ellas la página pública dibuja el mapa.
    ubicacionLat: ubicacion?.lat ?? null,
    ubicacionLng: ubicacion?.lng ?? null,
    colorPrimario: d.colorPrimario,
    tema: d.tema,
    campos: d.campos as unknown as Prisma.InputJsonValue,
  };

  try {
    await prisma.paginaCanchas.upsert({
      where: { storeId },
      create: { storeId, ...datos },
      update: datos,
    });
  } catch (err) {
    // Otro negocio tomó la misma dirección justo entre la revisión y el guardado.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: `La dirección /canchas/${d.slug} ya la usa otro negocio. Elegí otra.` };
    }
    throw err;
  }

  // Las fotos que estaban y ya no están (se cambió el perfil, el banner o se sacó una de la galería): se borran del almacenamiento.
  if (anterior) {
    await descartarImagenes(
      urlsQueSeFueron(
        [anterior.fotoUrl, anterior.bannerUrl, ...urlsDeGaleria(anterior.galeria)],
        [d.fotoUrl, d.bannerUrl, ...urlsDeGaleria(d.galeria)]
      )
    );
  }

  const cambios: string[] = [];
  if (!anterior) cambios.push("la creó");
  else {
    if (anterior.habilitada !== d.habilitada) cambios.push(d.habilitada ? "la habilitó" : "la deshabilitó");
    if (anterior.slug !== d.slug) cambios.push(`cambió la dirección a /canchas/${d.slug}`);
  }
  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: "pagina_canchas_guardada",
    descripcion:
      cambios.length > 0
        ? `Página de reservas de canchas: ${cambios.join(", ")}.`
        : "Actualizó la página de reservas de canchas.",
    entidad: "PaginaCanchas",
    detalle: { slug: d.slug, habilitada: d.habilitada },
  });

  revalidatePath("/admin/canchas/pagina");
  revalidatePath(`/canchas/${d.slug}`);
  if (anterior && anterior.slug !== d.slug) revalidatePath(`/canchas/${anterior.slug}`);
  return { ok: true, slug: d.slug };
}
