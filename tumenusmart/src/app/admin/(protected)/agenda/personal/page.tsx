import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera } from "@/components/ui";
import type { MiembroFila } from "@/lib/agenda-personal";
import { completarHorario, type HorarioDia } from "@/lib/horario-trabajo";
import { ListaPersonal } from "./ListaPersonal";
import { PedirPersonalEnVentaToggle } from "./PedirPersonalEnVentaToggle";

export const dynamic = "force-dynamic";

/**
 * El personal de la Reserva de turnos: quienes atienden a los clientes. Cada
 * uno tiene su propia agenda en el calendario. Solo el dueño lo arma.
 */
export default async function PersonalPage() {
  await pantallaConPermiso("agenda.configurar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  // Store no está entre los modelos por local: se lee con el cliente global.
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { pedirPersonalEnVenta: true } });

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

  // El horario general del negocio y el propio de cada persona que lo tenga (el resto usa el general).
  const columnasDeHorario = {
    diaSemana: true,
    trabaja: true,
    inicio: true,
    fin: true,
    descansa: true,
    descansoInicio: true,
    descansoFin: true,
  } as const;
  const [filasGenerales, filasPropias] = await Promise.all([
    db.horarioTrabajo.findMany({ select: columnasDeHorario }),
    db.horarioPersonal.findMany({ select: { personalId: true, ...columnasDeHorario } }),
  ]);
  const propioDe = new Map<string, HorarioDia[]>();
  for (const { personalId, ...dia } of filasPropias) {
    const lista = propioDe.get(personalId) ?? [];
    lista.push(dia);
    propioDe.set(personalId, lista);
  }

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
    horarioPropio: propioDe.has(f.id) ? completarHorario(propioDe.get(f.id) ?? []) : null,
  }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Personal"
        bajada="Quienes atienden a tus clientes. Cada uno tiene su propia agenda en el calendario."
        acciones={
          <BotonEnlace href="/admin/agenda/personal/reporte" tono="navegar" tam="md">
            Reporte de personal
          </BotonEnlace>
        }
      />
      <PedirPersonalEnVentaToggle activa={store?.pedirPersonalEnVenta ?? false} />
      <ListaPersonal miembros={miembros} horarioGeneral={completarHorario(filasGenerales)} />
    </div>
  );
}
