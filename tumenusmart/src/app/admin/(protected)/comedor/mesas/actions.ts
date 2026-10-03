"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { claveDeMesa, normalizarMesa } from "@/lib/comedor";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

/**
 * Las mesas del salón que el dueño carga en Ajustes (Configuración servicio comedor → Mesas). Con mesas cargadas el mozo
 * elige la mesa de una lista en vez de escribirla. Todas exigen el permiso del dueño (comedor.configurar) y trabajan solo
 * dentro de su local. Devuelven un resultado en vez de lanzar, para poder explicar por qué no se pudo.
 */

export type ResultadoMesas = { ok: true; mensaje?: string } | { ok: false; error: string };

/** Cuántas mesas se pueden crear de una vez, y cuántas puede tener un local en total. */
const MAXIMO_POR_VEZ = 200;
const MAXIMO_TOTAL = 300;

const YA_EXISTE = "Ya hay una mesa con ese nombre.";

function refrescar() {
  revalidatePath("/admin/comedor/mesas");
  revalidatePath("/admin/comedor");
}

function esDuplicada(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Crea las mesas "1", "2", "3"… hasta la cantidad pedida, salteando las que ya existen (si ya hay 10 y se pide 15, se crean
 * la 11 a la 15). Es la forma rápida de cargar el salón entero.
 */
export async function crearMesasPorCantidad(cantidad: number): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const n = Math.floor(Number(cantidad));
  if (!Number.isFinite(n) || n < 1) return { ok: false, error: "Escribí cuántas mesas tiene el salón (un número mayor a cero)." };
  if (n > MAXIMO_POR_VEZ) return { ok: false, error: `Como mucho ${MAXIMO_POR_VEZ} mesas de una vez.` };

  const existentes = await db.mesaComedor.findMany({ select: { clave: true, orden: true } });
  const claves = new Set(existentes.map((m) => m.clave));
  const nuevas: { nombre: string; clave: string }[] = [];
  for (let i = 1; i <= n; i++) {
    const nombre = String(i);
    const clave = claveDeMesa(nombre);
    if (!claves.has(clave)) nuevas.push({ nombre, clave });
  }
  if (nuevas.length === 0) return { ok: true, mensaje: `Ya tenías las mesas del 1 al ${n}: no se creó ninguna.` };
  if (existentes.length + nuevas.length > MAXIMO_TOTAL) {
    return { ok: false, error: `Un local puede tener hasta ${MAXIMO_TOTAL} mesas.` };
  }

  const primerOrden = existentes.reduce((m, x) => Math.max(m, x.orden), 0) + 1;
  // skipDuplicates: si dos personas cargan a la vez, la segunda no falla por las que ya creó la primera.
  await db.mesaComedor.createMany({
    data: nuevas.map((m, i) => ({ storeId: idLocal, nombre: m.nombre, clave: m.clave, orden: primerOrden + i })),
    skipDuplicates: true,
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mesas_creadas",
    descripcion: `Cargó ${nuevas.length} ${nuevas.length === 1 ? "mesa" : "mesas"} del salón (hasta la ${n}).`,
    entidad: "MesaComedor",
    detalle: { creadas: nuevas.length, hasta: n },
  });

  refrescar();
  return { ok: true, mensaje: `Se crearon ${nuevas.length} ${nuevas.length === 1 ? "mesa" : "mesas"}.` };
}

/** Agrega una mesa con el nombre que se le quiera dar ("Terraza 2", "Barra"). */
export async function agregarMesa(nombre: string): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const limpio = normalizarMesa(nombre);
  if (!limpio) return { ok: false, error: "Escribí el nombre de la mesa (hasta 20 letras)." };

  const existentes = await db.mesaComedor.findMany({ select: { orden: true } });
  if (existentes.length >= MAXIMO_TOTAL) return { ok: false, error: `Un local puede tener hasta ${MAXIMO_TOTAL} mesas.` };
  const orden = existentes.reduce((m, x) => Math.max(m, x.orden), 0) + 1;

  try {
    await db.mesaComedor.create({ data: { storeId: idLocal, nombre: limpio, clave: claveDeMesa(limpio), orden } });
  } catch (err) {
    if (esDuplicada(err)) return { ok: false, error: YA_EXISTE };
    throw err;
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mesa_creada",
    descripcion: `Agregó la mesa ${limpio} al salón.`,
    entidad: "MesaComedor",
  });

  refrescar();
  return { ok: true };
}

/** Le cambia el nombre a una mesa. Las cuentas que ya se hicieron conservan el nombre que tenían. */
export async function renombrarMesa(id: string, nombre: string): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const limpio = normalizarMesa(nombre);
  if (!limpio) return { ok: false, error: "Escribí el nombre de la mesa (hasta 20 letras)." };

  const anterior = await db.mesaComedor.findFirst({ where: { id: String(id) }, select: { nombre: true } });
  if (!anterior) return { ok: false, error: "No encontré esa mesa." };

  try {
    await db.mesaComedor.updateMany({ where: { id: String(id) }, data: { nombre: limpio, clave: claveDeMesa(limpio) } });
  } catch (err) {
    if (esDuplicada(err)) return { ok: false, error: YA_EXISTE };
    throw err;
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mesa_renombrada",
    descripcion: `Cambió el nombre de la mesa ${anterior.nombre} a ${limpio}.`,
    entidad: "MesaComedor",
    entidadId: String(id),
  });

  refrescar();
  return { ok: true };
}

/** Activa o desactiva una mesa: una desactivada no se le ofrece al mozo (se saca del salón sin borrarla). */
export async function alternarMesa(id: string, activa: boolean): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const mesa = await db.mesaComedor.findFirst({ where: { id: String(id) }, select: { nombre: true } });
  if (!mesa) return { ok: false, error: "No encontré esa mesa." };

  await db.mesaComedor.updateMany({ where: { id: String(id) }, data: { activa: !!activa } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: activa ? "mesa_activada" : "mesa_desactivada",
    descripcion: `${activa ? "Volvió a activar" : "Desactivó"} la mesa ${mesa.nombre}.`,
    entidad: "MesaComedor",
    entidadId: String(id),
  });

  refrescar();
  return { ok: true };
}

/** Borra una mesa de la lista. Las cuentas ya hechas no se tocan (guardan el nombre como texto). */
export async function eliminarMesa(id: string): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const mesa = await db.mesaComedor.findFirst({ where: { id: String(id) }, select: { nombre: true } });
  if (!mesa) return { ok: false, error: "No encontré esa mesa." };

  await db.mesaComedor.deleteMany({ where: { id: String(id) } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mesa_eliminada",
    descripcion: `Eliminó la mesa ${mesa.nombre} del salón.`,
    entidad: "MesaComedor",
    entidadId: String(id),
  });

  refrescar();
  return { ok: true };
}
