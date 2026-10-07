import { prisma } from "@/lib/prisma";
import {
  SELECCION_PROMOCIONES,
  precioEnPosicion,
  segundoDeSemanaAsuncion,
  segundosHastaElProximoCambio,
  tramosDeFilas,
  type TramoPromocion,
} from "@/lib/precio-promocion";

/**
 * Los precios VIGENTES de la carta pública de un local, por identificador: cada producto con su precio de ahora (el de la
 * promoción si estamos dentro de una franja, o el normal) y cada agregado propio con su precio extra. Es lo que el carrito
 * del cliente usa para ponerse al día: un cliente que agregó una pizza a las 17:50 y pide a las 18:05 tiene que ver y
 * pagar el precio de las 18:05, no el de cuando tocó el producto.
 *
 * Los agregados de un grupo son productos reales, así que ya están en el mapa con su propio id (el mismo que usa el
 * carrito como id de la opción). Los ids de producto y de agregado propio no se pisan (cada uno es un cuid distinto).
 *
 * `refrescarEn` son los segundos hasta el próximo momento en que cambia algún precio del local (empieza o termina una
 * promoción): la pantalla se actualiza justo entonces, sin consultar al servidor cada rato. Null si no hay promociones.
 */
export type MapaPrecios = Record<string, number>;

export async function cargarPreciosPublicos(
  storeId: string,
  ahora: Date = new Date()
): Promise<{ precios: MapaPrecios; refrescarEn: number | null }> {
  const productos = await prisma.product.findMany({
    where: { storeId },
    select: {
      id: true,
      precio: true,
      promociones: SELECCION_PROMOCIONES,
      opciones: { select: { id: true, precioExtra: true } },
    },
  });

  const posicion = segundoDeSemanaAsuncion(ahora);
  const precios: MapaPrecios = {};
  const todasLasPromos: TramoPromocion[] = [];
  for (const p of productos) {
    const tramos = tramosDeFilas(p.promociones);
    todasLasPromos.push(...tramos);
    precios[p.id] = precioEnPosicion(Number(p.precio), tramos, posicion).precio;
    for (const o of p.opciones) precios[o.id] = Number(o.precioExtra);
  }

  return { precios, refrescarEn: segundosHastaElProximoCambio(todasLasPromos, ahora) };
}
