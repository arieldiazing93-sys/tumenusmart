"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma as prismaCliente } from "@/lib/prisma";
import { stockEnAlmacen } from "@/lib/stock-almacen";
import { claveDiaAsuncion } from "@/lib/timezone";

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

export type LineaInventario = { insumoId: string; contado: number };
export type ResultadoGuardarInventario =
  | { ok: true; ajustados: number; contados: number }
  | { ok: false; error: string };

/**
 * Guarda una toma de inventario completa: para cada insumo contado en un
 * almacén, deja el stock de ese almacén EXACTAMENTE en lo contado. La
 * diferencia se calcula acá contra lo que hay en el momento de guardar (no
 * contra lo que mostraba la pantalla, que pudo cambiar por una venta
 * mientras se contaba), y cada una queda como un movimiento "ajuste" con el
 * motivo "Inventario físico dd/mm/aaaa". Los que ya coinciden no generan
 * movimiento. Todo o nada: si algo falla, no se ajusta ninguno.
 */
export async function guardarInventario(
  almacenId: string,
  lineas: LineaInventario[],
  detalle?: string
): Promise<ResultadoGuardarInventario> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!almacenId) return { ok: false, error: "Elegí el almacén que contaste." };
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { ok: false, error: "Escribí al menos una cantidad contada." };
  }

  // Un insumo repetido cuenta una sola vez (gana el último).
  const contadoPorInsumo = new Map<string, number>();
  for (const l of lineas) {
    if (!l?.insumoId || !Number.isFinite(l.contado) || l.contado < 0) {
      return { ok: false, error: "Hay una cantidad contada que no es válida: tiene que ser un número mayor o igual a cero." };
    }
    contadoPorInsumo.set(l.insumoId, Math.round(l.contado * 1000) / 1000);
  }
  const idsInsumos = [...contadoPorInsumo.keys()];

  // Insumos y almacén se verifican por el cliente del local: uno de otro
  // negocio simplemente no aparece.
  const [insumos, almacen] = await Promise.all([
    prisma.insumo.findMany({ where: { id: { in: idsInsumos } }, select: { id: true } }),
    prisma.almacen.findUnique({ where: { id: almacenId }, select: { id: true, activo: true } }),
  ]);
  if (insumos.length !== idsInsumos.length) {
    return { ok: false, error: "Alguno de los insumos ya no existe. Recargá la pantalla e intentá de nuevo." };
  }
  if (!almacen || !almacen.activo) return { ok: false, error: "Ese almacén ya no existe o está desactivado." };

  const registradoPor = sesion.nombre?.trim() || sesion.email;
  const fecha = claveDiaAsuncion(new Date()).split("-").reverse().join("/");
  const notas = detalle?.trim().slice(0, 150);
  const motivo = `Inventario físico ${fecha}${notas ? ` — ${notas}` : ""}`;

  const ajustados = await prismaCliente.$transaction(
    async (tx) => {
      // Lo que hay ahora en ese almacén, de todos los insumos contados, en una sola consulta.
      const actuales = await tx.movimientoStock.groupBy({
        by: ["insumoId"],
        where: { storeId: idLocal, almacenId, insumoId: { in: idsInsumos } },
        _sum: { cantidad: true },
      });
      const enElAlmacen = new Map(actuales.map((a) => [a.insumoId, Number(a._sum.cantidad ?? 0)]));

      const movimientos: {
        storeId: string;
        insumoId: string;
        almacenId: string;
        tipo: string;
        cantidad: number;
        motivo: string;
        registradoPor: string;
      }[] = [];
      for (const [insumoId, contado] of contadoPorInsumo) {
        const diferencia = Math.round((contado - (enElAlmacen.get(insumoId) ?? 0)) * 1000) / 1000;
        if (diferencia === 0) continue;
        await tx.insumo.update({ where: { id: insumoId }, data: { stockActual: { increment: diferencia } } });
        movimientos.push({
          storeId: idLocal,
          insumoId,
          almacenId,
          tipo: "ajuste",
          cantidad: diferencia,
          motivo,
          registradoPor,
        });
      }
      if (movimientos.length > 0) await tx.movimientoStock.createMany({ data: movimientos });
      return movimientos.length;
    },
    // Un inventario grande son cientos de actualizaciones: el tiempo por
    // defecto (5 segundos) no alcanza siempre.
    { timeout: 30000 }
  );

  revalidatePath("/admin/stock/inventario");
  revalidatePath("/admin/stock/insumos");
  return { ok: true, ajustados, contados: idsInsumos.length };
}
