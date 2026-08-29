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

/**
 * Reventar a propósito, para comprobar que el aviso funciona.
 *
 * Hace falta porque una pantalla de errores vacía no distingue entre "no hubo
 * errores" y "no se está grabando nada": las dos cosas se ven igual. La única
 * forma de saberlo es provocar un error de verdad y ver si aparece.
 *
 * Y tiene que ser un error DE VERDAD, no una llamada directa a registrarError.
 * Lo que está en duda no es si sabemos guardar una fila — es si el enganche de
 * Next (`onRequestError`) está agarrando lo que se rompe. Escribir la fila a
 * mano probaría la parte que no preocupa y dejaría intacta la que sí.
 *
 * Por eso esta acción tira la excepción y no la atrapa: tiene que subir hasta
 * Next igual que subiría un error real.
 */
export async function probarElAviso() {
  const sesion = await exigirPermiso("cartera.gestionar");
  throw new Error(
    `Prueba del sistema de avisos — la lanzó ${sesion.email} a propósito desde el panel`
  );
}
