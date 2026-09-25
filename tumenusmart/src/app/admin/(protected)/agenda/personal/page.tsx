import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Cabecera } from "@/components/ui";
import type { MiembroFila } from "@/lib/agenda-personal";
import { ListaPersonal } from "./ListaPersonal";

export const dynamic = "force-dynamic";

/**
 * El personal de la Reserva de turnos: quienes atienden a los clientes. Cada
 * uno tiene su propia agenda en el calendario. Solo el dueño lo arma.
 */
export default async function PersonalPage() {
  await pantallaConPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const filas = await db.miembroPersonal.findMany({
    // Los activos primero; entre ellos, en el orden en que se cargaron.
    orderBy: [{ activo: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nombre: true,
      apellido: true,
      telefono: true,
      profesion: true,
      fotoUrl: true,
      activo: true,
      comisionPorcentaje: true,
      _count: { select: { citas: true, servicios: true } },
    },
  });

  const miembros: MiembroFila[] = filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    apellido: f.apellido,
    telefono: f.telefono,
    profesion: f.profesion,
    fotoUrl: f.fotoUrl,
    activo: f.activo,
    servicios: f._count.servicios,
    citas: f._count.citas,
    comisionPorcentaje: f.comisionPorcentaje == null ? null : Number(f.comisionPorcentaje),
  }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Personal"
        bajada="Quienes atienden a tus clientes. Cada uno tiene su propia agenda en el calendario."
      />
      <ListaPersonal miembros={miembros} />
    </div>
  );
}
