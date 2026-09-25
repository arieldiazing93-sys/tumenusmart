import Link from "next/link";
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
  urlAgenda,
  type CitaAgenda,
  type EstadoCita,
  type ParametrosAgenda,
} from "@/lib/agenda";
import type { ActividadCita, EstadoCaja } from "@/lib/agenda-cita";
import { nombreCompleto } from "@/lib/agenda-personal";
import { completarHorario } from "@/lib/horario-trabajo";
import { normalizarColor } from "@/lib/servicios-agenda";
import { Cabecera, clasesBoton } from "@/components/ui";
import { BandaPersonal } from "./BandaPersonal";
import { BarraAgenda } from "./BarraAgenda";
import { IconoEstado } from "./IconosAgenda";
import {
  cargarActividadDeCita,
  cargarDetalleCita,
  cargarEstadoCaja,
  cargarPersonalDelPanel,
  cargarServiciosDelPanel,
} from "./cargar-cita";
import { PanelCita } from "./PanelCita";
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
 *
 * Tocar un turno agrega `&cita=<id>` y abre su detalle en el panel de la derecha:
 * ahí se edita la cita y se cobra (`&cita=nueva` abre el panel para anotar una).
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; fecha?: string; personal?: string; ocultar?: string; cita?: string }>;
}) {
  await pantallaConPermiso("agenda.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

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

  // Lo que se ve del período: un turno pedido por la web que espera el aviso por WhatsApp todavía no cuenta.
  const enElPeriodo = {
    inicio: limitesEnAsuncion({ desde: dias[0], hasta: dias[dias.length - 1] }),
    visible: true,
    ...(elegido ? { personalId: elegido.id } : {}),
  };

  const [citasBase, conteoPorEstado] = await Promise.all([
    db.cita.findMany({
      where: {
        ...enElPeriodo,
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
        serviciosTexto: true,
        ventaPosId: true,
        personal: { select: { nombre: true, apellido: true } },
        // El color de cada servicio (el que se eligió en Servicios): son los puntitos del turno.
        servicios: { select: { servicio: { select: { color: true } } } },
      },
    }),
    // Cuántos turnos hay de cada estado, también de los que el filtro tiene ocultos: son los numeritos de arriba.
    db.cita.groupBy({ by: ["estado"], where: enElPeriodo, _count: { _all: true } }),
  ]);
  const citas: CitaAgenda[] = citasBase.map((c) => ({
    id: c.id,
    personalId: c.personalId,
    personalNombre: nombreCompleto(c.personal),
    clienteNombre: c.clienteNombre,
    inicio: c.inicio,
    fin: c.fin,
    estado: c.estado,
    precio: c.precio == null ? null : Number(c.precio),
    serviciosTexto: c.serviciosTexto,
    cobrada: c.ventaPosId !== null,
    colores: c.servicios.flatMap((s) => (s.servicio ? [normalizarColor(s.servicio.color)] : [])),
  }));
  const cantidadPorEstado = new Map(conteoPorEstado.map((f) => [f.estado, f._count._all] as const));

  // Cuántos turnos tiene cada persona en el período (solo si se está viendo a todo el personal).
  const turnosPorPersona: Record<string, number> | null = elegido
    ? null
    : citas.reduce<Record<string, number>>((mapa, c) => {
        mapa[c.personalId] = (mapa[c.personalId] ?? 0) + 1;
        return mapa;
      }, {});

  // El panel de la derecha: el detalle de la cita tocada, o una cita nueva.
  let panel: React.ReactNode = null;
  if (sp.cita) {
    const detalle = sp.cita === "nueva" ? null : await cargarDetalleCita(db, sp.cita);
    // Una dirección con una cita que ya no existe simplemente no abre nada.
    if (sp.cita === "nueva" || detalle) {
      const [serviciosPanel, personalPanel, caja, actividad] = await Promise.all([
        cargarServiciosDelPanel(db),
        cargarPersonalDelPanel(db, detalle?.personalId ?? null),
        detalle ? cargarEstadoCaja(db, storeId) : Promise.resolve<EstadoCaja>({ listo: false, motivo: "sin_estacion" }),
        detalle ? cargarActividadDeCita(db, detalle) : Promise.resolve<ActividadCita[]>([]),
      ]);
      panel = (
        <PanelCita
          key={detalle?.id ?? "nueva"}
          cita={detalle}
          servicios={serviciosPanel}
          personal={personalPanel}
          caja={caja}
          actividad={actividad}
          parametros={parametros}
          hoy={hoy}
        />
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Calendario"
        bajada="Los turnos de tus clientes: quién viene, con quién y a qué hora. Tocá uno para ver su detalle y cobrarlo."
        acciones={
          <Link href={`${urlAgenda(parametros)}&cita=nueva`} scroll={false} className={clasesBoton("principal", "md")}>
            + Nueva cita
          </Link>
        }
      />

      <div className="rounded-2xl border border-linea bg-gradient-to-r from-superficie via-superficie to-brand-light/60 p-2.5 shadow-sm">
        <BarraAgenda
          parametros={parametros}
          hoy={hoy}
          titulo={tituloAgenda(vista, fecha)}
          personal={personal}
          vistaEnUrl={vistaPedida !== null}
        />
      </div>

      {/* Un color por estado, con cuántos turnos hay de cada uno. Tocar uno lo muestra u oculta en el calendario
          (lo oculto queda apagado y tachado). */}
      <ul aria-label="Estados de los turnos" className="flex flex-wrap items-center gap-2">
        {ESTADOS_CITA.map((e) => {
          const oculto = ocultar.includes(e.valor);
          const ocultarDespues: EstadoCita[] = oculto
            ? ocultar.filter((o) => o !== e.valor)
            : [...ocultar, e.valor];
          return (
            <li key={e.valor}>
              <Link
                href={urlAgenda(parametros, { ocultar: ocultarDespues })}
                scroll={false}
                title={`${oculto ? "Mostrar" : "Ocultar"} los turnos ${e.etiqueta.toLowerCase()}`}
                className={`inline-flex items-center gap-2 rounded-full border-2 py-1 pl-1 pr-1.5 text-[0.78rem] font-semibold transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${e.pastilla} ${
                  oculto ? "line-through opacity-50" : "shadow-sm"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full ${e.insignia}`}>
                  <IconoEstado estado={e.valor} tam={11} />
                </span>
                {e.etiqueta}
                <span className={`min-w-5 rounded-full px-1.5 text-center text-[0.7rem] font-bold ${e.cantidad}`}>
                  {cantidadPorEstado.get(e.valor) ?? 0}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="overflow-hidden rounded-2xl border border-linea bg-superficie shadow-media">
        <BandaPersonal personal={personal} elegidoId={elegido?.id ?? null} parametros={parametros} turnos={turnosPorPersona} />
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

      {panel}
    </div>
  );
}
