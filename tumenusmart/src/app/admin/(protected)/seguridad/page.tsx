import { pantallaConPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera } from "@/components/ui";
import { SeguridadPanel } from "./SeguridadPanel";

export const dynamic = "force-dynamic";

/**
 * Seguridad (Ajustes): el dueño tilda qué acciones piden la contraseña de un usuario autorizado (descuentos, cancelar productos,
 * cancelaciones, reapertura de cuentas). Las reglas están en src/lib/seguridad.ts y las exige el servidor en cada acción.
 */
export default async function SeguridadPage() {
  await pantallaConPermiso("configuracion.editar");
  const storeId = await idLocalActual();

  const [local, autorizantes] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { seguridadEventos: true } }),
    prisma.usuario.findMany({
      where: { storeId, activo: true, rol: "local" },
      orderBy: { createdAt: "asc" },
      select: { id: true, nombre: true, email: true },
    }),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Seguridad"
        bajada="Elegí qué acciones piden la contraseña de un usuario autorizado antes de hacerse. Así nadie puede cancelar o dar un descuento desde una caja abierta sin que el dueño lo autorice."
      />
      <SeguridadPanel
        activos={local?.seguridadEventos ?? []}
        autorizantes={autorizantes.map((u) => ({ id: u.id, nombre: u.nombre?.trim() || u.email }))}
      />
    </div>
  );
}
