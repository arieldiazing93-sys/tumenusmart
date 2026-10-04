"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { claveDeMesa, normalizarMesa, normalizarSector } from "@/lib/comedor";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

/**
 * Las mesas del salón y sus sectores (Salón, Patio, Terraza) que el dueño carga en Ajustes (Configuración servicio comedor
 * → Mesas y sectores). Con mesas cargadas el mozo elige la mesa de una lista en vez de escribirla, y con sectores elige
 * primero el sector. Todas exigen el permiso del dueño (comedor.configurar) y trabajan solo dentro de su local. Devuelven
 * un resultado en vez de lanzar, para poder explicar por qué no se pudo.
 */

export type ResultadoMesas = { ok: true; mensaje?: string } | { ok: false; error: string };

/** Cuántas mesas se pueden crear de una vez, cuántas puede tener un local, el número más alto y cuántos sectores. */
const MAXIMO_POR_VEZ = 200;
const MAXIMO_TOTAL = 300;
const MAXIMO_NUMERO = 999;
const MAXIMO_SECTORES = 20;

const YA_EXISTE = "Ya hay una mesa con ese nombre.";
const SECTOR_YA_EXISTE = "Ya hay un sector con ese nombre.";
const SECTOR_NO_EXISTE = "No encontré ese sector.";

function refrescar() {
  revalidatePath("/admin/comedor/mesas");
  revalidatePath("/admin/comedor");
}

function esDuplicada(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * El sector que se pidió, comprobando que sea de ESTE local (una clave foránea no lo verifica: sin esto alguien podría
 * colgarle a su mesa un sector de otro negocio). Sin id es "sin sector".
 */
async function resolverSector(
  db: ReturnType<typeof prismaDelLocal>,
  sectorId: string | null | undefined
): Promise<{ ok: true; sector: { id: string; nombre: string } | null } | { ok: false; error: string }> {
  if (!sectorId) return { ok: true, sector: null };
  const sector = await db.sectorComedor.findFirst({ where: { id: String(sectorId) }, select: { id: true, nombre: true } });
  if (!sector) return { ok: false, error: SECTOR_NO_EXISTE };
  return { ok: true, sector };
}

// ---------------------------------------------------------------------------
//  Los sectores del restaurante
// ---------------------------------------------------------------------------

/** Agrega un sector ("Salón", "Patio", "Terraza"). */
export async function crearSector(nombre: string): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const limpio = normalizarSector(nombre);
  if (!limpio) return { ok: false, error: "Escribí el nombre del sector (hasta 30 letras)." };

  const existentes = await db.sectorComedor.findMany({ select: { orden: true } });
  if (existentes.length >= MAXIMO_SECTORES) return { ok: false, error: `Un local puede tener hasta ${MAXIMO_SECTORES} sectores.` };
  const orden = existentes.reduce((m, x) => Math.max(m, x.orden), 0) + 1;

  try {
    await db.sectorComedor.create({ data: { storeId: idLocal, nombre: limpio, clave: claveDeMesa(limpio), orden } });
  } catch (err) {
    if (esDuplicada(err)) return { ok: false, error: SECTOR_YA_EXISTE };
    throw err;
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "sector_creado",
    descripcion: `Creó el sector ${limpio} del restaurante.`,
    entidad: "SectorComedor",
  });

  refrescar();
  return { ok: true };
}

/** Le cambia el nombre a un sector. Las mesas siguen en él. */
export async function renombrarSector(id: string, nombre: string): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const limpio = normalizarSector(nombre);
  if (!limpio) return { ok: false, error: "Escribí el nombre del sector (hasta 30 letras)." };

  const anterior = await db.sectorComedor.findFirst({ where: { id: String(id) }, select: { nombre: true } });
  if (!anterior) return { ok: false, error: SECTOR_NO_EXISTE };

  try {
    await db.sectorComedor.updateMany({ where: { id: String(id) }, data: { nombre: limpio, clave: claveDeMesa(limpio) } });
  } catch (err) {
    if (esDuplicada(err)) return { ok: false, error: SECTOR_YA_EXISTE };
    throw err;
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "sector_renombrado",
    descripcion: `Cambió el nombre del sector ${anterior.nombre} a ${limpio}.`,
    entidad: "SectorComedor",
    entidadId: String(id),
  });

  refrescar();
  return { ok: true };
}

