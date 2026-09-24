"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { registrarBitacora } from "@/lib/bitacora";
import { redondear2, saldoDeCompra } from "@/lib/pagos-compra";
import { FORMAS_PAGO_POS, esVentaACredito } from "@/lib/turno-pos";
import { turnoAbierto } from "../turno-actual";

export type DatosCobro = {
  monto: number;
  /** yyyy-mm-dd, del <input type="date">: el día en que se cobró. */
  fecha: string;
  /** "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito" */
  formaPago: string;
  notas: string | null;
};

export type ResultadoCobro = { ok: true } | { ok: false; error: string };

function refrescar(ventaId: string) {
  revalidatePath("/admin/pos/cuentas-por-cobrar");
  revalidatePath("/admin/pos/cuentas");
  revalidatePath(`/admin/pos/venta/${ventaId}`);
  revalidatePath("/admin/pos");
}

/**
 * Anota un cobro de una venta hecha a crédito. El monto no puede pasar de lo
 * que falta cobrar de esa venta.
 *
 * Un cobro EN EFECTIVO es plata que entra al cajón: exige un turno abierto en
 * esta computadora y queda anotado además como ingreso de caja de ese turno
 * (así el corte cuadra). Transferencias y tarjetas no pasan por la caja.
 */
export async function registrarCobroVenta(ventaId: string, datos: DatosCobro): Promise<ResultadoCobro> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const monto = redondear2(datos.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "El monto del cobro tiene que ser mayor a cero." };
  }
  const fecha = datos.fecha ? new Date(datos.fecha) : null;
  if (!fecha || Number.isNaN(fecha.getTime())) return { ok: false, error: "Elegí la fecha del cobro." };
  if (!FORMAS_PAGO_POS.some((f) => f.valor === datos.formaPago)) {
    return { ok: false, error: "Elegí cómo pagó el cliente." };
  }

  const venta = await db.ventaPos.findUnique({
    where: { id: ventaId },
    select: {
      id: true,
      numero: true,
      total: true,
      formaPago: true,
      cancelada: true,
      clienteNombre: true,
      facturaRazonSocial: true,
      cobros: { select: { monto: true } },
    },
  });
  if (!venta) return { ok: false, error: "Esa venta no existe." };
  if (venta.cancelada) return { ok: false, error: "Esa venta está cancelada: no se le pueden registrar cobros." };
  if (!esVentaACredito(venta.formaPago)) {
    return { ok: false, error: "Esa venta no es a crédito: ya se cobró en el momento." };
  }

  const cobrado = venta.cobros.reduce((s, c) => s + Number(c.monto), 0);
  const saldo = saldoDeCompra(Number(venta.total), cobrado);
  if (saldo <= 0) return { ok: false, error: "Esa venta ya está cobrada por completo." };
  if (monto > saldo + 0.004) {
    return { ok: false, error: `El cobro supera lo que falta cobrar de esta venta (${formatearGuarani(saldo)}).` };
  }

  // Efectivo: tiene que entrar a una caja con turno abierto en ESTA computadora.
  let turnoId: string | null = null;
  if (datos.formaPago === "efectivo") {
    const estacion = await estacionActual(db);
    const turno = estacion ? await turnoAbierto(db, estacion.id) : null;
    if (!turno) {
      return {
        ok: false,
        error: "Para cobrar en efectivo hace falta un turno de caja abierto en esta computadora: la plata tiene que entrar a una caja.",
      };
    }
    turnoId = turno.id;
  }

  const registradoPor = sesion.nombre?.trim() || sesion.email;
  const cliente = (venta.facturaRazonSocial ?? venta.clienteNombre ?? "").trim() || "cliente";

  await db.$transaction(async (tx) => {
    const cobro = await tx.cobroVenta.create({
      data: {
        storeId,
        ventaPosId: ventaId,
        monto,
        fecha,
        formaPago: datos.formaPago,
        notas: datos.notas?.trim() || null,
        registradoPor,
      },
      select: { id: true },
    });
    if (turnoId) {
      await tx.movimientoCaja.create({
        data: {
          storeId,
          turnoPosId: turnoId,
          tipo: "ingreso",
          monto,
          concepto: `Cobro de la venta ${formatearNumero(venta.numero)} a crédito — ${cliente}`.slice(0, 200),
          registradoPor,
          cobroVentaId: cobro.id,
        },
      });
    }
  });

  await registrarBitacora(storeId, sesion, {
    modulo: "ventas",
    accion: "cobro_de_venta_a_credito",
    descripcion: `Registró un cobro de ${formatearGuarani(monto)} (${datos.formaPago.replace("_", " ")}) de la venta ${formatearNumero(
      venta.numero
    )} a crédito — ${cliente}.`,
    entidad: "VentaPos",
    entidadId: ventaId,
    detalle: { venta: formatearNumero(venta.numero), monto, forma_de_pago: datos.formaPago, cliente },
  });

  refrescar(ventaId);
  return { ok: true };
}

/**
 * Elimina un cobro cargado por error: la venta vuelve a deber ese monto. Si fue
 * en efectivo, también se saca el ingreso de caja que generó — y solo se puede
 * mientras ese turno sigue abierto: después quedó firmado en el cierre.
 * El dueño puede eliminar cualquiera (que no esté en un turno cerrado); el
 * cajero, solo los cobros en efectivo de un turno todavía abierto.
 */
export async function eliminarCobroVenta(cobroId: string): Promise<ResultadoCobro> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cobro = await db.cobroVenta.findUnique({
    where: { id: cobroId },
    select: {
      id: true,
      monto: true,
      formaPago: true,
      ventaPos: { select: { numero: true } },
      ventaPosId: true,
      movimientoCaja: { select: { turnoPos: { select: { estado: true } } } },
    },
  });
  if (!cobro) return { ok: false, error: "Ese cobro ya no existe." };

  const turnoAbiertoDelCobro = cobro.movimientoCaja?.turnoPos.estado === "abierto";
  if (cobro.movimientoCaja && !turnoAbiertoDelCobro) {
    return {
      ok: false,
      error: "Ese cobro fue en efectivo y el turno ya está cerrado: quedó firmado en el cierre de caja, no se puede eliminar.",
    };
  }
  if (!turnoAbiertoDelCobro && !puede(sesion.rol, "pos.verHistorico")) {
    return { ok: false, error: "Solo el dueño puede eliminar este cobro." };
  }

  // El ingreso de caja que generó se va con él (borrado en cascada).
  await db.cobroVenta.delete({ where: { id: cobroId } });

  await registrarBitacora(storeId, sesion, {
    modulo: "ventas",
    accion: "cobro_eliminado",
    descripcion: `Eliminó un cobro de ${formatearGuarani(Number(cobro.monto))} (${cobro.formaPago.replace("_", " ")}) de la venta ${formatearNumero(
      cobro.ventaPos.numero
    )} a crédito.`,
    entidad: "VentaPos",
    entidadId: cobro.ventaPosId,
    detalle: { venta: formatearNumero(cobro.ventaPos.numero), monto: Number(cobro.monto), forma_de_pago: cobro.formaPago },
  });

  refrescar(cobro.ventaPosId);
  return { ok: true };
}
