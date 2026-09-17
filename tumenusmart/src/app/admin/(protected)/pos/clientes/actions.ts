"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoActualizarCliente = { ok: true } | { ok: false; error: string };

/** Corrección de un typo en el nombre/razón social — no da de alta clientes: eso lo hace solo el flujo de venta. */
export async function actualizarNombreCliente(id: string, nombre: string): Promise<ResultadoActualizarCliente> {
  await exigirPermiso("pos.verHistorico");
  const prisma = prismaDelLocal(await idLocalActual());

  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };

  await prisma.customer.update({ where: { id }, data: { nombre: limpio } });
  revalidatePath("/admin/pos/clientes");
  return { ok: true };
}
