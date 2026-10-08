"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { etiquetaDeEvento, limpiarEventos } from "@/lib/seguridad";

/**
 * Seguridad (Ajustes): qué acciones piden la contraseña de un usuario autorizado y qué eventos puede autorizar el perfil "Caja" (ver
 * src/lib/seguridad.ts). Solo lo cambia quien puede editar la configuración (el dueño) y trabaja SOLO sobre el local de la sesión.
 */

type Resultado = { ok: true } | { ok: false; error: string };

/**
 * Guarda las dos listas de una vez: `eventos` (los que piden contraseña) y `permisosCaja` (los que el perfil Caja puede autorizar con su
 * propia contraseña). El perfil Administrador no se guarda: siempre puede todos.
 */
export async function guardarSeguridad(eventos: unknown, permisosCaja: unknown): Promise<Resultado> {
  const sesion = await exigirPermiso("configuracion.editar");
  const storeId = await idLocalActual();

  const limpios = limpiarEventos(eventos);
  if (!limpios.ok) return { ok: false, error: limpios.error };
  const limpiosCaja = limpiarEventos(permisosCaja);
  if (!limpiosCaja.ok) return { ok: false, error: limpiosCaja.error };

  // Sin ningún usuario administrador activo (el dueño), proteger una acción la dejaría imposible de autorizar.
  if (limpios.eventos.length > 0) {
    const administradores = await prisma.usuario.count({ where: { storeId, activo: true, rol: "local" } });
    if (administradores === 0) {
      return { ok: false, error: "No hay ningún usuario dueño activo en este local para dar la contraseña. Activá uno antes de proteger acciones." };
    }
  }

  const antes = await prisma.store.findUnique({ where: { id: storeId }, select: { seguridadEventos: true, seguridadPermisosCaja: true } });
  if (!antes) return { ok: false, error: "No encontré el local." };

  await prisma.store.update({
    where: { id: storeId },
    data: { seguridadEventos: limpios.eventos, seguridadPermisosCaja: limpiosCaja.eventos },
  });

  const texto = (ids: string[]) => (ids.length > 0 ? ids.map(etiquetaDeEvento).join(", ") : "ninguno");
  await registrarBitacora(storeId, sesion, {
    modulo: "seguridad",
    accion: "seguridad_configurada",
    descripcion:
      `Configuró la seguridad. Piden contraseña: ${texto(limpios.eventos)} (antes: ${texto(antes.seguridadEventos)}). ` +
      `El perfil Caja puede autorizar: ${texto(limpiosCaja.eventos)} (antes: ${texto(antes.seguridadPermisosCaja)}).`,
    entidad: "Store",
    entidadId: storeId,
    detalle: {
      eventos: limpios.eventos,
      permisosCaja: limpiosCaja.eventos,
      antes: { eventos: antes.seguridadEventos, permisosCaja: antes.seguridadPermisosCaja },
    },
  });

  revalidatePath("/admin/seguridad");
  return { ok: true };
}
