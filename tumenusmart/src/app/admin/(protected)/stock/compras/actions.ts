"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type LineaCompraInput = { insumoId: string; cantidad: number; costoUnitario: number };
export type DatosCompra = {
  proveedorId: string | null;
  fecha: string; // yyyy-mm-dd, del <input type="date">
  numeroComprobante: string | null;
  notas: string | null;
  lineas: LineaCompraInput[];
};

export type ResultadoCompra = { ok: false; error: string };

/**
 * Registra una compra: sube el stock de cada insumo, actualiza su costo de
 * reposición al último precio pagado, y deja un MovimientoStock ("compra")
 * por cada línea — todo en una sola transacción. Si sale bien, redirige
 * sola a la lista (no hay nada más que devolver).
 */
export async function registrarCompra(datos: DatosCompra): Promise<ResultadoCompra | void> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const lineas = datos.lineas.filter(
    (l) => l.insumoId && Number.isFinite(l.cantidad) && l.cantidad > 0 && Number.isFinite(l.costoUnitario) && l.costoUnitario >= 0
  );
  if (lineas.length === 0) {
    return { ok: false, error: "Agregá al menos un insumo con cantidad y costo unitario válidos." };
  }

  const registradoPor = sesion.nombre?.trim() || sesion.email;
  const total = lineas.reduce((s, l) => s + l.cantidad * l.costoUnitario, 0);
  const fechaParseada = datos.fecha ? new Date(datos.fecha) : new Date();
  const fecha = Number.isNaN(fechaParseada.getTime()) ? new Date() : fechaParseada;

  // El IVA de cada línea es un snapshot del insumo al momento de comprar
  // (ver comentario de CompraItem.iva en el schema) — se lee acá, antes de
  // armar la compra.
  const insumosInvolucrados = await prisma.insumo.findMany({
    where: { id: { in: [...new Set(lineas.map((l) => l.insumoId))] } },
    select: { id: true, iva: true },
  });
  const ivaPorInsumo = new Map(insumosInvolucrados.map((i) => [i.id, i.iva]));

  const compra = await prisma.$transaction(async (tx) => {
    const nuevaCompra = await tx.compra.create({
      data: {
        storeId: idLocal,
        proveedorId: datos.proveedorId || null,
        numeroComprobante: datos.numeroComprobante || null,
        fecha,
        total,
        notas: datos.notas || null,
        registradoPor,
        items: {
          create: lineas.map((l) => ({
            storeId: idLocal,
            insumoId: l.insumoId,
            cantidad: l.cantidad,
            costoUnitario: l.costoUnitario,
            subtotal: l.cantidad * l.costoUnitario,
            iva: ivaPorInsumo.get(l.insumoId) ?? "gravado10",
          })),
        },
      },
    });

    for (const linea of lineas) {
      await tx.insumo.update({
        where: { id: linea.insumoId },
        data: {
          stockActual: { increment: linea.cantidad },
          // Costo de reposición: siempre el de la última compra registrada.
          costoUnitario: linea.costoUnitario,
        },
      });
      await tx.movimientoStock.create({
        data: {
          storeId: idLocal,
          insumoId: linea.insumoId,
          tipo: "compra",
          cantidad: linea.cantidad,
          compraId: nuevaCompra.id,
          registradoPor,
        },
      });
    }

    return nuevaCompra;
  });

  revalidatePath("/admin/stock/compras");
  revalidatePath("/admin/stock/insumos");
  redirect("/admin/stock/compras");
}
