"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, siguienteNumeroVentaPos } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { normalizarFormaPagoPos, resumirTurno, type DeclaradoPorForma } from "@/lib/turno-pos";
import { turnoAbierto } from "./turno-actual";

export type ResultadoAbrirTurno =
  | { ok: true; turnoId: string; yaAbierto: boolean }
  | { ok: false; error: string };

/**
 * Abre un turno nuevo, o devuelve el que ya está abierto.
 *
 * Un solo turno puede estar abierto por local a la vez. Si dos cajeros
 * aprietan "Abrir turno" en el mismo instante, el índice único parcial de la
 * base rechaza al segundo create — se atrapa y se engancha al turno que ganó
 * en vez de fallarle en la cara.
 */
export async function abrirTurno(montoInicial: number): Promise<ResultadoAbrirTurno> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const existente = await turnoAbierto(db);
  if (existente) {
    return { ok: true, turnoId: existente.id, yaAbierto: true };
  }

  const monto = Number.isFinite(montoInicial) && montoInicial >= 0 ? montoInicial : 0;

  try {
    const turno = await db.turnoPos.create({
      data: {
        storeId,
        montoInicial: monto,
        abiertoPor: sesion.nombre?.trim() || sesion.email,
      },
      select: { id: true },
    });
    revalidatePath("/admin/pos");
    return { ok: true, turnoId: turno.id, yaAbierto: false };
  } catch {
    const turnoGanador = await turnoAbierto(db);
    if (turnoGanador) return { ok: true, turnoId: turnoGanador.id, yaAbierto: true };
    return { ok: false, error: "No se pudo abrir el turno. Probá de nuevo." };
  }
}

export type ResultadoVenta =
  | { ok: true; ventaId: string; total: number }
  | { ok: false; error: string };

export type DatosVenta = {
  formaPago: string;
  /** "local" (se consume ahí) | "llevar" (para llevar). Cualquier otro valor cae en "local". */
  tipoEntrega: string;
  /** Opcionales: se guardan tal cual se tipean, sin normalizar — igual que
   *  Order.clienteTelefono — para que sumen al mismo cliente si después pide
   *  algo por el menú online. */
  clienteNombre: string;
  clienteTelefono: string;
  nota: string;
  items: { productId: string; cantidad: number }[];
};

/**
 * Cobra el carrito y cierra la cuenta.
 *
 * El precio se relee de la base, nunca se confía en el que mande el
 * navegador — mismo criterio que crearPedido en el checkout público. Si se
 * cargó el teléfono del cliente, además se le da de alta (o se actualiza)
 * su ficha de `Customer` — mismo upsert que hace el checkout — para que la
 * venta cuente para su progreso de fidelización.
 */
export async function registrarVenta(turnoId: string, datos: DatosVenta): Promise<ResultadoVenta> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const turno = await db.turnoPos.findUnique({
    where: { id: turnoId },
    select: { id: true, estado: true },
  });
  if (!turno) return { ok: false, error: "Ese turno no existe." };
  if (turno.estado !== "abierto") {
    return { ok: false, error: "Ese turno ya está cerrado. Abrí uno nuevo para seguir vendiendo." };
  }

  const cantidadesPorProducto = new Map<string, number>();
  for (const it of datos.items) {
    if (!it.productId || !Number.isFinite(it.cantidad) || it.cantidad <= 0) continue;
    const cantidad = Math.round(it.cantidad);
    cantidadesPorProducto.set(it.productId, (cantidadesPorProducto.get(it.productId) ?? 0) + cantidad);
  }
  if (cantidadesPorProducto.size === 0) {
    return { ok: false, error: "El carrito está vacío." };
  }

  const productos = await db.product.findMany({
    where: { id: { in: [...cantidadesPorProducto.keys()] }, disponible: true },
    select: { id: true, nombre: true, precio: true },
  });
  if (productos.length !== cantidadesPorProducto.size) {
    return {
      ok: false,
      error: "Alguno de los productos ya no está disponible. Actualizá la pantalla e intentá de nuevo.",
    };
  }

  const filas = productos.map((p) => ({
    productId: p.id,
    nombreProducto: p.nombre,
    cantidad: cantidadesPorProducto.get(p.id)!,
    precioUnitario: Number(p.precio),
  }));
  const total = filas.reduce((s, f) => s + f.precioUnitario * f.cantidad, 0);
  if (total <= 0) return { ok: false, error: "El total tiene que ser mayor a cero." };

  const numero = await siguienteNumeroVentaPos(storeId);
  const registradoPor = sesion.nombre?.trim() || sesion.email;
  const formaPagoNormalizada = normalizarFormaPagoPos(datos.formaPago);
  const tipoEntrega = datos.tipoEntrega === "llevar" ? "llevar" : "local";
  const clienteNombre = datos.clienteNombre.trim() || null;
  const clienteTelefono = datos.clienteTelefono.trim() || null;
  const nota = datos.nota.trim() || null;

  if (clienteTelefono) {
    await prisma.customer.upsert({
      where: { storeId_telefono: { storeId, telefono: clienteTelefono } },
      update: clienteNombre ? { nombre: clienteNombre } : {},
      create: { storeId, nombre: clienteNombre || "Cliente de mostrador", telefono: clienteTelefono },
    });
  }

  const ventaId = await prisma.$transaction(async (tx) => {
    const venta = await tx.ventaPos.create({
      data: {
        storeId,
        turnoPosId: turnoId,
        numero,
        formaPago: formaPagoNormalizada,
        total,
        registradoPor,
        clienteNombre,
        clienteTelefono,
        tipoEntrega,
        nota,
        items: {
          create: filas.map((f) => ({
            storeId,
            productId: f.productId,
            nombreProducto: f.nombreProducto,
            cantidad: f.cantidad,
            precioUnitario: f.precioUnitario,
          })),
        },
      },
      select: { id: true },
    });
    return venta.id;
  });

  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/cuentas");
  return { ok: true, ventaId, total };
}

