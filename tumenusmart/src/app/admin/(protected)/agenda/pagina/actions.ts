"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { sanearDatosPagina, type DatosPagina } from "@/lib/pagina-reservas";
import { subirImagenPaginaReservas } from "@/lib/supabase-storage";

export type ResultadoPagina = { ok: true; slug: string } | { ok: false; error: string };
export type ResultadoImagenPagina = { ok: true; url: string } | { ok: false; error: string };

/**
 * Sube una imagen de la página (foto de perfil o una de la galería) en
 * cuanto se elige, para que se vea enseguida. Solo devuelve la dirección: recién
 * se guarda en la página cuando se aprieta "Guardar cambios". Si después se
 * descarta, la imagen queda sin usar en el almacenamiento (igual que el logo).
 */
export async function subirImagenPagina(formData: FormData): Promise<ResultadoImagenPagina> {
  await exigirPermiso("agenda.configurar");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "No se recibió ninguna imagen" };
  try {
    return { ok: true, url: await subirImagenPaginaReservas(archivo) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo subir la imagen" };
  }
}

/**
 * Guarda la página pública de reservas del negocio, todo junto. Es aparte de la
 * configuración base (Store): no toca nada de ahí.
 *
 * La dirección (/turnos/<slug>) es única entre todos los negocios, así que se
 * revisa que no la use otro.
 */
export async function guardarPaginaReservas(entrada: DatosPagina): Promise<ResultadoPagina> {
  const sesion = await exigirPermiso("agenda.configurar");
  const storeId = await idLocalActual();

  const saneado = sanearDatosPagina(entrada);
  if (!saneado.ok) return saneado;
  const d = saneado.datos;

  // Cliente sin filtro por local a propósito: la dirección es única en TODOS los
  // negocios, así que la búsqueda no puede limitarse al propio.
  const ocupada = await prisma.paginaReservas.findUnique({ where: { slug: d.slug }, select: { storeId: true } });
  if (ocupada && ocupada.storeId !== storeId) {
    return { ok: false, error: `La dirección /turnos/${d.slug} ya la usa otro negocio. Elegí otra.` };
  }

  const anterior = await prisma.paginaReservas.findUnique({
    where: { storeId },
    select: { slug: true, habilitada: true },
  });

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
    colorPrimario: d.colorPrimario,
    tema: d.tema,
    campos: d.campos as unknown as Prisma.InputJsonValue,
  };

  try {
    await prisma.paginaReservas.upsert({
      where: { storeId },
      create: { storeId, ...datos },
      update: datos,
    });
  } catch (err) {
    // Otro negocio tomó la misma dirección justo entre la revisión y el guardado.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: `La dirección /turnos/${d.slug} ya la usa otro negocio. Elegí otra.` };
    }
    throw err;
  }

  const cambios: string[] = [];
  if (!anterior) cambios.push("la creó");
  else {
    if (anterior.habilitada !== d.habilitada) cambios.push(d.habilitada ? "la habilitó" : "la deshabilitó");
    if (anterior.slug !== d.slug) cambios.push(`cambió la dirección a /turnos/${d.slug}`);
  }
  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "pagina_reservas_guardada",
    descripcion:
      cambios.length > 0
        ? `Página de reservas: ${cambios.join(", ")}.`
        : "Actualizó la página de reservas.",
    entidad: "PaginaReservas",
    detalle: { slug: d.slug, habilitada: d.habilitada },
  });

  revalidatePath("/admin/agenda/pagina");
  revalidatePath(`/turnos/${d.slug}`);
  if (anterior && anterior.slug !== d.slug) revalidatePath(`/turnos/${anterior.slug}`);
  return { ok: true, slug: d.slug };
}
