import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera } from "@/components/ui";
import type { ColaboradorFila } from "@/lib/asistencia";
import { ListaColaboradores } from "./ListaColaboradores";

export const dynamic = "force-dynamic";

/**
 * Las personas que marcan su asistencia en el celular fijo del local. El dueño las da de alta EN PERSONA:
 * les saca la selfie de referencia y les elige un PIN de 4 a 6 números.
 */
export default async function ColaboradoresPage() {
  await pantallaConPermiso("asistencia.gestionar");
  const db = prismaDelLocal(await idLocalActual());

  const filas = await db.colaborador.findMany({
    // Los activos primero; entre ellos, por nombre.
    orderBy: [{ activo: "desc" }, { nombre: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      nombre: true,
      apellido: true,
      cargo: true,
      fotoUrl: true,
      horaEntrada: true,
      toleranciaMin: true,
      activo: true,
      bloqueadoHasta: true,
    },
  });

  const ahora = new Date();
  const colaboradores: ColaboradorFila[] = filas.map(({ bloqueadoHasta, ...f }) => ({
    ...f,
    bloqueado: bloqueadoHasta !== null && bloqueadoHasta > ahora,
  }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Colaboradores"
        bajada="Las personas que marcan entrada, almuerzo y salida en el celular fijo. Dalas de alta en persona: sacales la selfie y elegí su PIN."
        acciones={
          <BotonEnlace href="/admin/asistencia/celular" tono="navegar" tam="md">
            Celular fijo
          </BotonEnlace>
        }
      />
      <ListaColaboradores colaboradores={colaboradores} />
    </div>
  );
}
