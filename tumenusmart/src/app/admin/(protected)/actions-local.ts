"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { COOKIE_LOCAL } from "@/lib/local-actual";

/**
 * Cambia el local que se está administrando.
 *
 * Temporal, de la fase 2: en la fase 3 cada usuario va a tener su local
 * asignado en la sesión y este selector deja de existir.
 */
export async function elegirLocal(storeId: string): Promise<void> {
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
