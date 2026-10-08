import { pantallaConPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { perfilDeUsuario } from "@/lib/seguridad";
import { Cabecera } from "@/components/ui";
import { SeguridadPanel } from "./SeguridadPanel";

export const dynamic = "force-dynamic";

/**
 * Seguridad (Ajustes): el dueño tilda qué acciones piden la contraseña de un usuario autorizado (descuentos, cancelar productos,
 * cancelaciones, reapertura de cuentas) y qué eventos puede autorizar cada perfil de seguridad (Administrador: todos; Caja: los que
 * se tilden). Las reglas están en src/lib/seguridad.ts y las exige el servidor en cada acción.
 */
export default async function SeguridadPage() {
  await pantallaConPermiso("configuracion.editar");
  const storeId = await idLocalActual();

  const [local, usuarios] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { seguridadEventos: true, seguridadPermisosCaja: true } }),
    prisma.usuario.findMany({
      where: { storeId, activo: true, rol: { in: ["local", "empleado"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, nombre: true, email: true, rol: true, perfilSeguridad: true },
    }),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Seguridad"
        bajada="Elegí qué acciones piden contraseña y quién puede dar esa autorización: el perfil Administrador puede todo y el perfil Caja solo lo que le tildes. Así nadie que se siente en una caja abierta puede cancelar o dar un descuento sin la contraseña de quien corresponde."
      />
      <SeguridadPanel
        activos={local?.seguridadEventos ?? []}
        permisosCaja={local?.seguridadPermisosCaja ?? []}
        personas={usuarios.map((u) => ({
          id: u.id,
          nombre: u.nombre?.trim() || u.email,
          perfil: perfilDeUsuario(u.rol, u.perfilSeguridad),
        }))}
      />
    </div>
  );
}
