"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { subirLogoNegocio } from "@/lib/supabase-storage";
import { idLocalActual } from "@/lib/local-actual";
import { normalizarSlug } from "@/lib/alcance-local";
import { decidirCambioDeUrl } from "@/lib/url-publica";

// Dos accesos a la base conviven acá a propósito:
//
//   prisma          -> para el LOCAL en sí (Store no lleva columna de local,
//                      así que el filtro automático no lo alcanza; siempre se
//                      indica explícitamente de cuál se trata).
//   prismaDelLocal  -> para todo lo que cuelga del local (zonas, horarios...),
//                      que sale filtrado solo.

/** Refresca las pantallas que dependen de los datos del local. */
function refrescarPantallas() {
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/pedidos");
  revalidatePath("/[slug]", "layout");
}

export async function subirFotoLogo(formData: FormData): Promise<{ url: string }> {
  await exigirPermiso("configuracion.editar");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    throw new Error("No se recibió ninguna imagen");
  }
  const url = await subirLogoNegocio(archivo);

  // Se guarda de una, sin esperar a que aprieten "Guardar" al pie del
  // formulario grande — si no, la imagen se ve cargada en la vista previa
  // pero el negocio se queda sin actualizar hasta que el usuario note que
  // falta guardar el resto del formulario.
  await prisma.store.update({
    where: { id: await idLocalActual() },
    data: { logoUrl: url },
  });
  refrescarPantallas();

  return { url };
}

export async function quitarLogoStore(): Promise<void> {
  await exigirPermiso("configuracion.editar");
  await prisma.store.update({
    where: { id: await idLocalActual() },
    data: { logoUrl: null },
  });
  refrescarPantallas();
}

export async function alternarPausaPedidos(pausado: boolean): Promise<void> {
  await exigirPermiso("configuracion.editar");
  await prisma.store.update({
    where: { id: await idLocalActual() },
    data: { pedidosPausados: pausado },
  });
  refrescarPantallas();
}

export async function guardarMensajePausa(mensaje: string): Promise<void> {
  await exigirPermiso("configuracion.editar");
  await prisma.store.update({
    where: { id: await idLocalActual() },
    data: { mensajePausa: mensaje.trim() || null },
  });
  refrescarPantallas();
}

export async function guardarFidelizacion(formData: FormData): Promise<void> {
  await exigirPermiso("fidelizacion.gestionar");
  const activa = formData.get("fidelizacionActiva") === "on";
  const umbralCrudo = parseInt(String(formData.get("fidelizacionUmbral") ?? "10"), 10);
  // Rango acotado para filtrar errores de tipeo (un 0 o un 99999 no tienen
  // sentido como cantidad de pedidos para un premio).
  const umbral = Math.max(1, Math.min(50, Number.isFinite(umbralCrudo) ? umbralCrudo : 10));
  const premio = String(formData.get("fidelizacionPremio") ?? "").trim() || null;

  await prisma.store.update({
    where: { id: await idLocalActual() },
    data: { fidelizacionActiva: activa, fidelizacionUmbral: umbral, fidelizacionPremio: premio },
  });
  refrescarPantallas();
  revalidatePath("/admin/analytics");
}

export async function agregarTramoHorario(formData: FormData) {
  await exigirPermiso("configuracion.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const diaSemana = Number(formData.get("diaSemana"));
  const abre = String(formData.get("abre") ?? "").trim();
  const cierra = String(formData.get("cierra") ?? "").trim();

  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    throw new Error("Día inválido");
  }
  if (!abre || !cierra) throw new Error("Faltan las horas de apertura y cierre");

  await db.horarioAtencion.create({
    data: { diaSemana, abre, cierra, storeId: idLocal },
  });

  revalidatePath("/admin/configuracion/horarios");
  revalidatePath("/[slug]", "layout");
}

export async function eliminarTramoHorario(id: string): Promise<void> {
  await exigirPermiso("configuracion.editar");
  const db = prismaDelLocal(await idLocalActual());

  await db.horarioAtencion.delete({ where: { id } });

  revalidatePath("/admin/configuracion/horarios");
  revalidatePath("/[slug]", "layout");
}

export async function actualizarStore(formData: FormData) {
  await exigirPermiso("configuracion.editar");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const whatsappNumero = String(formData.get("whatsappNumero") ?? "").replace(/[^\d]/g, "");
  // Cómo se ve la carta pública. Se compara contra la lista de valores válidos
  // en vez de guardar lo que venga: el formulario es del cliente, y el cliente
  // puede mandar cualquier cosa.
  const estiloCarta =
    String(formData.get("estiloCarta") ?? "lista") === "tarjetas" ? "tarjetas" : "lista";

  if (!nombre || !whatsappNumero) {
    throw new Error("Nombre y WhatsApp son obligatorios");
  }

  // envioModo, lat y lng NO se tocan acá: viven en su propio formulario más
  // abajo en la pantalla (guardarEnvioUbicacion), para que guardar el nombre
  // del negocio no pise sin querer la ubicación del mapa.
  const datos = {
    nombre,
    whatsappNumero,
    direccion: String(formData.get("direccion") ?? "") || null,
    logoUrl: String(formData.get("logoUrl") ?? "") || null,
    mensajeSaludo: String(formData.get("mensajeSaludo") ?? "") || null,
    mensajeSaludoReserva: String(formData.get("mensajeSaludoReserva") ?? "") || null,
    estiloCarta,
  };

  // Ojo con el orden: en el primer arranque todavía NO hay ningún local, y
  // preguntar "¿cuál estoy administrando?" daría error. Por eso se mira
  // primero si existe alguno, en vez de resolver el actual de entrada.
  const existeAlguno = await prisma.store.findFirst({ select: { id: true } });

  if (existeAlguno) {
    await prisma.store.update({
      where: { id: await idLocalActual() },
      data: datos,
    });
  } else {
    // Primer arranque: el local necesita además su nombre para la URL, que
    // sale del nombre del negocio. Se puede cambiar después.
    await prisma.store.create({
      data: { ...datos, slug: normalizarSlug(nombre) || "negocio" },
    });
  }

  refrescarPantallas();
  redirect("/admin/configuracion?guardado=1");
}

