import { prismaDelLocal, type PrismaLocal } from "./prisma-local";
import type { RangoFecha } from "./estadisticas";
import { formatearCantidad } from "./format";
import { formatoPorcentaje } from "./promociones";
import type { Canal } from "./reporte-promociones";
import type { FilaRegistro, TipoRegistro } from "./reporte-cancelaciones";

/**
 * Lee de la base los registros del reporte de cancelaciones y descuentos (ver reporte-cancelaciones.ts) del tipo pedido, en el período.
 * Todo va por el cliente del local: nunca se mezcla con otro negocio.
 *
 *  - CUENTAS CANCELADAS: las cuentas del comedor y del delivery cerradas como "anulada" (cancelarCuenta: solo se puede con todos los
 *    productos ya cancelados, así que lo cancelado es lo que se había cargado) y las ventas ya cobradas que después se anularon. Quien
 *    autorizó es quien cerró la cuenta o anuló la venta.
 *  - PRODUCTOS CANCELADOS: los productos de las cuentas del comedor y del delivery que se anularon, por el día en que se anularon.
 *  - DESCUENTOS: las ventas cobradas (no anuladas) con descuento general. Quien lo autorizó es quien lo puso en la cuenta (comedor y
 *    delivery); en el mostrador, el cajero que hizo la venta.
 */

const gs = (n: number) => Math.round(n);

function nombreDe(m: { nombre: string; apellido: string | null }): string {
  return [m.nombre, m.apellido].filter(Boolean).join(" ");
}

function textoOpcional(t: string | null | undefined): string | null {
  const limpio = t?.trim();
  return limpio ? limpio : null;
}

export async function cargarRegistros(storeId: string, rango: RangoFecha, tipo: TipoRegistro): Promise<FilaRegistro[]> {
  const db = prismaDelLocal(storeId);
  if (tipo === "productos") return productosCancelados(db, rango);
  if (tipo === "descuentos") return descuentos(db, rango);
  return cuentasCanceladas(db, rango);
}

async function cuentasCanceladas(db: PrismaLocal, rango: RangoFecha): Promise<FilaRegistro[]> {
  const periodo = { gte: rango.gte, lt: rango.lt };
  const [mesas, repartos, ventas] = await Promise.all([
    db.cuentaMesa.findMany({
      where: { estado: "anulada", cerradaEn: periodo },
      select: { id: true, numero: true, mesa: true, cerradaEn: true, cerradaPor: true, motivoCierre: true, items: { select: { cantidad: true, precioUnitario: true } } },
    }),
    db.cuentaDelivery.findMany({
      where: { estado: "anulada", cerradaEn: periodo },
      select: { id: true, numero: true, cerradaEn: true, cerradaPor: true, motivoCierre: true, items: { select: { cantidad: true, precioUnitario: true } } },
    }),
    db.ventaPos.findMany({
      where: { cancelada: true, canceladaEn: periodo },
      select: { id: true, numero: true, total: true, tipoEntrega: true, canceladaEn: true, canceladaPor: true, motivoCancelacion: true },
    }),
  ]);

  // De las ventas anuladas, las que cobraron una cuenta de mesa son del comedor.
  const idsDeVentas = ventas.map((v) => v.id);
  const cuentasDeVentas = idsDeVentas.length
    ? await db.cuentaMesa.findMany({ where: { ventaPosId: { in: idsDeVentas } }, select: { ventaPosId: true, mesa: true } })
    : [];
  const mesaDeVenta = new Map(cuentasDeVentas.map((c) => [c.ventaPosId, c.mesa]));

  const montoDe = (items: { cantidad: number; precioUnitario: unknown }[]) =>
    gs(items.reduce((s, i) => s + gs(i.cantidad * Number(i.precioUnitario)), 0));

  const filas: FilaRegistro[] = [];
  for (const c of mesas) {
    if (!c.cerradaEn) continue;
    filas.push({
      id: `cm-${c.id}`, fecha: c.cerradaEn, canal: "comedor", referencia: `Mesa ${c.mesa} · cuenta ${c.numero}`, detalle: "Sin cobrar",
      cantidad: null, monto: montoDe(c.items), cobrado: null, motivo: textoOpcional(c.motivoCierre), autorizo: textoOpcional(c.cerradaPor), cargo: null,
    });
  }
  for (const c of repartos) {
    if (!c.cerradaEn) continue;
    filas.push({
      id: `cd-${c.id}`, fecha: c.cerradaEn, canal: "delivery", referencia: `Delivery · cuenta ${c.numero}`, detalle: "Sin cobrar",
      cantidad: null, monto: montoDe(c.items), cobrado: null, motivo: textoOpcional(c.motivoCierre), autorizo: textoOpcional(c.cerradaPor), cargo: null,
    });
  }
  for (const v of ventas) {
    if (!v.canceladaEn) continue;
    const mesa = mesaDeVenta.get(v.id);
    const canal: Canal = v.tipoEntrega === "delivery" ? "delivery" : mesa !== undefined ? "comedor" : "mostrador";
    filas.push({
      id: `vp-${v.id}`, fecha: v.canceladaEn, canal, referencia: mesa !== undefined ? `Venta ${v.numero} · Mesa ${mesa}` : `Venta ${v.numero}`,
      detalle: "Cobrada y anulada", cantidad: null, monto: gs(Number(v.total)), cobrado: null, motivo: textoOpcional(v.motivoCancelacion),
      autorizo: textoOpcional(v.canceladaPor), cargo: null,
    });
  }
  return filas;
}

