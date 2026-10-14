/**
 * Cada cancha es un PRODUCTO del punto de venta (el alquiler por hora), agrupado en una categoría propia («Fútbol 5», «Pádel»…), como los
 * servicios de la Reserva de turnos. Esto lo crea y lo mantiene: nombre, precio, IVA, grupo y disponibilidad salen siempre de la ficha de
 * la cancha, así el cajero lo ve y lo cobra en el mostrador con todos los controles del POS (ticket o factura, formas de pago, turno,
 * seguridad) y la factura electrónica sabe qué IVA, qué unidad (Hora) y que es una prestación de servicios.
 *
 * Solo corre en el servidor. Usa el cliente sin filtro con el local EXPLÍCITO en cada consulta, como las demás escrituras en bloque.
 */

import { etiquetaDeDeporte, nombreDelProductoDeAlquiler } from "./canchas";
import { normalizarIva } from "./iva";
import { prisma } from "./prisma";

/** El nombre del grupo no puede pasar de esto (el mismo tope de la ficha). */
const LARGO_MAXIMO_GRUPO = 40;

export type ResultadoGrupo = { ok: true; categoriaId: string } | { ok: false; error: string };

/**
 * El grupo (categoría) del punto de venta con ese nombre: si ya hay uno de canchas, se usa; si no, se crea. Un nombre que ya usa otra
 * categoría de la carta (Bebidas, un servicio de turnos…) no se pisa ni se reutiliza: se pide otro, así una cancha nunca queda mezclada
 * con lo que no es suyo ni cambia cómo se ve otra categoría.
 */
export async function asegurarGrupoDeCanchas(storeId: string, nombreEscrito: string): Promise<ResultadoGrupo> {
  const nombre = nombreEscrito.trim().slice(0, LARGO_MAXIMO_GRUPO);
  if (!nombre) return { ok: false, error: "Poné el nombre del grupo (por ejemplo: Fútbol 5)." };

  return prisma.$transaction(async (tx) => {
    // Un candado por local y nombre: dos altas a la vez no crean dos grupos iguales.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"grupo-canchas:" + storeId + ":" + nombre.toLowerCase()}))`;
    const existente = await tx.category.findFirst({
      where: { storeId, nombre: { equals: nombre, mode: "insensitive" } },
      select: { id: true, paraCanchas: true },
    });
    if (existente) {
      if (existente.paraCanchas) return { ok: true as const, categoriaId: existente.id };
      return {
        ok: false as const,
        error: `Ya tenés una categoría llamada «${nombre}» en tu carta. Elegí otro nombre para el grupo de canchas.`,
      };
    }
    const ultima = await tx.category.findFirst({ where: { storeId }, orderBy: { orden: "desc" }, select: { orden: true } });
    const creada = await tx.category.create({
      data: { storeId, nombre, orden: (ultima?.orden ?? 0) + 1, activa: true, paraCanchas: true },
      select: { id: true },
    });
    return { ok: true as const, categoriaId: creada.id };
  });
}

export type ResultadoProducto = { ok: true; productId: string } | { ok: false; error: string };

/**
 * Deja al día el producto de la cancha con lo que dice su ficha (lo crea si todavía no existe). Si la cancha no tiene grupo (una cargada
 * antes de que existieran los grupos), le arma el del tipo de cancha.
 */
export async function sincronizarProductoDeCancha(storeId: string, canchaId: string): Promise<ResultadoProducto> {
  const cancha = await prisma.cancha.findFirst({
    where: { id: canchaId, storeId },
    select: { id: true, nombre: true, deporte: true, precioHora: true, activa: true, iva: true, productId: true, categoriaId: true },
  });
  if (!cancha) return { ok: false, error: "Esa cancha ya no existe." };

  // El grupo: el de la ficha, si todavía existe; si no, el del tipo de cancha.
  let categoriaId: string | null = null;
  if (cancha.categoriaId) {
    const grupo = await prisma.category.findFirst({ where: { id: cancha.categoriaId, storeId }, select: { id: true } });
    categoriaId = grupo?.id ?? null;
  }
  if (!categoriaId) {
    const grupo = await asegurarGrupoDeCanchas(storeId, etiquetaDeDeporte(cancha.deporte));
    if (!grupo.ok) return grupo;
    categoriaId = grupo.categoriaId;
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"alquiler:" + canchaId}))`;

    const datos = {
      categoryId: categoriaId as string,
      nombre: nombreDelProductoDeAlquiler(cancha.nombre),
      precio: Number(cancha.precioHora),
      iva: normalizarIva(cancha.iva),
      // El alquiler se vende por hora (código 100 de SIFEN: «Hora») y es una prestación de servicios.
      unidadMedida: "hora",
      esServicio: true,
      // Una cancha desactivada deja de verse y de poder venderse en el punto de venta.
      disponible: cancha.activa,
    };

    if (cancha.productId) {
      const actualizados = await tx.product.updateMany({ where: { id: cancha.productId, storeId }, data: datos });
      if (actualizados.count === 1) {
        if (cancha.categoriaId !== categoriaId) {
          await tx.cancha.updateMany({ where: { id: canchaId, storeId }, data: { categoriaId } });
        }
        return { ok: true as const, productId: cancha.productId };
      }
    }

    const creado = await tx.product.create({ data: { storeId, ...datos }, select: { id: true } });
    await tx.cancha.updateMany({ where: { id: canchaId, storeId }, data: { productId: creado.id, categoriaId } });
    return { ok: true as const, productId: creado.id };
  });
}

/**
 * Saca el producto de una cancha que se borra. Si ya tuvo ventas no se puede borrar (la venta lo referencia): queda desactivado, fuera
 * del punto de venta, y la venta conserva su nombre. Nunca lanza.
 */
export async function retirarProductoDeCancha(storeId: string, productId: string | null): Promise<void> {
  if (!productId) return;
  try {
    const borrados = await prisma.product.deleteMany({ where: { id: productId, storeId } });
    if (borrados.count === 1) return;
  } catch {
    // Tiene ventas: no se borra.
  }
  await prisma.product.updateMany({ where: { id: productId, storeId }, data: { disponible: false } }).catch(() => undefined);
}