export async function guardarEnvioUbicacion(formData: FormData): Promise<void> {
  await exigirPermiso("configuracion.editar");
  const envioModo =
    String(formData.get("envioModo") ?? "zonas") === "coordinar" ? "coordinar" : "zonas";

  const latRaw = String(formData.get("lat") ?? "").trim();
  const lngRaw = String(formData.get("lng") ?? "").trim();
  const lat = latRaw ? parseFloat(latRaw) : null;
  const lng = lngRaw ? parseFloat(lngRaw) : null;

  await prisma.store.update({
    where: { id: await idLocalActual() },
    data: {
      envioModo,
      lat: lat != null && !isNaN(lat) ? lat : null,
      lng: lng != null && !isNaN(lng) ? lng : null,
    },
  });
  refrescarPantallas();
}

export async function crearZona(formData: FormData) {
  await exigirPermiso("configuracion.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const radioKm = parseFloat(String(formData.get("radioKm") ?? "0"));
  const costoEnvio = parseFloat(String(formData.get("costoEnvio") ?? "0"));

  if (!nombre || isNaN(radioKm) || radioKm <= 0 || isNaN(costoEnvio)) {
    throw new Error("Datos inválidos");
  }

  await db.deliveryZone.create({
    data: { nombre, radioKm, costoEnvio, storeId: idLocal },
  });
  revalidatePath("/admin/configuracion");
  revalidatePath("/[slug]", "layout");
}

export async function eliminarZona(id: string) {
  await exigirPermiso("configuracion.editar");
  const db = prismaDelLocal(await idLocalActual());

  const pedidosEnZona = await db.order.count({ where: { deliveryZoneId: id } });
  if (pedidosEnZona > 0) {
    throw new Error(
      `No se puede borrar: hay ${pedidosEnZona} pedido(s) que usan esta zona como parte de su historial. Si ya no la querés ofrecer, usá el botón "Desactivar" en vez de borrarla — así dejás de mostrarla a nuevos clientes pero conservás el historial de esos pedidos.`
    );
  }
  await db.deliveryZone.delete({ where: { id } });
  revalidatePath("/admin/configuracion");
  revalidatePath("/[slug]", "layout");
}

export async function alternarActivaZona(id: string, activo: boolean) {
  await exigirPermiso("configuracion.editar");
  const db = prismaDelLocal(await idLocalActual());

  await db.deliveryZone.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/configuracion");
  revalidatePath("/[slug]", "layout");
}

/**
 * Cambiar la dirección pública del local (el "/loquesea" de la URL).
 *
 * Va aparte de `actualizarStore` a propósito. Guardar el teléfono y cambiar la
 * dirección de la carta no son la misma clase de acción: lo segundo afecta a
 * carteles ya impresos y a enlaces que están dando vueltas en WhatsApp. Si
 * viajara en el mismo formulario, alguien que entró a corregir el horario
 * podría cambiar la URL sin darse cuenta.
 *
 * La dirección vieja NO se tira: queda guardada y sigue funcionando.
 */
export async function cambiarUrlPublica(
  formData: FormData
): Promise<{ ok: boolean; error?: string; slug?: string }> {
  await exigirPermiso("configuracion.editar");

  const pedido = String(formData.get("slug") ?? "");
  const storeId = await idLocalActual();

  const actual = await prisma.store.findUnique({
    where: { id: storeId },
    select: { slug: true },
  });
  if (!actual) return { ok: false, error: "No encontré el local" };

  const slugTanteo = normalizarSlug(pedido);

  // Las dos consultas se hacen antes de decidir para que `decidirCambioDeUrl`
  // reciba la situación completa y no tenga que ir a la base: así las reglas
  // quedan probables sin levantar PostgreSQL.
  const [ocupada, vieja] = await Promise.all([
    slugTanteo
      ? prisma.store.findUnique({ where: { slug: slugTanteo }, select: { id: true } })
      : null,
    slugTanteo
      ? prisma.slugAnterior.findUnique({ where: { slug: slugTanteo }, select: { storeId: true } })
      : null,
  ]);

  const decision = decidirCambioDeUrl({
    pedido,
    actual: actual.slug,
    ocupadaPorOtro: Boolean(ocupada && ocupada.id !== storeId),
    fueDeOtro: Boolean(vieja && vieja.storeId !== storeId),
  });

  if (!decision.ok) return { ok: false, error: decision.error };
  if (!decision.cambia) return { ok: true, slug: decision.slug };

  const slug = decision.slug;

  await prisma.$transaction([
    // Si el local vuelve a una dirección que ya tuvo, esa entrada deja de ser
    // "anterior": si quedara, la dirección redirigiría a sí misma.
    prisma.slugAnterior.deleteMany({ where: { slug, storeId } }),
    prisma.slugAnterior.upsert({
      where: { slug: actual.slug },
      update: { storeId },
      create: { slug: actual.slug, storeId },
    }),
    prisma.store.update({ where: { id: storeId }, data: { slug } }),
  ]);

  refrescarPantallas();
  return { ok: true, slug };
}
