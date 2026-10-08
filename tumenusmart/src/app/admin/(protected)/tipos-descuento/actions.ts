"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { claveDeNombreDeTipo, textoTipoDescuento, validarTipoDescuento } from "@/lib/tipos-descuento";

/**
 * Los tipos de descuento del local (ver src/lib/tipos-descuento.ts): crear, editar, activar o desactivar y borrar. Todo es de quien puede
 * editar la configuración (el dueño) y trabaja SOLO sobre el local de la sesión. Lo que llega del navegador se revisa de nuevo acá.
 *
 * Borrar un tipo no cambia lo ya vendido: la venta guarda el nombre y el porcentaje, no una referencia.
 */

type Resultado = { ok: true } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/admin/tipos-descuento");
  // Se eligen al vender: las pantallas que los muestran se vuelven a leer.
  revalidatePath("/admin/pos");
  revalidatePath("/admin/comedor");
  revalidatePath("/admin/delivery");
}

/** Crea un tipo (`id` null) o guarda los cambios de uno existente. */
export async function guardarTipoDescuento(id: string | null, datos: { nombre: unknown; porcentaje: unknown }): Promise<Resultado> {
  const sesion = await exigirPermiso("configuracion.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  if (id !== null && typeof id !== "string") return { ok: false, error: "El tipo de descuento no es válido." };
  const v = validarTipoDescuento(datos ?? {});
  if (!v.ok) return { ok: false, error: v.error };

  // Con el mismo nombre (sin importar mayúsculas ni tildes) no puede haber dos: confunde a quien elige.
  const existentes = await db.tipoDescuento.findMany({ select: { id: true, nombre: true } });
  const clave = claveDeNombreDeTipo(v.nombre);
  if (existentes.some((e) => e.id !== id && claveDeNombreDeTipo(e.nombre) === clave)) {
    return { ok: false, error: `Ya hay un descuento llamado “${v.nombre}”.` };
  }
  if (id && !existentes.some((e) => e.id === id)) {
    return { ok: false, error: "Ese tipo de descuento ya no existe. Actualizá la pantalla." };
  }

  try {
    let guardadoId: string;
    if (id) {
      // El local va en la condición: un tipo de otro negocio no se toca.
      const r = await prisma.tipoDescuento.updateMany({ where: { id, storeId: idLocal }, data: { nombre: v.nombre, porcentaje: v.porcentaje } });
      if (r.count !== 1) return { ok: false, error: "Ese tipo de descuento ya no existe. Actualizá la pantalla." };
      guardadoId = id;
    } else {
      const creado = await prisma.tipoDescuento.create({
        data: { storeId: idLocal, nombre: v.nombre, porcentaje: v.porcentaje },
        select: { id: true },
      });
      guardadoId = creado.id;
    }

    await registrarBitacora(idLocal, sesion, {
      modulo: "configuracion",
      accion: id ? "tipo_descuento_editado" : "tipo_descuento_creado",
      descripcion: `${id ? "Editó" : "Creó"} el tipo de descuento “${textoTipoDescuento(v)}”.`,
      entidad: "TipoDescuento",
      entidadId: guardadoId,
      detalle: { nombre: v.nombre, porcentaje: v.porcentaje },
    });
  } catch (e) {
    // Dos personas lo crearon a la vez con el mismo nombre.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: `Ya hay un descuento llamado “${v.nombre}”.` };
    }
    console.error("[tipos-descuento] guardar falló", e);
    return { ok: false, error: "No se pudo guardar el tipo de descuento. Probá de nuevo." };
  }

  refrescar();
  return { ok: true };
}

/** Activa o desactiva un tipo: uno desactivado no aparece al vender, pero queda para volver a activarlo. */
export async function cambiarEstadoTipoDescuento(id: string, activo: boolean): Promise<Resultado> {
  const sesion = await exigirPermiso("configuracion.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const tipo = await db.tipoDescuento.findUnique({ where: { id: String(id) }, select: { nombre: true, porcentaje: true } });
  if (!tipo) return { ok: false, error: "Ese tipo de descuento ya no existe. Actualizá la pantalla." };

  const r = await prisma.tipoDescuento.updateMany({ where: { id: String(id), storeId: idLocal }, data: { activo: !!activo } });
  if (r.count !== 1) return { ok: false, error: "Ese tipo de descuento ya no existe. Actualizá la pantalla." };

  await registrarBitacora(idLocal, sesion, {
    modulo: "configuracion",
    accion: activo ? "tipo_descuento_activado" : "tipo_descuento_desactivado",
    descripcion: `${activo ? "Activó" : "Desactivó"} el tipo de descuento “${textoTipoDescuento({ nombre: tipo.nombre, porcentaje: Number(tipo.porcentaje) })}”.`,
    entidad: "TipoDescuento",
    entidadId: String(id),
  });
  refrescar();
  return { ok: true };
}

/** Borra un tipo. Lo ya vendido no cambia. */
export async function eliminarTipoDescuento(id: string): Promise<Resultado> {
  const sesion = await exigirPermiso("configuracion.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const tipo = await db.tipoDescuento.findUnique({ where: { id: String(id) }, select: { nombre: true, porcentaje: true } });
  if (!tipo) return { ok: false, error: "Ese tipo de descuento ya no existe. Actualizá la pantalla." };

  const r = await prisma.tipoDescuento.deleteMany({ where: { id: String(id), storeId: idLocal } });
  if (r.count !== 1) return { ok: false, error: "Ese tipo de descuento ya no existe. Actualizá la pantalla." };

  await registrarBitacora(idLocal, sesion, {
    modulo: "configuracion",
    accion: "tipo_descuento_eliminado",
    descripcion: `Eliminó el tipo de descuento “${textoTipoDescuento({ nombre: tipo.nombre, porcentaje: Number(tipo.porcentaje) })}”.`,
    entidad: "TipoDescuento",
    entidadId: String(id),
  });
  refrescar();
  return { ok: true };
}