/** Borra un sector. Sus mesas NO se borran: quedan sin sector (y se siguen ofreciendo al mozo). */
export async function eliminarSector(id: string): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const sector = await db.sectorComedor.findFirst({ where: { id: String(id) }, select: { nombre: true } });
  if (!sector) return { ok: false, error: SECTOR_NO_EXISTE };

  // Se sueltan las mesas a mano (además de la regla de la base) para poder contar cuántas quedaron sin sector.
  const sueltas = await db.mesaComedor.updateMany({ where: { sectorId: String(id) }, data: { sectorId: null } });
  await db.sectorComedor.deleteMany({ where: { id: String(id) } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "sector_eliminado",
    descripcion: `Eliminó el sector ${sector.nombre} (${sueltas.count} ${sueltas.count === 1 ? "mesa quedó" : "mesas quedaron"} sin sector).`,
    entidad: "SectorComedor",
    entidadId: String(id),
    detalle: { mesasSinSector: sueltas.count },
  });

  refrescar();
  return {
    ok: true,
    mensaje: sueltas.count > 0 ? `Se eliminó el sector. ${sueltas.count} ${sueltas.count === 1 ? "mesa quedó" : "mesas quedaron"} sin sector.` : undefined,
  };
}

// ---------------------------------------------------------------------------
//  Las mesas
// ---------------------------------------------------------------------------

/**
 * Carga las mesas "desde" … "hasta" (por ejemplo del 1 al 10) en un sector. Las que todavía no existen se crean; las que ya
 * existían se pasan a ese sector (así se acomodan las mesas que se habían cargado antes de tener sectores). Los nombres de
 * las mesas son únicos en todo el local —la cuenta se reconoce por el nombre—, por eso el Patio sigue la numeración del
 * Salón (del 11 al 15) en vez de repetir el 1.
 */
export async function crearMesasPorRango(desde: number, hasta: number, sectorId: string | null): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const d = Math.floor(Number(desde));
  const h = Math.floor(Number(hasta));
  if (!Number.isFinite(d) || !Number.isFinite(h) || d < 1 || h < 1) {
    return { ok: false, error: "Escribí desde qué mesa y hasta cuál (números mayores a cero)." };
  }
  if (h < d) return { ok: false, error: "El “hasta” no puede ser menor que el “desde”." };
  if (h > MAXIMO_NUMERO) return { ok: false, error: `El número de mesa más alto es ${MAXIMO_NUMERO}.` };
  if (h - d + 1 > MAXIMO_POR_VEZ) return { ok: false, error: `Como mucho ${MAXIMO_POR_VEZ} mesas de una vez.` };

  const elegido = await resolverSector(db, sectorId);
  if (!elegido.ok) return elegido;
  const sector = elegido.sector;

  const existentes = await db.mesaComedor.findMany({ select: { id: true, clave: true, orden: true, sectorId: true } });
  const porClave = new Map(existentes.map((m) => [m.clave, m]));
  const nuevas: { nombre: string; clave: string }[] = [];
  const aMover: string[] = [];
  for (let i = d; i <= h; i++) {
    const nombre = String(i);
    const clave = claveDeMesa(nombre);
    const ya = porClave.get(clave);
    if (!ya) nuevas.push({ nombre, clave });
    else if ((ya.sectorId ?? null) !== (sector?.id ?? null)) aMover.push(ya.id);
  }
  if (nuevas.length === 0 && aMover.length === 0) {
    return { ok: true, mensaje: `Las mesas del ${d} al ${h} ya estaban cargadas${sector ? ` en ${sector.nombre}` : ""}: no se cambió nada.` };
  }
  if (existentes.length + nuevas.length > MAXIMO_TOTAL) {
    return { ok: false, error: `Un local puede tener hasta ${MAXIMO_TOTAL} mesas.` };
  }

  if (nuevas.length > 0) {
    const primerOrden = existentes.reduce((m, x) => Math.max(m, x.orden), 0) + 1;
    // skipDuplicates: si dos personas cargan a la vez, la segunda no falla por las que ya creó la primera.
    await db.mesaComedor.createMany({
      data: nuevas.map((m, i) => ({
        storeId: idLocal,
        nombre: m.nombre,
        clave: m.clave,
        orden: primerOrden + i,
        sectorId: sector?.id ?? null,
      })),
      skipDuplicates: true,
    });
  }
  if (aMover.length > 0) {
    await db.mesaComedor.updateMany({ where: { id: { in: aMover } }, data: { sectorId: sector?.id ?? null } });
  }

  const donde = sector ? ` en ${sector.nombre}` : "";
  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mesas_creadas",
    descripcion: `Cargó las mesas del ${d} al ${h}${donde}: ${nuevas.length} nuevas y ${aMover.length} que ya existían pasaron al sector.`,
    entidad: "MesaComedor",
    detalle: { desde: d, hasta: h, sector: sector?.nombre ?? null, creadas: nuevas.length, movidas: aMover.length },
  });

  refrescar();
  const partes: string[] = [];
  if (nuevas.length > 0) partes.push(`Se ${nuevas.length === 1 ? "creó 1 mesa" : `crearon ${nuevas.length} mesas`}${donde}`);
  if (aMover.length > 0) {
    partes.push(`${aMover.length} ${aMover.length === 1 ? "mesa que ya existía pasó" : "mesas que ya existían pasaron"} ${sector ? `a ${sector.nombre}` : "a “sin sector”"}`);
  }
  return { ok: true, mensaje: `${partes.join(". ")}.` };
}