export type ResultadoCierreTurno = { ok: true; turnoId: string } | { ok: false; error: string };

/**
 * Cierra el turno, congelando lo calculado y lo declarado.
 *
 * Mismo antirracing que cerrarRendicion: si lo que hay cargado ahora no
 * coincide con lo que el cajero tenía en pantalla (entró una venta mientras
 * miraba el cierre), no cierra nada y pide refrescar.
 */
export async function cerrarTurno(
  turnoId: string,
  declarado: { efectivo: number; transferencia: number; tarjetaDebito: number; tarjetaCredito: number },
  notas: string,
  cantidadVista: number,
  totalVisto: number
): Promise<ResultadoCierreTurno> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const turno = await db.turnoPos.findUnique({
    where: { id: turnoId },
    select: { id: true, estado: true },
  });
  if (!turno) return { ok: false, error: "Ese turno no existe." };
  if (turno.estado !== "abierto") return { ok: false, error: "Ese turno ya está cerrado." };

  const ventas = await db.ventaPos.findMany({
    where: { turnoPosId: turnoId, cancelada: false },
    select: { total: true, formaPago: true },
  });
  const resumen = resumirTurno(ventas);

  if (resumen.cantidad !== cantidadVista || Math.round(resumen.totalGeneral) !== Math.round(totalVisto)) {
    return {
      ok: false,
      error:
        "Los números cambiaron mientras mirabas la pantalla (entró otra venta). " +
        "Refrescá y fijate el total nuevo antes de cerrar.",
    };
  }

  const declaradoPorForma: DeclaradoPorForma = {
    efectivo: declarado.efectivo,
    transferencia: declarado.transferencia,
    tarjeta_debito: declarado.tarjetaDebito,
    tarjeta_credito: declarado.tarjetaCredito,
  };

  await db.turnoPos.update({
    where: { id: turnoId },
    data: {
      estado: "cerrado",
      cantidadVentas: resumen.cantidad,
      calculadoEfectivo: resumen.porForma.efectivo,
      calculadoTransferencia: resumen.porForma.transferencia,
      calculadoTarjetaDebito: resumen.porForma.tarjeta_debito,
      calculadoTarjetaCredito: resumen.porForma.tarjeta_credito,
      declaradoEfectivo: declaradoPorForma.efectivo,
      declaradoTransferencia: declaradoPorForma.transferencia,
      declaradoTarjetaDebito: declaradoPorForma.tarjeta_debito,
      declaradoTarjetaCredito: declaradoPorForma.tarjeta_credito,
      notas: notas.trim() || null,
      cerradoPor: sesion.nombre?.trim() || sesion.email,
      cerradoEn: new Date(),
    },
  });

  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/turnos");
  return { ok: true, turnoId };
}

export type ResultadoCancelarVenta = { ok: true } | { ok: false; error: string };

/**
 * Anula una cuenta ya cobrada.
 *
 * No borra nada ni recalcula el turno: si esa venta ya formaba parte de un
 * turno cerrado, el comprobante de ese cierre sigue mostrando los montos que
 * se congelaron al cerrar (mismo criterio que Rendicion) — el aviso de
 * "esto se modificó después" que ya tiene ese comprobante es lo que refleja
 * la cancelación, no un recálculo silencioso de números ya firmados.
 */
export async function cancelarVenta(ventaId: string, motivo: string): Promise<ResultadoCancelarVenta> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const venta = await db.ventaPos.findUnique({
    where: { id: ventaId },
    select: { id: true, cancelada: true },
  });
  if (!venta) return { ok: false, error: "Esa cuenta no existe." };
  if (venta.cancelada) return { ok: false, error: "Esa cuenta ya estaba cancelada." };

  await db.ventaPos.update({
    where: { id: ventaId },
    data: {
      cancelada: true,
      canceladaPor: sesion.nombre?.trim() || sesion.email,
      canceladaEn: new Date(),
      motivoCancelacion: motivo.trim() || null,
    },
  });

  revalidatePath("/admin/pos/cuentas");
  revalidatePath(`/admin/pos/venta/${ventaId}`);
  return { ok: true };
}
