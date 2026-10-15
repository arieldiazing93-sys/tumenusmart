"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { PRECIO_MAXIMO_CANCHA, etiquetaDeDeporte, sanearCancha } from "@/lib/canchas";
import { asegurarGrupoDeCanchas, retirarProductoDeCancha, sincronizarProductoDeCancha } from "@/lib/canchas-producto";
import { descartarImagenes } from "@/lib/imagenes";
import { formatearGuarani } from "@/lib/format";
import { idLocalActual } from "@/lib/local-actual";
import { describirTramo, validarTramos } from "@/lib/precio-promocion";
import { prismaDelLocal } from "@/lib/prisma-local";
import { subirImagenPaginaReservas } from "@/lib/supabase-storage";

export type ResultadoCancha = { ok: true } | { ok: false; error: string };
export type ResultadoFotoCancha = { ok: true; url: string } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/admin/canchas/lista");
  revalidatePath("/admin/canchas");
}

/**
 * Sube la foto de la cancha en cuanto se elige, antes de guardar el formulario: así se ve enseguida. Si después se cancela,
 * la imagen queda sin usar y la limpieza diaria la borra (igual que con el logo del negocio).
 */
export async function subirFotoDeCancha(formData: FormData): Promise<ResultadoFotoCancha> {
  await exigirPermiso("canchas.configurar");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "No se recibió ninguna imagen" };
  try {
    return { ok: true, url: await subirImagenPaginaReservas(archivo) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo subir la foto" };
  }
}

/** Da de alta una cancha. Lo que llega del navegador se revisa de nuevo: nunca se guarda tal cual. */
export async function crearCancha(entrada: unknown): Promise<ResultadoCancha> {
  const sesion = await exigirPermiso("canchas.configurar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const saneada = sanearCancha(entrada);
  if (!saneada.ok) return saneada;
  const c = saneada.cancha;

  // Va al final de la lista: después de la última que tiene el local.
  // El grupo del punto de venta (Fútbol 5…): se resuelve primero, así un nombre repetido de la carta no deja la cancha a medio hacer.
  const grupo = await asegurarGrupoDeCanchas(storeId, c.categoria);
  if (!grupo.ok) return grupo;
  // `categoria` es del grupo del punto de venta (no es una columna de la cancha): se saca de lo que se guarda.
  const columnas: Omit<typeof c, "categoria"> & { categoria?: string } = { ...c };
  delete columnas.categoria;

  const ultima = await db.cancha.findFirst({ orderBy: { orden: "desc" }, select: { orden: true } });

  const creada = await db.cancha.create({
    data: { storeId, ...columnas, categoriaId: grupo.categoriaId, orden: (ultima?.orden ?? -1) + 1 },
    select: { id: true },
  });

  // Su producto en el punto de venta (alquiler por hora, con su IVA, dentro de su grupo).
  const producto = await sincronizarProductoDeCancha(storeId, creada.id);
  if (!producto.ok) {
    return {
      ok: false,
      error: `La cancha se creó, pero no se pudo prepararla para el punto de venta: ${producto.error} Abrila y guardala de nuevo.`,
    };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: "cancha_creada",
    descripcion: `Agregó la cancha ${c.nombre} (${etiquetaDeDeporte(c.deporte)}).`,
    entidad: "Cancha",
    entidadId: creada.id,
    detalle: { precioHora: c.precioHora, precioNocturnoHora: c.precioNocturnoHora, duraciones: c.duraciones },
  });

  refrescar();
  return { ok: true };
}

export async function actualizarCancha(id: string, entrada: unknown): Promise<ResultadoCancha> {
  const sesion = await exigirPermiso("canchas.configurar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const saneada = sanearCancha(entrada);
  if (!saneada.ok) return saneada;
  const c = saneada.cancha;

  // Se lee primero (filtrado por local) para saber si existe y qué cambió.
  const anterior = await db.cancha.findFirst({
    where: { id },
    select: { activa: true, fotoUrl: true, precioHora: true, nombre: true },
  });
  if (!anterior) return { ok: false, error: "No se encontró esa cancha." };

  // El grupo del punto de venta, antes de tocar nada (un nombre repetido de la carta se avisa y no cambia nada).
  const grupo = await asegurarGrupoDeCanchas(storeId, c.categoria);
  if (!grupo.ok) return grupo;
  const columnas: Omit<typeof c, "categoria"> & { categoria?: string } = { ...c };
  delete columnas.categoria;

  await db.cancha.updateMany({ where: { id }, data: { ...columnas, categoriaId: grupo.categoriaId } });
  // Su producto en el punto de venta sigue a la ficha: nombre, precio, IVA, grupo y si está disponible.
  const producto = await sincronizarProductoDeCancha(storeId, id);
  if (!producto.ok) return producto;
  // Si se cambió o se quitó la foto, la anterior se borra del almacenamiento (si ninguna otra fila la usa).
  if (anterior.fotoUrl && anterior.fotoUrl !== c.fotoUrl) await descartarImagenes([anterior.fotoUrl]);

  const cambioEstado = anterior.activa !== c.activa;
  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: cambioEstado ? (c.activa ? "cancha_activada" : "cancha_desactivada") : "cancha_editada",
    descripcion: cambioEstado
      ? `${c.activa ? "Volvió a activar" : "Desactivó"} la cancha ${c.nombre}.`
      : `Editó la cancha ${c.nombre}.`,
    entidad: "Cancha",
    entidadId: id,
    detalle: { precioAntes: Number(anterior.precioHora), precioAhora: c.precioHora },
  });

  refrescar();
  return { ok: true };
}

