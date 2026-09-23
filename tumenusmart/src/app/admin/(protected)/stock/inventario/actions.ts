"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoAjuste = { ok: true } | { ok: false; error: string };

/**
 * Ajuste manual de inventario: el dueño escribe lo que CONTÓ físicamente
 * (no una diferencia — se calcula sola), y queda un MovimientoStock con esa
 * diferencia, para que el historial explique cada cambio de stock.
 */
export async function ajustarInventario(
  insumoId: string,
  cantidadContada: number,
  motivo?: string
): Promise<ResultadoAjuste> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!Number.isFinite(cantidadContada) || cantidadContada < 0) {
    return { ok: false, error: "La cantidad contada tiene que ser un número mayor o igual a cero." };
  }

  const insumo = await prisma.insumo.findUnique({ where: { id: insumoId }, select: { stockActual: true } });
  if (!insumo) return { ok: false, error: "No encontré ese insumo." };

  const diferencia = cantidadContada - Number(insumo.stockActual);
  if (diferencia === 0) return { ok: true };

  const registradoPor = sesion.nombre?.trim() || sesion.email;

  await prisma.$transaction([
    prisma.insumo.update({ where: { id: insumoId }, data: { stockActual: cantidadContada } }),
    prisma.movimientoStock.create({
      data: {
        storeId: idLocal,
        insumoId,
        tipo: "ajuste",
        cantidad: diferencia,
        motivo: motivo?.trim() || null,
        registradoPor,
      },
    }),
  ]);

  revalidatePath("/admin/stock/inventario");
  revalidatePath(`/admin/stock/inventario/${insumoId}`);
  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}
