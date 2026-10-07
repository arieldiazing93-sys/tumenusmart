"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { describirFranjaSola } from "@/lib/precio-promocion";
import { conflictoConOtras, resumenDePromo, validarPromocion, type DatosPromocion } from "@/lib/promociones";
import { cargarPromociones } from "@/lib/promociones-servidor";

/**
 * Las Promociones del local (por descuento y por volumen): crear, editar, activar o desactivar, duplicar y borrar. Todo exige el permiso
 * de editar productos y trabaja SOLO sobre el local de la sesión. Lo que llega del navegador se revisa de nuevo acá con las mismas
 * reglas que usa la pantalla (`validarPromocion`): nada se acepta porque "la pantalla ya lo comprobó".
 */

export type ResultadoPromocionGuardada = { ok: true; id: string } | { ok: false; error: string };
type Resultado = { ok: true } | { ok: false; error: string };

/** Las pantallas que muestran o aplican promociones se vuelven a leer. */
function refrescar() {
  revalidatePath("/admin/promociones");
  revalidatePath("/admin/pos");
  revalidatePath("/admin/comedor");
  revalidatePath("/admin/delivery");
  revalidatePath("/[slug]", "layout");
}

/** Los productos tienen que ser de ESTE local (al ir por el cliente del local, uno ajeno simplemente no aparece). */
async function nombresDeProductos(ids: string[]): Promise<Map<string, string> | null> {
  const db = prismaDelLocal(await idLocalActual());
  const productos = await db.product.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } });
  if (productos.length !== ids.length) return null;
  return new Map(productos.map((p) => [p.id, p.nombre]));
}

/**
 * Crea una promoción (`id` null) o guarda los cambios de una existente. Reemplaza todos sus días y productos por los que llegan, en una
 * sola transacción: o queda todo lo nuevo, o no se toca nada. Una promoción activa no puede compartir un producto con otra activa que
 * se pise en el horario (un producto está en una promoción a la vez).
 */
export async function guardarPromocion(id: string | null, datos: DatosPromocion): Promise<ResultadoPromocionGuardada> {
  const sesion = await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const v = validarPromocion(datos);
  if (!v.ok) return { ok: false, error: v.error };
  const promo = v.promo;

  if (id !== null && typeof id !== "string") return { ok: false, error: "La promoción no es válida." };
  if (id) {
    const existe = await db.promocion.findUnique({ where: { id }, select: { id: true } });
    if (!existe) return { ok: false, error: "Esa promoción ya no existe. Actualizá la pantalla." };
  }

  const nombres = await nombresDeProductos(promo.productIds);
  if (!nombres) return { ok: false, error: "Alguno de los productos ya no existe. Actualizá la pantalla y volvé a elegirlos." };

  const otras = await cargarPromociones(db, false);
  const conflicto = conflictoConOtras(
    { id: id ?? "nueva", activa: promo.activa, franjas: promo.franjas, productIds: promo.productIds },
    otras,
    (pid) => nombres.get(pid) ?? "un producto"
  );
  if (conflicto) return { ok: false, error: conflicto };

  const guardada = await prisma.$transaction(async (tx) => {
    const columnas = {
      nombre: promo.nombre,
      tipo: promo.tipo,
      activa: promo.activa,
      porcentaje: promo.porcentaje,
      porCada: promo.porCada,
      regalar: promo.regalar,
      forzarPorProducto: promo.forzarPorProducto,
      aplicaAModificadores: promo.aplicaAModificadores,
    };
    let promocionId: string;
    if (id) {
      // El local va en la condición: una promoción de otro negocio no se toca.
      const actualizada = await tx.promocion.updateMany({ where: { id, storeId: idLocal }, data: columnas });
      if (actualizada.count !== 1) throw new Error("PROMOCION_NO_ENCONTRADA");
      promocionId = id;
      await tx.promocionDia.deleteMany({ where: { promocionId, storeId: idLocal } });
      await tx.promocionProducto.deleteMany({ where: { promocionId, storeId: idLocal } });
    } else {
      const creada = await tx.promocion.create({ data: { ...columnas, storeId: idLocal }, select: { id: true } });
      promocionId = creada.id;
    }
    await tx.promocionDia.createMany({
      data: promo.franjas.map((f) => ({
        storeId: idLocal,
        promocionId,
        diaInicio: f.diaInicio,
        horaInicio: f.horaInicio,
        diaFin: f.diaFin,
        horaFin: f.horaFin,
      })),
    });
    await tx.promocionProducto.createMany({
      data: promo.productIds.map((productId) => ({ storeId: idLocal, promocionId, productId })),
    });
    return promocionId;
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message === "PROMOCION_NO_ENCONTRADA") return null;
    throw e;
  });
  if (!guardada) return { ok: false, error: "Esa promoción ya no existe. Actualizá la pantalla." };

  await registrarBitacora(idLocal, sesion, {
    modulo: "promociones",
    accion: id ? "promocion_editada" : "promocion_creada",
    descripcion: `${id ? "Editó" : "Creó"} la promoción “${promo.nombre}” (${resumenDePromo({ ...promo, id: guardada })}${promo.activa ? "" : ", inactiva"}) para ${promo.productIds.length} ${promo.productIds.length === 1 ? "producto" : "productos"}: ${promo.franjas.map(describirFranjaSola).join("; ")}.`,
    entidad: "Promocion",
    entidadId: guardada,
    detalle: {
      promocion: promo.nombre,
      tipo: promo.tipo,
      porcentaje: promo.porcentaje,
      porCada: promo.porCada,
      regalar: promo.regalar,
      forzarPorProducto: promo.forzarPorProducto,
      aplicaAModificadores: promo.aplicaAModificadores,
      activa: promo.activa,
      productos: promo.productIds.map((pid) => nombres.get(pid) ?? pid),
      franjas: promo.franjas,
    },
  });
  refrescar();
  return { ok: true, id: guardada };
}

