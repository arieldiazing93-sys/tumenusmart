"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { formatearGuarani } from "@/lib/format";
import { registrarBitacora } from "@/lib/bitacora";
import { FORMAS_PAGO_PROVEEDOR, redondear2, saldoDeCompra } from "@/lib/pagos-compra";

export type DatosPago = {
  monto: number;
  /** yyyy-mm-dd, del <input type="date">: el día en que se pagó. */
  fecha: string;
  formaPago: string;
  notas: string | null;
};

export type ResultadoPago = { ok: true } | { ok: false; error: string };

function refrescar(compraId: string) {
  revalidatePath("/admin/stock/cuentas-por-pagar");
  revalidatePath("/admin/stock/compras");
  revalidatePath(`/admin/stock/compras/${compraId}`);
}

/**
 * Anota un pago al proveedor por una compra a crédito. El monto no puede pasar
 * de lo que falta pagar de esa compra: si se quiere corregir un pago cargado
 * de más, se elimina y se vuelve a cargar.
 */
export async function registrarPagoCompra(compraId: string, datos: DatosPago): Promise<ResultadoPago> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const monto = redondear2(datos.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "El monto del pago tiene que ser mayor a cero." };
  }
  const fecha = datos.fecha ? new Date(datos.fecha) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) {
    return { ok: false, error: "Elegí la fecha del pago." };
  }
  if (!FORMAS_PAGO_PROVEEDOR.some((f) => f.valor === datos.formaPago)) {
    return { ok: false, error: "Elegí cómo se pagó." };
  }

  const compra = await prisma.compra.findUnique({
    where: { id: compraId },
    select: { id: true, total: true, condicionPago: true, cancelada: true, pagos: { select: { monto: true } } },
  });
  if (!compra) return { ok: false, error: "Esa compra no existe." };
  if (compra.cancelada) return { ok: false, error: "Esa compra está cancelada: no se le pueden registrar pagos." };
  if (compra.condicionPago !== "credito") {
    return { ok: false, error: "Esa compra no es a crédito: no tiene nada por pagar." };
  }

  const pagado = compra.pagos.reduce((s, p) => s + Number(p.monto), 0);
  const saldo = saldoDeCompra(Number(compra.total), pagado);
  if (saldo <= 0) return { ok: false, error: "Esa compra ya está pagada por completo." };
  if (monto > saldo + 0.004) {
    return { ok: false, error: `El pago supera lo que falta pagar de esta compra (${formatearGuarani(saldo)}).` };
  }

  const pago = await prisma.pagoCompra.create({
    data: {
      storeId: idLocal,
      compraId,
      monto,
      fecha,
      formaPago: datos.formaPago,
      notas: datos.notas?.trim() || null,
      registradoPor: sesion.nombre?.trim() || sesion.email,
    },
    select: { id: true },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "compras",
    accion: "pago_a_proveedor",
    descripcion: `Registró un pago de ${formatearGuarani(monto)} (${datos.formaPago}) a un proveedor por una compra a crédito. Queda por pagar ${formatearGuarani(
      Math.max(0, saldo - monto)
    )}.`,
    entidad: "PagoCompra",
    entidadId: pago.id,
    detalle: { compra: compraId, monto, forma_de_pago: datos.formaPago, saldo_anterior: saldo },
  });

  refrescar(compraId);
  return { ok: true };
}

/** Elimina un pago cargado por error: la compra vuelve a deber ese monto. */
export async function eliminarPagoCompra(pagoId: string): Promise<ResultadoPago> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const pago = await prisma.pagoCompra.findUnique({
    where: { id: pagoId },
    select: { id: true, compraId: true, monto: true, formaPago: true },
  });
  if (!pago) return { ok: false, error: "Ese pago ya no existe." };

  await prisma.pagoCompra.delete({ where: { id: pagoId } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "compras",
    accion: "pago_a_proveedor_eliminado",
    descripcion: `Eliminó un pago de ${formatearGuarani(Number(pago.monto))} (${pago.formaPago}) a un proveedor: la compra vuelve a deber ese monto.`,
    entidad: "PagoCompra",
    entidadId: pagoId,
    detalle: { compra: pago.compraId, monto: Number(pago.monto), forma_de_pago: pago.formaPago },
  });

  refrescar(pago.compraId);
  return { ok: true };
}
