"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoProveedor = { ok: true } | { ok: false; error: string };

function recortar(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? "").trim();
  return texto || null;
}

export async function crearProveedor(formData: FormData): Promise<ResultadoProveedor> {
  await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  await prisma.proveedor.create({
    data: {
      storeId: idLocal,
      nombre,
      telefono: recortar(formData.get("telefono")),
      email: recortar(formData.get("email")),
      notas: recortar(formData.get("notas")),
    },
  });
  revalidatePath("/admin/stock/proveedores");
  return { ok: true };
}

export async function editarProveedor(
  id: string,
  datos: { nombre: string; telefono: string; email: string; notas: string }
): Promise<ResultadoProveedor> {
  await exigirPermiso("stock.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  await prisma.proveedor.update({
    where: { id },
    data: {
      nombre,
      telefono: datos.telefono.trim() || null,
      email: datos.email.trim() || null,
      notas: datos.notas.trim() || null,
    },
  });
  revalidatePath("/admin/stock/proveedores");
  return { ok: true };
}

export async function alternarActivoProveedor(id: string, activo: boolean) {
  await exigirPermiso("stock.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.proveedor.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/stock/proveedores");
}