/** Activa o desactiva una promoción. Al activarla se vuelve a comprobar que no se pise con otra activa en un mismo producto. */
export async function cambiarEstadoPromocion(id: string, activa: boolean): Promise<Resultado> {
  const sesion = await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const todas = await cargarPromociones(db, false);
  const promo = todas.find((p) => p.id === id);
  if (!promo) return { ok: false, error: "Esa promoción ya no existe. Actualizá la pantalla." };

  if (activa) {
    const productos = await db.product.findMany({ where: { id: { in: promo.productIds } }, select: { id: true, nombre: true } });
    const nombres = new Map(productos.map((p) => [p.id, p.nombre]));
    const conflicto = conflictoConOtras({ ...promo, activa: true }, todas, (pid) => nombres.get(pid) ?? "un producto");
    if (conflicto) return { ok: false, error: conflicto };
  }

  const r = await prisma.promocion.updateMany({ where: { id, storeId: idLocal }, data: { activa } });
  if (r.count !== 1) return { ok: false, error: "Esa promoción ya no existe. Actualizá la pantalla." };

  await registrarBitacora(idLocal, sesion, {
    modulo: "promociones",
    accion: activa ? "promocion_activada" : "promocion_desactivada",
    descripcion: `${activa ? "Activó" : "Desactivó"} la promoción “${promo.nombre}”.`,
    entidad: "Promocion",
    entidadId: id,
    detalle: { promocion: promo.nombre, activa },
  });
  refrescar();
  return { ok: true };
}

/** Copia una promoción (con sus días y productos) como una nueva, INACTIVA, para ajustarla y activarla después. */
export async function duplicarPromocion(id: string): Promise<ResultadoPromocionGuardada> {
  const sesion = await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const origen = (await cargarPromociones(db, false)).find((p) => p.id === id);
  if (!origen) return { ok: false, error: "Esa promoción ya no existe. Actualizá la pantalla." };

  const nombre = `${origen.nombre} (copia)`.slice(0, 80);
  const nuevaId = await prisma.$transaction(async (tx) => {
    const creada = await tx.promocion.create({
      data: {
        storeId: idLocal,
        nombre,
        tipo: origen.tipo,
        activa: false,
        porcentaje: origen.porcentaje,
        porCada: origen.porCada,
        regalar: origen.regalar,
        forzarPorProducto: origen.forzarPorProducto,
        aplicaAModificadores: origen.aplicaAModificadores,
      },
      select: { id: true },
    });
    await tx.promocionDia.createMany({
      data: origen.franjas.map((f) => ({ storeId: idLocal, promocionId: creada.id, ...f })),
    });
    await tx.promocionProducto.createMany({
      data: origen.productIds.map((productId) => ({ storeId: idLocal, promocionId: creada.id, productId })),
    });
    return creada.id;
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "promociones",
    accion: "promocion_duplicada",
    descripcion: `Copió la promoción “${origen.nombre}” como “${nombre}” (inactiva).`,
    entidad: "Promocion",
    entidadId: nuevaId,
    detalle: { origen: origen.nombre, copia: nombre },
  });
  refrescar();
  return { ok: true, id: nuevaId };
}

/**
 * Borra una promoción. Lo ya vendido no cambia (cada línea guarda su precio). En una cuenta abierta, las cortesías ya cargadas quedan como
 * están: la promoción ya no existe, así que no se recortan si después se cancelan productos.
 */
export async function eliminarPromocion(id: string): Promise<Resultado> {
  const sesion = await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const promo = (await cargarPromociones(db, false)).find((p) => p.id === id);
  if (!promo) return { ok: false, error: "Esa promoción ya no existe. Actualizá la pantalla." };

  // Los días y los productos se borran solos (la base los tiene encadenados a la promoción).
  const r = await prisma.promocion.deleteMany({ where: { id, storeId: idLocal } });
  if (r.count !== 1) return { ok: false, error: "Esa promoción ya no existe. Actualizá la pantalla." };

  await registrarBitacora(idLocal, sesion, {
    modulo: "promociones",
    accion: "promocion_eliminada",
    descripcion: `Eliminó la promoción “${promo.nombre}” (${resumenDePromo(promo)}).`,
    entidad: "Promocion",
    entidadId: id,
    detalle: { promocion: promo.nombre, tipo: promo.tipo },
  });
  refrescar();
  return { ok: true };
}
