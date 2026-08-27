"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirPermiso } from "@/lib/auth";

/**
 * Marcar un problema como resuelto.
 *
 * No se borra. Si el mismo error vuelve a ocurrir, `registrarError` lo
 * desmarca solo y vuelve a avisar — que es exactamente lo que uno quiere
 * cuando creyó haber arreglado algo y no.
 */
export async function marcarErrorResuelto(id: string, resuelto: boolean) {
  await exigirPermiso("cartera.gestionar");
  await prisma.errorReportado.update({ where: { id }, data: { resuelto } });
  revalidatePath("/admin/errores");
}
