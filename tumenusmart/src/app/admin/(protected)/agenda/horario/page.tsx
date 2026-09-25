import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { nombreCompleto } from "@/lib/agenda-personal";
import { completarHorario, horarioEfectivo, type HorarioDia } from "@/lib/horario-trabajo";
import { BotonVolverAlGeneral } from "./BotonVolverAlGeneral";
import { EditorHorario } from "./EditorHorario";

export const dynamic = "force-dynamic";

const PASTILLA = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8rem] font-medium transition-colors";
const PASTILLA_ACTIVA = `${PASTILLA} border-azul bg-azul-luz text-azul-oscuro`;
const PASTILLA_INACTIVA = `${PASTILLA} border-linea text-tinta-media hover:border-azul/40 hover:text-tinta`;

/**
 * El horario de trabajo de la Reserva de turnos: qué días se atiende, de qué hora a qué hora y el descanso del
 * medio. Solo el dueño lo arma.
 *
 * Hay un horario general del negocio, que usa todo el personal que no tiene el suyo, y cada persona puede tener
 * un horario propio (un turno completo, uno intermedio, uno de tarde y noche, con su descanso a otra hora).
 * `?personal=<id>` abre el de esa persona; sin eso se ve el general. Si todavía no se guardó nada, se muestra un
 * horario de ejemplo (lunes a sábado de 9 a 18, descanso de 13 a 14) que recién cuenta cuando se aprieta Guardar.
 */
export default async function HorarioTrabajoPage({
  searchParams,
}: {
  searchParams: Promise<{ personal?: string }>;
}) {
  await pantallaConPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());
  const sp = await searchParams;

  const columnasDeHorario = {
    diaSemana: true,
    trabaja: true,
    inicio: true,
    fin: true,
    descansa: true,
    descansoInicio: true,
    descansoFin: true,
  } as const;
  const [generales, personal, propios] = await Promise.all([
    db.horarioTrabajo.findMany({ select: columnasDeHorario }),
    db.miembroPersonal.findMany({
      where: { activo: true },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, apellido: true },
    }),
    db.horarioPersonal.findMany({ select: { personalId: true, ...columnasDeHorario } }),
  ]);
  const propioDe = new Map<string, HorarioDia[]>();
  for (const { personalId, ...dia } of propios) {
    const lista = propioDe.get(personalId) ?? [];
    lista.push(dia);
    propioDe.set(personalId, lista);
  }

  // Un id que no es de este local (o que ya no está activo) simplemente abre el horario general.
  const persona = personal.find((p) => p.id === sp.personal) ?? null;
  const propioDeLaPersona = persona ? (propioDe.get(persona.id) ?? []) : [];
  const tienePropio = propioDeLaPersona.length > 0;
  const inicial = persona ? horarioEfectivo(propioDeLaPersona, generales) : completarHorario(generales);
  const nombre = persona ? nombreCompleto(persona) : "";

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Horario de trabajo"
        bajada={
          persona
            ? `Horario de ${nombre} – Horas de trabajo y Descanso`
            : "Horario general – Horas de trabajo y Descanso"
        }
        acciones={
          <BotonEnlace href="/admin/agenda/personal" tono="navegar" tam="md">
            Volver a Personal
          </BotonEnlace>
        }
      />

      {/* ---------- de quién es el horario: el general o el de cada persona ---------- */}
      <nav aria-label="Horario de" className="flex flex-wrap gap-1.5">
        <Link
          href="/admin/agenda/horario"
          aria-current={persona ? undefined : "page"}
          className={persona ? PASTILLA_INACTIVA : PASTILLA_ACTIVA}
        >
          Horario general
        </Link>
        {personal.map((p) => {
          const elegida = persona?.id === p.id;
          return (
            <Link
              key={p.id}
              href={`/admin/agenda/horario?personal=${p.id}`}
              aria-current={elegida ? "page" : undefined}
              className={elegida ? PASTILLA_ACTIVA : PASTILLA_INACTIVA}
            >
              {nombreCompleto(p)}
              {propioDe.has(p.id) && (
                <span aria-label="Tiene horario propio" title="Tiene horario propio" className="h-1.5 w-1.5 rounded-full bg-azul" />
              )}
            </Link>
          );
        })}
      </nav>

      {persona ? (
        tienePropio ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-azul/25 bg-azul-luz px-3.5 py-2.5">
            <p className="text-[0.82rem] leading-snug text-azul-oscuro">
              {nombre} tiene su propio horario: lo que cambies acá vale solo para esta persona.
            </p>
            <BotonVolverAlGeneral personalId={persona.id} nombre={persona.nombre} />
          </div>
        ) : (
          <p className="rounded-lg border border-linea bg-papel-suave px-3.5 py-2.5 text-[0.82rem] leading-snug text-tinta-media">
            Hoy {nombre} usa el horario general. Cuando guardes cambios acá, va a tener su horario propio.
          </p>
        )
      ) : (
        <p className="rounded-lg border border-linea bg-papel-suave px-3.5 py-2.5 text-[0.82rem] leading-snug text-tinta-media">
          Es el horario que usa el personal que no tiene el suyo. Para darle a alguien un horario distinto (un turno
          intermedio, de tarde y noche, con su descanso a otra hora), elegí su nombre arriba o entrá a Personal → Ver.
        </p>
      )}

      <EditorHorario key={persona?.id ?? "general"} inicial={inicial} personalId={persona?.id ?? null} />
    </div>
  );
}
