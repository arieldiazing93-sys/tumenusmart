import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import {
  REINTENTOS_MAXIMOS,
  SEGUNDOS_TRABAJO_COLGADO,
  TRABAJOS_POR_CONSULTA,
  contenidoParaImprimir,
} from "@/lib/comedor";

export const dynamic = "force-dynamic";

/**
 * La estación de caja pregunta si hay algo para imprimir (la pantalla "Impresión automática", cada pocos segundos).
 *
 * Hace tres cosas: avisa que esta estación está imprimiendo ahora (el latido que ve el mozo en su celular), reclama —de
 * forma atómica, para que dos estaciones no impriman lo mismo— los trabajos de las áreas que ESTA estación tiene asignadas
 * a una impresora, y los devuelve con el nombre de la impresora de Windows en la que tienen que salir.
 *
 * Una ruta de API no pasa por el layout del panel, y el middleware solo mira que exista la cookie: acá se valida la sesión
 * y el permiso de verdad, antes de tocar la base.
 */
export async function POST() {
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "comedor.gestionar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  // Todas las consultas de acá abajo quedan atadas a este local.
  const db = prismaDelLocal(await idLocalActual());
  const estacion = await estacionActual(db);
  if (!estacion) {
    return NextResponse.json({ ok: false, motivo: "sin_estacion" }, { headers: { "Cache-Control": "no-store" } });
  }

  const ahora = new Date();
  await db.estacion.updateMany({ where: { id: estacion.id }, data: { impresionVistaEn: ahora } });

  const mapeo = await db.estacionImpresora.findMany({
    where: { estacionId: estacion.id },
    select: { areaImpresionId: true, nombreImpresora: true },
  });
  const impresoraDeArea = new Map(mapeo.map((m) => [m.areaImpresionId, m.nombreImpresora]));
  const areaIds = [...impresoraDeArea.keys()];
  if (areaIds.length === 0) {
    return NextResponse.json(
      { ok: true, estacion: estacion.nombre, trabajos: [], sinImpresoras: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const colgado = new Date(ahora.getTime() - SEGUNDOS_TRABAJO_COLGADO * 1000);

  // Un trabajo que se quedó "imprimiendo" (la estación se cayó a la mitad) y ya agotó los intentos pasa a error, para que
  // se vea en la lista y se pueda reimprimir a mano.
  await db.trabajoImpresion.updateMany({
    where: { estado: "imprimiendo", reclamadoEn: { lt: colgado }, intentos: { gte: REINTENTOS_MAXIMOS } },
    data: { estado: "error", error: "No se llegó a imprimir. Reimprimilo desde la lista." },
  });

  // Lo que esta estación puede imprimir: de sus áreas, pendiente (o colgado hace rato) y con intentos por delante.
  const reclamable: Prisma.TrabajoImpresionWhereInput = {
    areaImpresionId: { in: areaIds },
    intentos: { lt: REINTENTOS_MAXIMOS },
    OR: [{ estado: "pendiente" }, { estado: "imprimiendo", reclamadoEn: { lt: colgado } }],
  };
  const candidatos = await db.trabajoImpresion.findMany({
    where: reclamable,
    orderBy: { createdAt: "asc" },
    take: TRABAJOS_POR_CONSULTA,
    select: { id: true },
  });

  const reclamados: string[] = [];
  for (const c of candidatos) {
    // La condición vuelve a ir en el update: si otra estación lo reclamó en el medio, acá no encuentra nada que cambiar.
    const r = await db.trabajoImpresion.updateMany({
      where: { id: c.id, ...reclamable },
      data: { estado: "imprimiendo", estacionId: estacion.id, reclamadoEn: ahora, intentos: { increment: 1 } },
    });
    if (r.count === 1) reclamados.push(c.id);
  }

  const trabajos = reclamados.length
    ? await db.trabajoImpresion.findMany({
        where: { id: { in: reclamados } },
        orderBy: { createdAt: "asc" },
        select: { id: true, titulo: true, areaImpresionId: true, contenido: true },
      })
    : [];

  return NextResponse.json(
    {
      ok: true,
      estacion: estacion.nombre,
      trabajos: trabajos.map((t) => ({
        id: t.id,
        titulo: t.titulo,
        // Vuelven los bytes 0x00 de los comandos de la impresora (en la base se guardan con una marca).
        contenido: contenidoParaImprimir(t.contenido),
        impresora: t.areaImpresionId ? (impresoraDeArea.get(t.areaImpresionId) ?? null) : null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
