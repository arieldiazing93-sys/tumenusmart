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
      haceAlmuerzo: true,
      activo: true,
      pinClave: true,
    },
  });

  // Del PIN solo se sabe si lo tiene o no: nunca sale su huella del servidor.
  const colaboradores: ColaboradorFila[] = filas.map(({ pinClave, ...f }) => ({ ...f, sinPin: pinClave === null }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Colaboradores"
        bajada="Las personas que marcan entrada, almuerzo y salida en el celular fijo. Dalas de alta en persona: sacales la selfie y elegí su PIN, que es lo que las identifica (no puede repetirse)."
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
