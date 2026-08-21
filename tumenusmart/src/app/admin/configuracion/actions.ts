"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function actualizarStore(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const whatsappNumero = String(formData.get("whatsappNumero") ?? "").replace(/[^\d]/g, "");

  if (!nombre || !whatsappNumero) {
    throw new Error("Nombre y WhatsApp son obligatorios");
  }

  const store = await prisma.store.findFirst();
  const datos = {
    nombre,
    whatsappNumero,
    direccion: String(formData.get("direccion") ?? "") || null,
    logoUrl: String(formData.get("logoUrl") ?? "") || null,
    mensajeSaludo: String(formData.get("mensajeSaludo") ?? "") || null,
  };

  if (store) {
    await prisma.store.update({ where: { id: store.id }, data: datos });
  } else {
    await prisma.store.create({ data: datos });
  }

  revalidatePath("/admin/configuracion");
  revalidatePath("/");
}

export async function crearZona(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const costoEnvio = parseFloat(String(formData.get("costoEnvio") ?? "0"));

  if (!nombre || isNaN(costoEnvio)) throw new Error("Datos inválidos");

  await prisma.deliveryZone.create({ data: { nombre, costoEnvio } });
  revalidatePath("/admin/configuracion");
}

export async function eliminarZona(id: string) {
  await prisma.deliveryZone.delete({ where: { id } });
  revalidatePath("/admin/configuracion");
}
