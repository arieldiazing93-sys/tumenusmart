"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { cancelarVenta } from "../pos/actions";
import { cambiarEstadoPedido } from "../pedidos/actions";

export type ResultadoCancelarFactura = { ok: true } | { ok: false; error: string };

/**
 * Anula una factura — con la cuenta que la sostiene, o sin ella.
 *
 * Con tambienCuenta=true, se reusan cancelarVenta/cambiarEstadoPedido tal
 * cual: esas dos acciones YA anulan la factura de yapa cuando cancelan algo
 * que tenía número (ver ahí) — no hay que repetir esa lógica acá.
 *
 * Con tambienCuenta=false, esta es la única acción que toca algo: la cuenta
 * sigue viva (mismo total, mismos ítems, mismo estado), solo el número de
 * factura queda consumido. Es el caso de una factura mal cargada —RUC
 * equivocado, razón social mal escrita— que hay que anular sin perder la
 * venta en sí.
 */
export async function cancelarFactura(
  origen: "pedido" | "venta",
  id: string,
  motivo: string,
  tambienCuenta: boolean
): Promise<ResultadoCancelarFactura> {
  // Mismo permiso que la pantalla de Facturas — es información y una acción
  // del dueño, no del día a día de un cajero.
  const sesion = await exigirPermiso("pos.verHistorico");

  if (!motivo.trim()) {
    return { ok: false, error: "Decí por qué se anula — queda en el historial." };
  }

  if (tambienCuenta) {
    const resultado =
      origen === "venta"
        ? await cancelarVenta(id, motivo)
        : await cambiarEstadoPedido(id, "cancelado", undefined, motivo);
    if (!resultado.ok) return resultado;
    revalidatePath("/admin/facturas");
    return { ok: true };
  }

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const identidad = sesion.nombre?.trim() || sesion.email;
  const datosAnulacion = {
    facturaAnulada: true,
    facturaAnuladaPor: identidad,
    facturaAnuladaEn: new Date(),
    facturaMotivoAnulacion: motivo.trim(),
  };

  if (origen === "venta") {
    const venta = await db.ventaPos.findUnique({
      where: { id },
      select: { facturaNumero: true, facturaAnulada: true, cancelada: true },
    });
    if (!venta || !venta.facturaNumero) return { ok: false, error: "Esa venta no tiene factura." };
    if (venta.cancelada) {
      return { ok: false, error: "Esa cuenta ya está cancelada — la factura ya quedó anulada con ella." };
    }
    if (venta.facturaAnulada) return { ok: false, error: "Esa factura ya estaba anulada." };
    await db.ventaPos.update({ where: { id }, data: datosAnulacion });
    revalidatePath(`/admin/pos/venta/${id}`);
  } else {
    const pedido = await db.order.findUnique({
      where: { id },
      select: { facturaNumero: true, facturaAnulada: true, estado: true },
    });
    if (!pedido || !pedido.facturaNumero) return { ok: false, error: "Ese pedido no tiene factura." };
    if (pedido.estado === "cancelado") {
      return { ok: false, error: "Ese pedido ya está cancelado — la factura ya quedó anulada con él." };
    }
    if (pedido.facturaAnulada) return { ok: false, error: "Esa factura ya estaba anulada." };
    await db.order.update({ where: { id }, data: datosAnulacion });
    revalidatePath(`/admin/pedidos/${id}`);
  }

  revalidatePath("/admin/facturas");
  return { ok: true };
}
