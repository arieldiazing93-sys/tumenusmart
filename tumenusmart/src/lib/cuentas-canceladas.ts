/**
 * Servicio comedor y Servicio delivery — lo que valía una cuenta que se canceló sin cobrarse.
 *
 * Al cancelar una cuenta, todos sus productos pasan a "anulado" (con quién, cuándo y por qué) y la cuenta a "anulada". Lo que
 * valía la cuenta al cancelarse son entonces los productos que seguían activos justo antes: los que se anularon JUNTO con la
 * cuenta (un instante antes de que se cerrara) y no los que se habían cancelado a mano mucho antes. No hay un campo con ese
 * total; se reconstruye con esta regla, que es solo para mostrarlo (nunca para cobrar ni para stock).
 */

import { descuentoDeCuenta, totalDeLineas, totalesDeCuenta } from "./comedor";
import { totalesDeDelivery } from "./delivery";
import { formatearNumero } from "./format";
import type { PrismaLocal } from "./prisma-local";

/** Lo máximo que puede separar a un producto anulado "junto con la cuenta" del momento en que la cuenta se cerró (misma transacción). */
const MARGEN_MS = 15_000;

type ItemConAnulacion = { estado: string; anuladoEn: Date | null };

/** Los productos que tenía la cuenta cuando se canceló. */
export function itemsAlCancelar<T extends ItemConAnulacion>(items: T[], cerradaEn: Date | null): T[] {
  return items.filter(
    (i) =>
      i.estado === "activo" ||
      (i.anuladoEn !== null && cerradaEn !== null && cerradaEn.getTime() - i.anuladoEn.getTime() <= MARGEN_MS)
  );
}

/**
 * Todo lo que se llegó a cargar en la cuenta, esté cancelado o no. Es el número que importa cuando alguien cancela los
 * productos de a uno y después cierra la cuenta vacía: al cancelarse "valía" cero, pero se habían cargado esos guaraníes.
 */
export function totalCargado(items: { cantidad: number; precioUnitario: unknown }[]): number {
  return totalDeLineas(items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })));
}

/** Lo que valía la cuenta cuando se canceló, con su descuento si lo tenía (lo que se habría cobrado). */
export function totalAlCancelar(cuenta: {
  cerradaEn: Date | null;
  descuentoTipo: string | null;
  descuentoValor: unknown;
  items: (ItemConAnulacion & { cantidad: number; precioUnitario: unknown })[];
}): number {
  const lineas = itemsAlCancelar(cuenta.items, cuenta.cerradaEn).map((i) => ({
    precioUnitario: Number(i.precioUnitario),
    cantidad: i.cantidad,
  }));
  return totalesDeCuenta(lineas, descuentoDeCuenta(cuenta)).total;
}

/** Una cuenta (de mesa o de delivery) que se cerró SIN cobrarse (no es una venta, pero tiene que quedar a la vista). */
export type CuentaCancelada = {
  id: string;
  /** "mesa" (Servicio comedor) | "delivery" (Servicio delivery). */
  canal: "mesa" | "delivery";
  numero: number;
  /** Cómo se llama en las listas: "Mesa 5" o "Delivery · Ana". */
  titulo: string;
  /** Qué clase de cuenta es, con su número: "Cuenta de mesa #0004" o "Cuenta de delivery #0012". */
  etiqueta: string;
  cerradaEn: Date | null;
  cerradaPor: string | null;
  motivoCierre: string | null;
  /** A quién se le atribuye: el mozo a cargo de la mesa, o el cliente del delivery. */
  responsable: string;
  /** Lo que es `responsable`: "mozo" o "cliente". */
  rolResponsable: "mozo" | "cliente";
  /** Dónde se ve el detalle de la cuenta. */
  href: string;
  total: number;
  /** true si los productos se cancelaron de a uno antes de cerrar la cuenta (no valía nada al cerrarse, pero se había cargado). */
  unoPorUno: boolean;
};

/**
 * Las cuentas de mesa cerradas sin cobrar dentro de un período, de la más reciente a la más vieja. `db` es el cliente de un local
 * (`prismaDelLocal`): solo ve las de ese local.
 *
 * `ventaPosId: null`: las que SÍ se cobraron y después se canceló la venta ya figuran como esa venta (Cancelada); acá solo
 * las que se cerraron sin llegar a cobrarse.
 */