async function productosCancelados(db: PrismaLocal, rango: RangoFecha): Promise<FilaRegistro[]> {
  const periodo = { gte: rango.gte, lt: rango.lt };
  const [deMesa, deDelivery] = await Promise.all([
    db.itemCuentaMesa.findMany({
      where: { estado: "anulado", anuladoEn: periodo },
      select: {
        id: true, cantidad: true, precioUnitario: true, nombreProducto: true, opcionesTexto: true, anuladoPor: true, anuladoEn: true,
        motivoAnulacion: true, cargadoPor: true, mozo: { select: { nombre: true, apellido: true } }, cuenta: { select: { numero: true, mesa: true } },
      },
    }),
    db.itemCuentaDelivery.findMany({
      where: { estado: "anulado", anuladoEn: periodo },
      select: {
        id: true, cantidad: true, precioUnitario: true, nombreProducto: true, opcionesTexto: true, anuladoPor: true, anuladoEn: true,
        motivoAnulacion: true, cargadoPor: true, cuenta: { select: { numero: true } },
      },
    }),
  ]);

  const detalleDe = (i: { cantidad: number; nombreProducto: string; opcionesTexto: string | null }) =>
    `${formatearCantidad(i.cantidad)} × ${i.nombreProducto}${textoOpcional(i.opcionesTexto) ? ` (${i.opcionesTexto!.trim()})` : ""}`;

  const filas: FilaRegistro[] = [];
  for (const i of deMesa) {
    if (!i.anuladoEn) continue;
    filas.push({
      id: `im-${i.id}`, fecha: i.anuladoEn, canal: "comedor", referencia: `Mesa ${i.cuenta.mesa} · cuenta ${i.cuenta.numero}`, detalle: detalleDe(i),
      cantidad: i.cantidad, monto: gs(i.cantidad * Number(i.precioUnitario)), cobrado: null, motivo: textoOpcional(i.motivoAnulacion),
      autorizo: textoOpcional(i.anuladoPor), cargo: textoOpcional(i.cargadoPor) ?? nombreDe(i.mozo),
    });
  }
  for (const i of deDelivery) {
    if (!i.anuladoEn) continue;
    filas.push({
      id: `id-${i.id}`, fecha: i.anuladoEn, canal: "delivery", referencia: `Delivery · cuenta ${i.cuenta.numero}`, detalle: detalleDe(i),
      cantidad: i.cantidad, monto: gs(i.cantidad * Number(i.precioUnitario)), cobrado: null, motivo: textoOpcional(i.motivoAnulacion),
      autorizo: textoOpcional(i.anuladoPor), cargo: textoOpcional(i.cargadoPor),
    });
  }
  return filas;
}

async function descuentos(db: PrismaLocal, rango: RangoFecha): Promise<FilaRegistro[]> {
  const ventas = await db.ventaPos.findMany({
    where: { creadoEn: { gte: rango.gte, lt: rango.lt }, cancelada: false, descuento: { gt: 0 } },
    select: { id: true, numero: true, total: true, descuento: true, descuentoPorcentaje: true, registradoPor: true, tipoEntrega: true, creadoEn: true },
  });
  const ids = ventas.map((v) => v.id);
  // El motivo y quién puso el descuento están en la cuenta del comedor o del delivery de donde salió la venta (en el mostrador no hay cuenta).
  const deMesa = ids.length
    ? await db.cuentaMesa.findMany({ where: { ventaPosId: { in: ids } }, select: { ventaPosId: true, mesa: true, descuentoPor: true, descuentoMotivo: true } })
    : [];
  const deDelivery = ids.length
    ? await db.cuentaDelivery.findMany({ where: { ventaPosId: { in: ids } }, select: { ventaPosId: true, descuentoPor: true, descuentoMotivo: true } })
    : [];
  const mesaPorVenta = new Map(deMesa.map((c) => [c.ventaPosId, c]));
  const repartoPorVenta = new Map(deDelivery.map((c) => [c.ventaPosId, c]));

  return ventas.map((v): FilaRegistro => {
    const mesa = mesaPorVenta.get(v.id);
    const reparto = repartoPorVenta.get(v.id);
    const canal: Canal = reparto || v.tipoEntrega === "delivery" ? "delivery" : mesa ? "comedor" : "mostrador";
    const cuenta = mesa ?? reparto;
    return {
      id: `dv-${v.id}`,
      fecha: v.creadoEn,
      canal,
      referencia: mesa ? `Venta ${v.numero} · Mesa ${mesa.mesa}` : `Venta ${v.numero}`,
      detalle: v.descuentoPorcentaje !== null ? `${formatoPorcentaje(Number(v.descuentoPorcentaje))} %` : "Monto fijo",
      cantidad: null,
      monto: gs(Number(v.descuento)),
      cobrado: gs(Number(v.total)),
      motivo: textoOpcional(cuenta?.descuentoMotivo),
      // Quien puso el descuento en la cuenta; en el mostrador, el cajero que hizo la venta.
      autorizo: textoOpcional(cuenta?.descuentoPor) ?? textoOpcional(v.registradoPor),
      cargo: null,
    };
  });
}
