import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import {
  analizar,
  elegirIdeaDeLaSemana,
  lunesDeLaSemana,
  type PedidoAnalisis,
  type ProductoAnalisis,
} from "@/lib/analista";

export const dynamic = "force-dynamic";
/** El recorrido de varios locales no entra en el tiempo por defecto. */
export const maxDuration = 60;

const DIAS_DE_HISTORIA = 180;
const TOPE_PEDIDOS = 3000;
/** Cuántas semanas hacia atrás se miran para no repetir la misma idea. */
const SEMANAS_SIN_REPETIR = 4;

/**
 * Genera la idea de la semana de cada local activo.
 *
 * La dispara Vercel los lunes a la mañana. También se puede llamar a mano
 * desde el navegador para probar, si se manda la clave.
 *
 * Es idempotente: correrla dos veces el mismo lunes actualiza la idea de esa
 * semana en vez de duplicarla, y nunca borra la marca de "ya la vio" si la
 * idea elegida es la misma.
 */
export async function GET(request: NextRequest) {
  const noAutorizado = revisarClave(request);
  if (noAutorizado) return noAutorizado;

  const ahora = new Date();
  const semana = lunesDeLaSemana(ahora, ZONA_NEGOCIO);
  const desde = new Date(ahora.getTime() - DIAS_DE_HISTORIA * 24 * 60 * 60 * 1000);

  // Un local suspendido o vencido no se analiza: no está atendiendo.
  const locales = await prisma.store.findMany({
    where: {
      estado: { not: "suspendido" },
      OR: [{ vencimiento: null }, { vencimiento: { gt: ahora } }],
    },
    select: { id: true, nombre: true, slug: true },
  });

  const resumen: {
    local: string;
    resultado: "generada" | "sin datos" | "sin ideas" | "error";
    idea?: string;
  }[] = [];

  for (const local of locales) {
    try {
      const db = prismaDelLocal(local.id);

      const [pedidosCrudos, productosCrudos, previas] = await Promise.all([
        db.order.findMany({
          where: { createdAt: { gte: desde } },
          include: { items: true },
          orderBy: { createdAt: "desc" },
          take: TOPE_PEDIDOS,
        }),
        db.product.findMany({ include: { category: true } }),
        db.ideaSemanal.findMany({
          orderBy: { semana: "desc" },
          take: SEMANAS_SIN_REPETIR,
          select: { clave: true, semana: true },
        }),
      ]);

      const pedidos: PedidoAnalisis[] = pedidosCrudos.map((p) => ({
        id: p.id,
        creado: p.createdAt,
        estado: p.estado,
        enviado: p.enviadoWhatsapp,
        tipoEntrega: p.tipoEntrega,
        total: Number(p.total),
        costoEnvio: Number(p.costoEnvio),
        clienteNombre: p.clienteNombre,
        clienteTelefono: p.clienteTelefono,
        items: p.items.map((i) => ({
          productId: i.productId,
          nombre: i.nombreProducto,
          cantidad: i.cantidad,
          precioUnitario: Number(i.precioUnitario),
        })),
      }));

      const productos: ProductoAnalisis[] = productosCrudos.map((pr) => ({
        id: pr.id,
        nombre: pr.nombre,
        categoriaId: pr.categoryId,
        categoriaNombre: pr.category.nombre,
        precio: Number(pr.precio),
        costo: pr.costo != null ? Number(pr.costo) : null,
        disponible: pr.disponible,
        creado: pr.createdAt,
      }));

      const resultado = analizar({ pedidos, productos, ahora, zona: ZONA_NEGOCIO });

      if (resultado.faltaData) {
        resumen.push({ local: local.slug, resultado: "sin datos" });
        continue;
      }

      // No se cuenta la semana actual como "reciente": si la tarea se corre
      // dos veces el mismo lunes, la idea ya guardada haría que se elija otra.
      const clavesRecientes = previas
        .filter((p) => p.semana !== semana)
        .map((p) => p.clave);

      const elegida = elegirIdeaDeLaSemana(resultado.ideas, clavesRecientes);
      if (!elegida) {
        resumen.push({ local: local.slug, resultado: "sin ideas" });
        continue;
      }

      const yaGuardada = await db.ideaSemanal.findFirst({
        where: { semana },
        select: { id: true, clave: true },
      });

      const datos = {
        clave: elegida.clave,
        tipo: elegida.tipo,
        titulo: elegida.titulo,
        dato: elegida.dato,
        accion: elegida.accion,
        confianza: elegida.confianza,
        detalle: elegida.detalle ? JSON.stringify(elegida.detalle) : null,
      };

      if (yaGuardada) {
        await db.ideaSemanal.update({
          where: { id: yaGuardada.id },
          data: {
            ...datos,
            // Si cambió la idea, vuelve a estar sin ver. Si es la misma, se
            // respeta que el dueño ya la haya leído.
            ...(yaGuardada.clave !== elegida.clave ? { vistaEn: null } : {}),
          },
        });
      } else {
        await db.ideaSemanal.create({
          data: { ...datos, semana, storeId: local.id },
        });
      }

      resumen.push({ local: local.slug, resultado: "generada", idea: elegida.clave });
    } catch (error) {
      console.error(`[idea-semanal] falló el local ${local.slug}:`, error);
      // Un local que falla no puede frenar a los demás.
      resumen.push({ local: local.slug, resultado: "error" });
    }
  }

  return NextResponse.json({ semana, locales: locales.length, resumen });
}

/**
 * Solo Vercel —o alguien con la clave— puede disparar esto.
 *
 * Sin la comprobación, cualquiera podría llamar la dirección repetidamente y
 * hacer trabajar la base de todos los locales.
 */
function revisarClave(request: NextRequest): NextResponse | null {
  const esperado = process.env.CRON_SECRET;

  if (!esperado) {
    // En producción se cierra por las dudas; en desarrollo se deja pasar para
    // poder probar sin configurar nada.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Falta configurar CRON_SECRET" },
        { status: 500 }
      );
    }
    return null;
  }

  const cabecera = request.headers.get("authorization");
  if (cabecera === `Bearer ${esperado}`) return null;

  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}
