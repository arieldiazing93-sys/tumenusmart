"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { etiquetaDeEvento, limpiarEventos } from "@/lib/seguridad";

/**
 * Seguridad (Ajustes): qué acciones piden la contraseña de un usuario autorizado (ver src/lib/seguridad.ts). Solo lo cambia quien puede editar
 * la configuración (el dueño) y trabaja SOLO sobre el local de la sesión.
 */

type Resultado = { ok: true } | { ok: false; error: string };

export async function guardarSeguridad(eventos: unknown): Promise<Resultado> {
  const sesion = await exigirPermiso("configuracion.editar");
  const storeId = await idLocalActual();

  const limpios = limpiarEventos(eventos);
  if (!limpios.ok) return { ok: false, error: limpios.error };

  // Sin ningún usuario que pueda dar la contraseña, proteger una acción la dejaría imposible de hacer.
  if (limpios.eventos.length > 0) {
    const autorizantes = await prisma.usuario.count({ where: { storeId, activo: true, rol: "local" } });
    if (autorizantes === 0) {
      return { ok: false, error: "No hay ningún usuario dueño activo en este local para dar la contraseña. Activá uno antes de proteger acciones." };
    }
  }

  const antes = await prisma.store.findUnique({ where: { id: storeId }, select: { seguridadEventos: true } });
  if (!antes) return { ok: false, error: "No encontré el local." };

  await prisma.store.update({ where: { id: storeId }, data: { seguridadEventos: limpios.eventos } });

  const texto = (ids: string[]) => (ids.length > 0 ? ids.map(etiquetaDeEvento).join(", ") : "ninguno");
  await registrarBitacora(storeId, sesion, {
    modulo: "seguridad",
    accion: "seguridad_configurada",
    descripcion: `Configuró la seguridad. Piden contraseña de un usuario autorizado: ${texto(limpios.eventos)} (antes: ${texto(antes.seguridadEventos)}).`,
    entidad: "Store",
    entidadId: storeId,
    detalle: { eventos: limpios.eventos, antes: antes.seguridadEventos },
  });

  revalidatePath("/admin/seguridad");
  return { ok: true };
}
