"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/auth";
import { COOKIE_LOCAL } from "@/lib/local-actual";

/**
 * Cambia el local que se está administrando.
 *
 * Solo el superadmin puede hacerlo. Para el resto de los usuarios el local
 * viene de su propio usuario, así que aunque alguien mande este pedido a mano
 * —sin pasar por el selector, que ni siquiera se le muestra— acá se corta.
 */
export async function elegirLocal(storeId: string): Promise<void> {
  await exigirSuperadmin();

  const existe = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true },
  });
  if (!existe) throw new Error("Ese local no existe");

  (await cookies()).set(COOKIE_LOCAL, storeId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/admin", "layout");
}