/**
 * Borra una cancha que nunca tuvo reservas (una cargada por error). Si ya tuvo, no se borra: se desactiva, así sus
 * reservas viejas siguen mostrándose con su nombre.
 */
export async function eliminarCancha(id: string): Promise<ResultadoCancha> {
  const sesion = await exigirPermiso("canchas.configurar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cancha = await db.cancha.findFirst({ where: { id }, select: { nombre: true, fotoUrl: true, productId: true } });
  if (!cancha) return { ok: false, error: "No se encontró esa cancha." };

  const reservas = await db.reservaCancha.count({ where: { canchaId: id } });
  if (reservas > 0) {
    return {
      ok: false,
      error: "Esta cancha ya tuvo reservas, así que no se puede borrar. Desactivala y deja de aparecer para reservar.",
    };
  }

  await db.cancha.deleteMany({ where: { id } });
  // Su producto del punto de venta: se borra, o queda desactivado si ya tuvo ventas.
  await retirarProductoDeCancha(storeId, cancha.productId);
  if (cancha.fotoUrl) await descartarImagenes([cancha.fotoUrl]);

  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: "cancha_eliminada",
    descripcion: `Eliminó la cancha ${cancha.nombre}.`,
    entidad: "Cancha",
    entidadId: id,
  });

  refrescar();
  return { ok: true };
}

/**
 * Guarda los PRECIOS POR DÍA Y HORARIO de una cancha (sábado y domingo 100.000, lunes a viernes de 18 a 20 a 90.000…): reemplaza
 * todos los que tenía por los que llegan (una lista vacía los quita). Son los mismos «precios de promoción» de los productos: se
 * guardan en el producto de la cancha en el punto de venta, así rigen igual en el mostrador (según el día y la hora de la venta) y en las
 * reservas (según el día y la hora de la reserva). Las reglas del tiempo y la revisión son las de src/lib/precio-promocion.ts: la base
 * nunca guarda dos precios para un mismo momento.
 */
export async function guardarPreciosDeCancha(canchaId: string, entradas: unknown): Promise<ResultadoCancha> {
  const sesion = await exigirPermiso("canchas.configurar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cancha = await db.cancha.findFirst({
    where: { id: String(canchaId ?? "") },
    select: { id: true, nombre: true, precioHora: true },
  });
  if (!cancha) return { ok: false, error: "No se encontró esa cancha." };

  const validadas = validarTramos(entradas);
  if (!validadas.ok) return { ok: false, error: validadas.error };
  if (validadas.tramos.some((t) => t.precio > PRECIO_MAXIMO_CANCHA)) {
    return { ok: false, error: `Un precio por hora no puede pasar de ${formatearGuarani(PRECIO_MAXIMO_CANCHA)}.` };
  }

  // Su producto en el punto de venta (si todavía no existe, se crea): ahí viven los precios.
  const producto = await sincronizarProductoDeCancha(storeId, cancha.id);
  if (!producto.ok) return producto;
  const productId = producto.productId;

  // Reemplazo completo en una sola transacción: o queda todo lo nuevo, o no se toca nada.
  await db.$transaction([
    db.precioPromocion.deleteMany({ where: { productId } }),
    db.precioPromocion.createMany({
      data: validadas.tramos.map((t) => ({
        storeId,
        productId,
        diaInicio: t.diaInicio,
        horaInicio: t.horaInicio,
        diaFin: t.diaFin,
        horaFin: t.horaFin,
        precio: t.precio,
      })),
    }),
  ]);

  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: "precios_por_dia_guardados",
    descripcion:
      validadas.tramos.length === 0
        ? `Quitó los precios por día y horario de la cancha ${cancha.nombre}.`
        : `Guardó ${validadas.tramos.length} ${validadas.tramos.length === 1 ? "precio" : "precios"} por día y horario de la cancha ${cancha.nombre} (precio normal ${formatearGuarani(Number(cancha.precioHora))}): ${validadas.tramos.map(describirTramo).join("; ")}.`,
    entidad: "Cancha",
    entidadId: cancha.id,
    detalle: { cancha: cancha.nombre, precioNormal: Number(cancha.precioHora), precios: validadas.tramos },
  });

  refrescar();
  // El mostrador y la carta leen el precio de ahora: se vuelven a leer.
  revalidatePath("/admin/pos");
  revalidatePath("/admin/productos");
  return { ok: true };
}
