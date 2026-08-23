"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { subirLogoNegocio } from "@/lib/supabase-storage";
import { idLocalActual } from "@/lib/local-actual";
import { normalizarSlug } from "@/lib/alcance-local";

export async function subirFotoLogo(formData: FormData): Promise<{ url: string }> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    throw new Error("No se recibió ninguna imagen");
  }
  const url = await subirLogoNegocio(archivo);

  // Se guarda de una, sin esperar a que aprieten "Guardar" al pie del
  // formulario grande — si no, la imagen se ve cargada en la vista previa
  // pero el negocio (Store.logoUrl) se queda sin actualizar hasta que el
  // usuario note que falta guardar el resto del formulario.
  const store = await prisma.store.findFirst();
  if (store) {
    await prisma.store.update({ where: { id: store.id }, data: { logoUrl: url } });
    revalidatePath("/admin/configuracion");
    revalidatePath("/");
    revalidatePath("/checkout");
  }

  return { url };
}

export async function quitarLogoStore(): Promise<void> {
  const store = await prisma.store.findFirst();
  if (store) {
    await prisma.store.update({ where: { id: store.id }, data: { logoUrl: null } });
    revalidatePath("/admin/configuracion");
    revalidatePath("/");
    revalidatePath("/checkout");
  }
}

export async function alternarPausaPedidos(pausado: boolean): Promise<void> {
  const store = await prisma.store.findFirst();
  if (!store) throw new Error("Todavía no cargaste los datos del negocio");

  await prisma.store.update({
    where: { id: store.id },
    data: { pedidosPausados: pausado },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/configuracion");
  revalidatePath("/");
  revalidatePath("/checkout");
}

export async function guardarMensajePausa(mensaje: string): Promise<void> {
  const store = await prisma.store.findFirst();
  if (!store) throw new Error("Todavía no cargaste los datos del negocio");

  await prisma.store.update({
    where: { id: store.id },
    data: { mensajePausa: mensaje.trim() || null },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/configuracion");
  revalidatePath("/");
}

export async function agregarTramoHorario(formData: FormData) {
  const diaSemana = Number(formData.get("diaSemana"));
  const abre = String(formData.get("abre") ?? "").trim();
  const cierra = String(formData.get("cierra") ?? "").trim();

  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    throw new Error("Día inválido");
  }
  if (!abre || !cierra) throw new Error("Faltan las horas de apertura y cierre");

  await prisma.horarioAtencion.create({
    data: { storeId: await idLocalActual(), diaSemana, abre, cierra },
  });

  revalidatePath("/admin/configuracion/horarios");
  revalidatePath("/");
  revalidatePath("/checkout");
  revalidatePath("/reservas");
}

export async function eliminarTramoHorario(id: string): Promise<void> {
  await prisma.horarioAtencion.delete({ where: { id } });

  revalidatePath("/admin/configuracion/horarios");
  revalidatePath("/");
  revalidatePath("/checkout");
  revalidatePath("/reservas");
}

export async function actualizarStore(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const whatsappNumero = String(formData.get("whatsappNumero") ?? "").replace(/[^\d]/g, "");
  const envioModo = String(formData.get("envioModo") ?? "zonas") === "coordinar" ? "coordinar" : "zonas";

  if (!nombre || !whatsappNumero) {
    throw new Error("Nombre y WhatsApp son obligatorios");
  }

  const latRaw = String(formData.get("lat") ?? "").trim();
  const lngRaw = String(formData.get("lng") ?? "").trim();
  const lat = latRaw ? parseFloat(latRaw) : null;
  const lng = lngRaw ? parseFloat(lngRaw) : null;

  const store = await prisma.store.findFirst();
  const datos = {
    nombre,
    whatsappNumero,
    direccion: String(formData.get("direccion") ?? "") || null,
    logoUrl: String(formData.get("logoUrl") ?? "") || null,
    mensajeSaludo: String(formData.get("mensajeSaludo") ?? "") || null,
    mensajeSaludoReserva: String(formData.get("mensajeSaludoReserva") ?? "") || null,
    envioModo,
    lat: lat != null && !isNaN(lat) ? lat : null,
    lng: lng != null && !isNaN(lng) ? lng : null,
  };

  if (store) {
    await prisma.store.update({ where: { id: store.id }, data: datos });
  } else {
    // Primer arranque: el local necesita además su nombre para la URL, que
    // sale del nombre del negocio. Se puede cambiar después.
    await prisma.store.create({
      data: { ...datos, slug: normalizarSlug(nombre) || "negocio" },
    });
  }

  revalidatePath("/admin/configuracion");
  revalidatePath("/checkout");
  revalidatePath("/");
  redirect("/admin/configuracion?guardado=1");
}

export async function crearZona(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const radioKm = parseFloat(String(formData.get("radioKm") ?? "0"));
  const costoEnvio = parseFloat(String(formData.get("costoEnvio") ?? "0"));

  if (!nombre || isNaN(radioKm) || radioKm <= 0 || isNaN(costoEnvio)) {
    throw new Error("Datos inválidos");
  }

  await prisma.deliveryZone.create({
    data: { storeId: await idLocalActual(), nombre, radioKm, costoEnvio },
  });
  revalidatePath("/admin/configuracion");
  revalidatePath("/checkout");
}

export async function eliminarZona(id: string) {
  const pedidosEnZona = await prisma.order.count({ where: { deliveryZoneId: id } });
  if (pedidosEnZona > 0) {
    throw new Error(
      `No se puede borrar: hay ${pedidosEnZona} pedido(s) que usan esta zona como parte de su historial. Si ya no la querés ofrecer, usá el botón "Desactivar" en vez de borrarla — así dejás de mostrarla a nuevos clientes pero conservás el historial de esos pedidos.`
    );
  }
  await prisma.deliveryZone.delete({ where: { id } });
  revalidatePath("/admin/configuracion");
  revalidatePath("/checkout");
}

export async function alternarActivaZona(id: string, activo: boolean) {
  await prisma.deliveryZone.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/configuracion");
  revalidatePath("/checkout");
}
