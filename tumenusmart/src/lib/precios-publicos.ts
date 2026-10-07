import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import {
  SELECCION_PROMOCIONES,
  precioEnPosicion,
  segundoDeSemanaAsuncion,
  segundosHastaElProximoCambio,
  tramosDeFilas,
  type TramoPromocion,
} from "@/lib/precio-promocion";
import { promoVigenteDe } from "@/lib/promociones";
import { cargarPromociones } from "@/lib/promociones-servidor";

/**
 * Los precios VIGENTES de la carta pública de un local, por identificador: cada producto con su precio de ahora (el de la
 * promoción de precio si estamos dentro de una franja, o el normal) y cada agregado propio con su precio extra. Es lo que el carrito
 * del cliente usa para ponerse al día: un cliente que agregó una pizza a las 17:50 y pide a las 18:05 tiene que ver y
 * pagar el precio de las 18:05, no el de cuando tocó el producto.
 *
 * Los agregados de un grupo son productos reales, así que ya están en el mapa con su propio id (el mismo que usa el
 * carrito como id de la opción). Los ids de producto y de agregado propio no se pisan (cada uno es un cuid distinto).
 *
 * `descuentos`: por producto, el porcentaje de una PROMOCIÓN por descuento (ver promociones.ts) que rige ahora. Se aplica al precio del
 * producto cuando se pide ESE producto (no cuando se usa como agregado de otro): es la misma cuenta que hace el servidor al cobrar. Las
 * promociones por volumen ("2 por 1") no se aplican acá: el pedido sale por WhatsApp y el local las aplica al cargarlo en el delivery.
 *
 * `refrescarEn` son los segundos hasta el próximo momento en que cambia algún precio del local (empieza o termina una
 * promoción de precio o una Promoción): la pantalla se actualiza justo entonces, sin consultar al servidor cada rato. Null si no hay.
 */
export type MapaPrecios = Record<string, number>;
export type MapaDescuentos = Record<string, number>;

export async function cargarPreciosPublicos(
  storeId: string,
  ahora: Date = new Date()
): Promise<{ precios: MapaPrecios; descuentos: MapaDescuentos; refrescarEn: number | null }> {
  const [productos, promociones] = await Promise.all([
    prisma.product.findMany({
      where: { storeId },
      select: {
        id: true,
        precio: true,
        promociones: SELECCION_PROMOCIONES,
        opciones: { select: { id: true, precioExtra: true } },
      },
    }),
    cargarPromociones(prismaDelLocal(storeId)),
  ]);

  const posicion = segundoDeSemanaAsuncion(ahora);
  const precios: MapaPrecios = {};
  const descuentos: MapaDescuentos = {};
  const todasLasPromos: TramoPromocion[] = [];
  for (const p of productos) {
    const tramos = tramosDeFilas(p.promociones);
    todasLasPromos.push(...tramos);
    precios[p.id] = precioEnPosicion(Number(p.precio), tramos, posicion).precio;
    for (const o of p.opciones) precios[o.id] = Number(o.precioExtra);
    const promo = promoVigenteDe(promociones, p.id, posicion);
    if (promo && promo.tipo === "descuento" && promo.porcentaje) descuentos[p.id] = promo.porcentaje;
  }
  // Cuándo empieza o termina cada Promoción también cambia lo que ve el cliente.
  for (const pr of promociones) for (const f of pr.franjas) todasLasPromos.push({ ...f, precio: 0 });

  return { precios, descuentos, refrescarEn: segundosHastaElProximoCambio(todasLasPromos, ahora) };
}
