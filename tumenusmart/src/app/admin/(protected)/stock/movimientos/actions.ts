"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma as prismaCliente } from "@/lib/prisma";
import { stockEnAlmacen } from "@/lib/stock-almacen";
import { registrarBitacora } from "@/lib/bitacora";
import { conceptoDelMovimiento, type TipoMovimientoAlmacen } from "@/lib/movimiento-almacen";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";

export type DatosMovimientoAlmacen = {
  tipo: TipoMovimientoAlmacen;
  almacenId: string;
  insumoId: string;
  /** En la unidad del insumo (la de su stock). Siempre positiva: el signo lo da el tipo. */
  cantidad: number;
  /** El valor del motivo elegido (ver movimiento-almacen.ts). */
  motivo: string;
  /** Lo que se escribió aparte; obligatorio si el motivo es "Otro motivo". */
  detalle: string;
};

export type ResultadoMovimientoAlmacen = { ok: true } | { ok: false; error: string };

function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Cuánto hay de un insumo en un almacén ahora — para que quien carga una salida
 * vea de cuánto puede sacar. Null si el insumo o el almacén no son de este local.
 */
export async function consultarStockEnAlmacen(
  insumoId: string,
  almacenId: string
): Promise<{ stock: number; unidad: string } | null> {
  await exigirPermiso("stock.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [insumo, almacen] = await Promise.all([
    db.insumo.findUnique({ where: { id: insumoId }, select: { unidadMedida: true } }),
    db.almacen.findUnique({ where: { id: almacenId }, select: { id: true } }),
  ]);
  if (!insumo || !almacen) return null;

  return {
    stock: await stockEnAlmacen(prismaCliente, storeId, insumoId, almacenId),
    unidad: etiquetaUnidadMedida(insumo.unidadMedida),
  };
}

/**
 * Registra una entrada o una salida de un insumo en un almacén, fuera de las
 * compras y las ventas: algo que se echó a perder, una botella que se rompió, lo
 * que consume el personal, algo que se recibe sin compra. Sube o baja el stock
 * del insumo y queda en su historial con el motivo.
 *
 * Una salida no puede ser mayor a lo que hay en ese almacén: sacar de más
 * dejaría el stock en negativo por un error de carga (las ventas sí pueden
 * dejarlo negativo, porque nunca se bloquean; esto es una carga manual).
 */
export async function registrarMovimientoAlmacen(datos: DatosMovimientoAlmacen): Promise<ResultadoMovimientoAlmacen> {
  const sesion = await exigirPermiso("stock.editar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const tipo = datos.tipo === "entrada" ? "entrada" : datos.tipo === "salida" ? "salida" : null;
  if (!tipo) return { ok: false, error: "Elegí si es una entrada o una salida." };

  const cantidad = redondear3(Number(datos.cantidad));
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return { ok: false, error: "La cantidad tiene que ser mayor a cero." };
  }
  if (cantidad > 1_000_000_000) return { ok: false, error: "Esa cantidad es demasiado grande." };

  const concepto = conceptoDelMovimiento(tipo, datos.motivo, datos.detalle ?? "");
  if (!concepto) {
    return {
      ok: false,
      error:
        datos.motivo === "otro"
          ? "Escribí cuál es el motivo."
          : "Elegí el motivo del movimiento — queda en el historial del insumo.",
    };
  }

  // Insumo y almacén vienen del navegador: se verifican por el cliente del
  // local (uno de otro negocio simplemente no aparece).
  const [insumo, almacen] = await Promise.all([
    db.insumo.findUnique({ where: { id: datos.insumoId }, select: { id: true, nombre: true, unidadMedida: true } }),
    db.almacen.findUnique({ where: { id: datos.almacenId }, select: { id: true, nombre: true, activo: true } }),
  ]);
  if (!insumo) return { ok: false, error: "Ese insumo ya no existe." };
  if (!almacen) return { ok: false, error: "Ese almacén ya no existe." };
  if (!almacen.activo) return { ok: false, error: "Ese almacén está desactivado." };

  const unidad = etiquetaUnidadMedida(insumo.unidadMedida);

  if (tipo === "salida") {
    const hay = await stockEnAlmacen(prismaCliente, storeId, insumo.id, almacen.id);
    if (cantidad > hay + 0.0005) {
      return {
        ok: false,
        error: `En ${almacen.nombre} solo hay ${hay} ${unidad} de ${insumo.nombre}: no se pueden sacar ${cantidad}.`,
      };
    }
  }

  const cambio = tipo === "salida" ? -cantidad : cantidad;
  const registradoPor = sesion.nombre?.trim() || sesion.email;

  await db.$transaction(async (tx) => {
    await tx.insumo.update({
      where: { id: insumo.id },
      data: { stockActual: { increment: cambio } },
    });
    await tx.movimientoStock.create({
      data: {
        storeId,
        insumoId: insumo.id,
        almacenId: almacen.id,
        tipo: "movimiento",
        cantidad: cambio,
        motivo: concepto,
        registradoPor,
      },
    });
  });

  await registrarBitacora(storeId, sesion, {
    modulo: "stock",
    accion: tipo === "salida" ? "salida_almacen" : "entrada_almacen",
    descripcion: `${tipo === "salida" ? "Salida" : "Entrada"} de almacén: ${cantidad} ${unidad} de ${insumo.nombre} en ${almacen.nombre}. Motivo: ${concepto}.`,
    entidad: "Insumo",
    entidadId: insumo.id,
    detalle: { tipo, insumo: insumo.nombre, almacen: almacen.nombre, cantidad, unidad, motivo: concepto },
  });

  revalidatePath("/admin/stock/movimientos");
  revalidatePath("/admin/stock/insumos");
  revalidatePath("/admin/stock/inventario");
  revalidatePath("/admin/stock/almacenes");
  return { ok: true };
}