async function cargarCuentasMesaCanceladas(db: PrismaLocal, rango: { gte: Date; lt: Date }): Promise<CuentaCancelada[]> {
  const cuentas = await db.cuentaMesa.findMany({
    where: { estado: "anulada", ventaPosId: null, cerradaEn: { gte: rango.gte, lt: rango.lt } },
    orderBy: { cerradaEn: "desc" },
    select: {
      id: true,
      numero: true,
      mesa: true,
      cerradaEn: true,
      cerradaPor: true,
      motivoCierre: true,
      descuentoTipo: true,
      descuentoValor: true,
      mozo: { select: { nombre: true, apellido: true } },
      items: { select: { cantidad: true, precioUnitario: true, estado: true, anuladoEn: true } },
    },
  });
  return cuentas.map((c) => {
    const valia = totalAlCancelar(c);
    return {
      id: c.id,
      canal: "mesa" as const,
      numero: c.numero,
      titulo: `Mesa ${c.mesa}`,
      etiqueta: `Cuenta de mesa ${formatearNumero(c.numero)}`,
      cerradaEn: c.cerradaEn,
      cerradaPor: c.cerradaPor,
      motivoCierre: c.motivoCierre,
      responsable: [c.mozo.nombre, c.mozo.apellido].filter(Boolean).join(" "),
      rolResponsable: "mozo" as const,
      href: `/admin/pos/cuentas/mesa/${c.id}`,
      // Si al cancelarse ya no valía nada es porque se cancelaron los productos de a uno: se muestra lo que se había cargado.
      total: valia > 0 ? valia : totalCargado(c.items),
      unoPorUno: valia <= 0,
    };
  });
}

/**
 * Lo mismo para las cuentas de DELIVERY cerradas sin cobrar: lo que valía al cancelarse incluye el envío (que no se descuenta).
 */
async function cargarCuentasDeliveryCanceladas(db: PrismaLocal, rango: { gte: Date; lt: Date }): Promise<CuentaCancelada[]> {
  const cuentas = await db.cuentaDelivery.findMany({
    where: { estado: "anulada", ventaPosId: null, cerradaEn: { gte: rango.gte, lt: rango.lt } },
    orderBy: { cerradaEn: "desc" },
    select: {
      id: true,
      numero: true,
      clienteNombre: true,
      costoEnvio: true,
      cerradaEn: true,
      cerradaPor: true,
      motivoCierre: true,
      descuentoTipo: true,
      descuentoValor: true,
      items: { select: { cantidad: true, precioUnitario: true, estado: true, anuladoEn: true } },
    },
  });
  return cuentas.map((c) => {
    const productos = itemsAlCancelar(c.items, c.cerradaEn).map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }));
    const valia = totalesDeDelivery(productos, Number(c.costoEnvio), descuentoDeCuenta(c)).total;
    // Una cuenta sin ningún producto vigente no valía nada: se muestra lo que se había cargado (productos y envío).
    const sinProductos = productos.length === 0;
    return {
      id: c.id,
      canal: "delivery" as const,
      numero: c.numero,
      titulo: `Delivery · ${c.clienteNombre}`,
      etiqueta: `Cuenta de delivery ${formatearNumero(c.numero)}`,
      cerradaEn: c.cerradaEn,
      cerradaPor: c.cerradaPor,
      motivoCierre: c.motivoCierre,
      responsable: c.clienteNombre,
      rolResponsable: "cliente" as const,
      href: `/admin/pos/cuentas/delivery/${c.id}`,
      total: sinProductos ? totalCargado(c.items) + Math.round(Number(c.costoEnvio)) : valia,
      unoPorUno: sinProductos,
    };
  });
}

/**
 * Las cuentas cerradas sin cobrar dentro de un período —de mesa y de delivery—, de la más reciente a la más vieja. La usan el
 * Historial de cuentas, su Excel y su PDF, para que los tres muestren lo mismo.
 */
export async function cargarCuentasCanceladas(db: PrismaLocal, rango: { gte: Date; lt: Date }): Promise<CuentaCancelada[]> {
  const [mesa, delivery] = await Promise.all([cargarCuentasMesaCanceladas(db, rango), cargarCuentasDeliveryCanceladas(db, rango)]);
  return [...mesa, ...delivery].sort((a, b) => (b.cerradaEn?.getTime() ?? 0) - (a.cerradaEn?.getTime() ?? 0));
}
