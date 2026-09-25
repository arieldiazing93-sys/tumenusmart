import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { limitesEnAsuncion } from "@/lib/rango-dias";
import { claveDiaAsuncion } from "@/lib/timezone";
import {
  ESTADOS_CITA,
  diasDeVista,
  parsearFecha,
  parsearOcultar,
  parsearVista,
  tituloAgenda,
  type CitaAgenda,
  type ParametrosAgenda,
} from "@/lib/agenda";
import { nombreCompleto } from "@/lib/agenda-personal";
import { completarHorario } from "@/lib/horario-trabajo";
import { Cabecera } from "@/components/ui";
import { BandaPersonal } from "./BandaPersonal";
import { BarraAgenda } from "./BarraAgenda";
import { VistaHoras } from "./VistaHoras";
import { VistaMes } from "./VistaMes";

export const dynamic = "force-dynamic";

/** Tope de turnos que se dibujan de una vez (un mes muy cargado): más que eso no se lee igual. */
const MAXIMO_TURNOS = 2000;

/**
 * La Agenda de la Reserva de turnos: el calendario con los turnos del negocio,
 * en vista de Día, Semana o Mes. Se puede mirar a todo el personal junto o a un
 * solo miembro, y ocultar los turnos por estado.
 *
 * Todo lo que se elige (vista, fecha, personal, filtros) vive en la dirección
 * de la página: `?vista=semana&fecha=2026-09-24&personal=…&ocultar=cancelada`.
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; fecha?: string; personal?: string; ocultar?: string }>;
}) {
  await pantallaConPermiso("agenda.ver");
  const db = prismaDelLocal(await idLocalActual());

  const sp = await searchParams;
  const ahora = new Date();
  const hoy = claveDiaAsuncion(ahora);
  const vistaPedida = parsearVista(sp.vista);
  const vista = vistaPedida ?? "semana";
  const fecha = parsearFecha(sp.fecha, hoy);
  const ocultar = parsearOcultar(sp.ocultar);

  const personalDb = await db.miembroPersonal.findMany({
    where: { activo: true },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, apellido: true, fotoUrl: true },
  });
  const personal = personalDb.map((p) => ({ id: p.id, nombre: nombreCompleto(p), fotoUrl: p.fotoUrl }));
  // Un id que no es del personal de este local (o que ya no está) se ignora: se ve a todos.
  const indiceElegido = personal.findIndex((p) => p.id === sp.personal);
  const elegido = indiceElegido >= 0 ? personal[indiceElegido] : null;

  const parametros: ParametrosAgenda = { vista, fecha, personal: elegido?.id ?? null, ocultar };

  const dias = diasDeVista(vista, fecha);

  // El horario de trabajo, si ya se configuró: el calendario sombrea lo que queda fuera de él.
  const filasHorario = await db.horarioTrabajo.findMany({
    select: {
      diaSemana: true,
      trabaja: true,
      inicio: true,
      fin: true,
      descansa: true,
      descansoInicio: true,
      descansoFin: true,
    },
  });
  const horarios = filasHorario.length > 0 ? completarHorario(filasHorario) : null;

  const citasBase = await db.cita.findMany({
    where: {
      inicio: limitesEnAsuncion({ desde: dias[0], hasta: dias[dias.length - 1] }),
      ...(elegido ? { personalId: elegido.id } : {}),
      ...(ocultar.length > 0 ? { estado: { notIn: ocultar } } : {}),
    },
    orderBy: [{ inicio: "asc" }, { id: "asc" }],
    take: MAXIMO_TURNOS,
    select: {
      id: true,
      personalId: true,
      clienteNombre: true,
      inicio: true,
      fin: true,
      estado: true,
      precio: true,
      personal: { select: { nombre: true, apellido: true } },
    },
  });
  const citas: CitaAgenda[] = citasBase.map((c) => ({
    id: c.id,
    personalId: c.personalId,
    personalNombre: nombreCompleto(c.personal),
    clienteNombre: c.clienteNombre,
    inicio: c.inicio,
    fin: c.fin,
    estado: c.estado,
    precio: c.precio == null ? null : Number(c.precio),
  }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Calendario"
        bajada="Los turnos de tus clientes: quién viene, con quién y a qué hora."
      />

      <BarraAgenda
        parametros={parametros}
        hoy={hoy}
        titulo={tituloAgenda(vista, fecha)}
        personal={personal}
        vistaEnUrl={vistaPedida !== null}
      />

      {/* Los colores de los estados: sirven de leyenda, y lo que está oculto por el filtro se ve apagado. */}
      <ul aria-label="Estados de los turnos" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.76rem] text-tinta-media">
        {ESTADOS_CITA.map((e) => (
          <li
            key={e.valor}
            className={`flex items-center gap-1.5 ${ocultar.includes(e.valor) ? "line-through opacity-40" : ""}`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${e.punto}`} />
            {e.etiqueta}
          </li>
        ))}
      </ul>

      <section className="overflow-hidden rounded-xl border border-linea bg-superficie shadow-sm">
        <BandaPersonal
          nombre={elegido?.nombre ?? null}
          fotoUrl={elegido?.fotoUrl ?? null}
          indice={indiceElegido}
          cantidad={personal.length}
        />
        {vista === "mes" ? (
          <VistaMes fecha={fecha} citas={citas} hoy={hoy} parametros={parametros} />
        ) : (
          <VistaHoras
            dias={dias}
            citas={citas}
            hoy={hoy}
            ahora={ahora}
            parametros={parametros}
            horarios={horarios}
            mostrarPersonal={!elegido && personal.length > 1}
          />
        )}
      </section>

      {citas.length === 0 && (
        <p className="text-center text-[0.85rem] text-tinta-media">
          {ocultar.length > 0 ? "No hay turnos en este período con los filtros elegidos." : "No hay turnos en este período."}
        </p>
      )}
    </div>
  );
}