/** Agrega una mesa con el nombre que se le quiera dar ("Terraza 2", "Barra"), en un sector si se elige. */
export async function agregarMesa(nombre: string, sectorId: string | null): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const limpio = normalizarMesa(nombre);
  if (!limpio) return { ok: false, error: "Escribí el nombre de la mesa (hasta 20 letras)." };

  const elegido = await resolverSector(db, sectorId);
  if (!elegido.ok) return elegido;

  const existentes = await db.mesaComedor.findMany({ select: { orden: true } });
  if (existentes.length >= MAXIMO_TOTAL) return { ok: false, error: `Un local puede tener hasta ${MAXIMO_TOTAL} mesas.` };
  const orden = existentes.reduce((m, x) => Math.max(m, x.orden), 0) + 1;

  try {
    await db.mesaComedor.create({
      data: { storeId: idLocal, nombre: limpio, clave: claveDeMesa(limpio), orden, sectorId: elegido.sector?.id ?? null },
    });
  } catch (err) {
    if (esDuplicada(err)) return { ok: false, error: YA_EXISTE };
    throw err;
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mesa_creada",
    descripcion: `Agregó la mesa ${limpio} al salón${elegido.sector ? ` (sector ${elegido.sector.nombre})` : ""}.`,
    entidad: "MesaComedor",
  });

  refrescar();
  return { ok: true };
}

/** Pasa varias mesas de una vez a un sector (o las deja sin sector): para acomodar las que ya estaban cargadas. */
export async function moverMesasASector(ids: string[], sectorId: string | null): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const pedidas = Array.isArray(ids) ? [...new Set(ids.map((i) => String(i)))].slice(0, MAXIMO_TOTAL) : [];
  if (pedidas.length === 0) return { ok: false, error: "Marcá al menos una mesa." };

  const elegido = await resolverSector(db, sectorId);
  if (!elegido.ok) return elegido;

  // Solo las que son de este local (el filtro del local va solo): un id ajeno simplemente no aparece.
  const propias = await db.mesaComedor.findMany({ where: { id: { in: pedidas } }, select: { id: true } });
  if (propias.length === 0) return { ok: false, error: "No encontré esas mesas." };

  await db.mesaComedor.updateMany({
    where: { id: { in: propias.map((m) => m.id) } },
    data: { sectorId: elegido.sector?.id ?? null },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mesas_movidas_de_sector",
    descripcion: `Pasó ${propias.length} ${propias.length === 1 ? "mesa" : "mesas"} ${elegido.sector ? `al sector ${elegido.sector.nombre}` : "a “sin sector”"}.`,
    entidad: "MesaComedor",
    detalle: { mesas: propias.length, sector: elegido.sector?.nombre ?? null },
  });

  refrescar();
  return {
    ok: true,
    mensaje: `${propias.length} ${propias.length === 1 ? "mesa pasó" : "mesas pasaron"} ${elegido.sector ? `a ${elegido.sector.nombre}` : "a “sin sector”"}.`,
  };
}

/** Pasa una mesa a otro sector (o la deja sin sector). Las cuentas abiertas no se tocan. */
export async function moverMesaASector(id: string, sectorId: string | null): Promise<ResultadoMesas> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const mesa = await db.mesaComedor.findFirst({ where: { id: String(id) }, select: { nombre: true } });
  if (!mesa) return { ok: false, error: "No encontré esa mesa." };
  const elegido = await resolverSector(db, sectorId);
  if (!elegido.ok) return elegido;

  await db.mesaComedor.updateMany({ where: { id: String(id) }, data: { sectorId: elegido.sector?.id ?? null } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: "mesa_movida_de_sector",
    descripcion: `Pasó la mesa ${mesa.nombre} ${elegido.sector ? `al sector ${elegido.sector.nombre}` : "a “sin sector”"}.`,
    entidad: "MesaComedor",
    entidadId: String(id),
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
