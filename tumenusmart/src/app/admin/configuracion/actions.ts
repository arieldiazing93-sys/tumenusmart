"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

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
    envioModo,
    lat: lat != null && !isNaN(lat) ? lat : null,
    lng: lng != null && !isNaN(lng) ? lng : null,
  };

  if (store) {
    await prisma.store.update({ where: { id: store.id }, data: datos });
  } else {
    await prisma.store.create({ data: datos });
  }

  revalidatePath("/admin/configuracion");
  revalidatePath("/checkout");
  revalidatePath("/");
}

export async function crearZona(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const radioKm = parseFloat(String(formData.get("radioKm") ?? "0"));
  const costoEnvio = parseFloat(String(formData.get("costoEnvio") ?? "0"));

  if (!nombre || isNaN(radioKm) || radioKm <= 0 || isNaN(costoEnvio)) {
    throw new Error("Datos inválidos");
  }

  await prisma.deliveryZone.create({ data: { nombre, radioKm, costoEnvio } });
  revalidatePath("/admin/configuracion");
  revalidatePath("/checkout");
}

export async function eliminarZona(id: string) {
  await prisma.deliveryZone.delete({ where: { id } });
  revalidatePath("/admin/configuracion");
  revalidatePath("/checkout");
}
