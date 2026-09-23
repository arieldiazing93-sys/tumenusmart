"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma as prismaCliente } from "@/lib/prisma";
import { stockEnAlmacen } from "@/lib/stock-almacen";

export type ResultadoAjuste = { ok: true } | { ok: false; error: string };

/**
 * Ajuste manual de inventario: el dueño escribe lo que CONTÓ físicamente en
 * un almacén (no una diferencia — se calcula sola), y queda un
 * MovimientoStock de ese almacén con esa diferencia, para que el historial
 * explique cada cambio de stock. El total del insumo sube o baja lo mismo.
 */
export async function ajustarInventario(
  insumoId: string,
  almacenId: string,
  cantidadContada: number,
  motivo?: string
): Promise<ResultadoAjuste> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!Number.isFinite(cantidadContada) || cantidadContada < 0) {
    return { ok: false, error: "La cantidad contada tiene que ser un número mayor o igual a cero." };
  }
  if (!almacenId) return { ok: false, error: "Elegí el almacén que contaste." };

  // Insumo y almacén se verifican por el cliente del local: uno de otro
  // negocio simplemente no aparece.
  const [insumo, almacen] = await Promise.all([
    prisma.insumo.findUnique({ where: { id: insumoId }, select: { id: true } }),
    prisma.almacen.findUnique({ where: { id: almacenId }, select: { id: true, activo: true } }),
  ]);
  if (!insumo) return { ok: false, error: "No encontré ese insumo." };
  if (!almacen || !almacen.activo) return { ok: false, error: "Ese almacén ya no existe o está desactivado." };

  const registradoPor = sesion.nombre?.trim() || sesion.email;

  // El cliente crudo, con storeId explícito: el helper del stock por almacén
  // tiene que poder correr adentro de esta transacción.
  await prismaCliente.$transaction(async (tx) => {
    const enElAlmacen = await stockEnAlmacen(tx, idLocal, insumoId, almacenId);
    const diferencia = Math.round((cantidadContada - enElAlmacen) * 1000) / 1000;
    if (diferencia === 0) return;

    await tx.insumo.update({ where: { id: insumoId }, data: { stockActual: { increment: diferencia } } });
    await tx.movimientoStock.create({
      data: {
        storeId: idLocal,
        insumoId,
        almacenId,
        tipo: "ajuste",
        cantidad: diferencia,
        motivo: motivo?.trim() || null,
        registradoPor,
      },
    });
  });

  revalidatePath("/admin/stock/inventario");
  revalidatePath(`/admin/stock/inventario/${insumoId}`);
  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}
