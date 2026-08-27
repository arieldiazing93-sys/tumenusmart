import { prisma } from "@/lib/prisma";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { Cabecera } from "@/components/ui";
import { GestionEmpleados, type EmpleadoFila } from "./GestionEmpleados";

export const dynamic = "force-dynamic";

export default async function EmpleadosPage() {
  await pantallaConPermiso("empleados.gestionar");
  const storeId = await idLocalActual();

  // Se consulta por storeId Y por rol: acá solo se administran empleados. El
  // dueño no tiene por qué ver —ni poder tocar— al usuario dueño del local.
  const [store, empleados] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { nombre: true } }),
    prisma.usuario.findMany({
      where: { storeId, rol: "empleado" },
      orderBy: [{ activo: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        nombre: true,
        email: true,
        activo: true,
        ultimoIngreso: true,
      },
    }),
  ]);

  const filas: EmpleadoFila[] = empleados.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    email: e.email,
    activo: e.activo,
    ultimoIngreso: e.ultimoIngreso
      ? e.ultimoIngreso.toLocaleString("es-PY", {
          timeZone: ZONA_NEGOCIO,
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null,
  }));

  return (
    <div>
      <Cabecera
        titulo="Empleados"
        bajada="Cada persona entra con su propio correo, así sabés quién hizo cada cosa y podés quitarle el acceso el día que se va."
      />
      <GestionEmpleados empleados={filas} nombreLocal={store?.nombre ?? "el local"} />
    </div>
  );
}
