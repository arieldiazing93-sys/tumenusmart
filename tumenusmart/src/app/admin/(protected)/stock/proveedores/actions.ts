"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoProveedor = { ok: true } | { ok: false; error: string };
export type ResultadoCrearProveedor = { ok: true; proveedorId: string } | { ok: false; error: string };

function recortar(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? "").trim();
  return texto || null;
}

export async function crearProveedor(formData: FormData): Promise<ResultadoCrearProveedor> {
  await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre comercial es obligatorio" };

  const proveedor = await prisma.proveedor.create({
    data: {
      storeId: idLocal,
      nombre,
      razonSocial: recortar(formData.get("razonSocial")),
      ruc: recortar(formData.get("ruc")),
      telefono: recortar(formData.get("telefono")),
      ciudad: recortar(formData.get("ciudad")),
      email: recortar(formData.get("email")),
      notas: recortar(formData.get("notas")),
    },
  });
  revalidatePath("/admin/stock/proveedores");
  return { ok: true, proveedorId: proveedor.id };
}

export async function editarProveedor(id: string, formData: FormData): Promise<ResultadoProveedor> {
  await exigirPermiso("stock.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre comercial es obligatorio" };

  await prisma.proveedor.update({
    where: { id },
    data: {
      nombre,
      razonSocial: recortar(formData.get("razonSocial")),
      ruc: recortar(formData.get("ruc")),
      telefono: recortar(formData.get("telefono")),
      ciudad: recortar(formData.get("ciudad")),
      email: recortar(formData.get("email")),
      notas: recortar(formData.get("notas")),
      activo: formData.get("activo") === "on",
    },
  });
  revalidatePath("/admin/stock/proveedores");
  return { ok: true };
}
