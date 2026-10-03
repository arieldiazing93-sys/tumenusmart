"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoReimpresion = { ok: true } | { ok: false; error: string };

/**
 * Vuelve a poner en la fila una comanda que ya salió (o que falló), para que la estación la imprima de nuevo: se rompió el
 * papel, se atascó la impresora o la cocina la perdió. Solo reencola trabajos de este local que ya terminaron
 * (impresos o con error): uno que todavía está en la fila o imprimiéndose no se toca.
 */
export async function reimprimirTrabajo(id: string): Promise<ResultadoReimpresion> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const trabajo = await db.trabajoImpresion.findFirst({ where: { id }, select: { titulo: true } });
  if (!trabajo) return { ok: false, error: "No se encontró esa comanda." };

  const cambiados = await db.trabajoImpresion.updateMany({
    where: { id, estado: { in: ["impreso", "error"] } },
    data: { estado: "pendiente", intentos: 0, error: null, estacionId: null, reclamadoEn: null, impresoEn: null },
  });
  if (cambiados.count === 0) return { ok: false, error: "Esa comanda todavía está en la fila o imprimiéndose." };

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "comanda_reimpresa",
    descripcion: `Mandó a reimprimir la comanda "${trabajo.titulo}".`,
    entidad: "TrabajoImpresion",
    entidadId: id,
  });

  revalidatePath("/admin/impresion");
  return { ok: true };
}
