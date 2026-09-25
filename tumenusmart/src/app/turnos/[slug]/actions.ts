"use server";

import type { Prisma } from "@prisma/client";
import { diaLargo, horaDeMinutos } from "@/lib/agenda";
import { claveSumarDias } from "@/lib/calendario";
import { DIAS_ADELANTE } from "@/lib/disponibilidad";
import { esHoraValida, aMinutos } from "@/lib/horario-trabajo";
import { completarCampos } from "@/lib/pagina-reservas";
import { prisma } from "@/lib/prisma";
import {
  DATOS_CLIENTE_VACIOS,
  codigoDeCita,
  mensajeWhatsappCita,
  validarDatosCliente,
  type CitaCreada,
  type DatosCliente,
  type ProximaDisponibilidad,
} from "@/lib/reserva-cliente";
import {
  cargarPaginaPublica,
  cargarPersonalPublico,
  disponibilidadDePersonal,
  resolverSeleccion,
} from "@/lib/reservas-publicas";
import { claveDiaAsuncion, instanteAsuncionDesdeTexto } from "@/lib/timezone";
import { construirLinkWhatsapp } from "@/lib/whatsapp";

/**
 * Las acciones de la reserva pública. Las usa el cliente desde su celular, sin
 * iniciar sesión: no hay usuario que consultar. Se protegen de otra forma:
 *
 *  - el local sale SIEMPRE de la dirección de la página (`slug`), nunca de algo
 *    que mande el navegador, y la página tiene que estar habilitada;
 *  - todo lo que llega (servicios, profesional, día, hora, datos) se vuelve a
 *    verificar contra la base: nada se da por bueno;
 *  - al crear la cita se revisa de nuevo que el horario siga libre, con un
 *    candado por profesional, para que dos clientes no tomen la misma hora.
 */

const NO_DISPONIBLE = "Las reservas no están disponibles en este momento.";

export type ResultadoProximas =
  | { ok: true; proximas: ProximaDisponibilidad[] }
  | { ok: false; error: string };

export type ResultadoHoras =
  | { ok: true; /** día → horas libres ("09:00", "09:15"…). Los días sin horas no aparecen. */ dias: Record<string, string[]> }
  | { ok: false; error: string };

export type DatosCitaPublica = {
  servicioIds: string[];
  personalId: string;
  /** "YYYY-MM-DD" */
  fecha: string;
  /** "HH:MM" */
  hora: string;
  cliente: DatosCliente;
};

export type ResultadoCita =
  | { ok: true; cita: CitaCreada }
  | { ok: false; error: string; /** El horario se ocupó justo antes: hay que elegir otro. */ horarioOcupado?: boolean };

/** Para cada profesional que realiza todos los servicios: cuándo es su próxima hora libre. */
export async function proximaDisponibilidad(slug: string, servicioIds: string[]): Promise<ResultadoProximas> {
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina) return { ok: false, error: NO_DISPONIBLE };

  const resuelta = await resolverSeleccion(prisma, pagina.storeId, servicioIds);
  if (!resuelta.ok) return resuelta;
  const { seleccion } = resuelta;

  const disponibilidad = await disponibilidadDePersonal(
    prisma,
    pagina.storeId,
    seleccion,
    seleccion.personalIds,
    new Date()
  );

  const proximas = seleccion.personalIds.map((personalId): ProximaDisponibilidad => {
    const dias = disponibilidad.get(personalId) ?? {};
    const primerDia = Object.keys(dias).sort()[0];
    return {
      personalId,
      fecha: primerDia ?? null,
      horas: primerDia ? dias[primerDia].slice(0, 5).map(horaDeMinutos) : [],
    };
  });
  return { ok: true, proximas };
}

/** Las horas libres de un profesional en los próximos días, para elegir día y hora. */
export async function horasDisponibles(
  slug: string,
  servicioIds: string[],
  personalId: string
): Promise<ResultadoHoras> {
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina) return { ok: false, error: NO_DISPONIBLE };

  const resuelta = await resolverSeleccion(prisma, pagina.storeId, servicioIds);
  if (!resuelta.ok) return resuelta;
  const { seleccion } = resuelta;
  if (typeof personalId !== "string" || !seleccion.personalIds.includes(personalId)) {
    return { ok: false, error: "Ese profesional no realiza los servicios elegidos." };
  }

  const disponibilidad = await disponibilidadDePersonal(prisma, pagina.storeId, seleccion, [personalId], new Date());
  const enMinutos = disponibilidad.get(personalId) ?? {};
  const dias: Record<string, string[]> = {};
  for (const [dia, minutos] of Object.entries(enMinutos)) dias[dia] = minutos.map(horaDeMinutos);
  return { ok: true, dias };
}

/**
 * Crea la cita. Vuelve a comprobar todo (servicios, profesional, día, hora libre
 * y los datos del cliente contra los campos que pide el negocio).
 *
 * Según cómo lo configuró el negocio, la cita aparece en su calendario apenas se
 * crea, o recién cuando el cliente manda el aviso por WhatsApp (mientras tanto
 * reserva el horario un rato, pero no se ve).
 */
export async function crearCitaPublica(slug: string, datos: DatosCitaPublica): Promise<ResultadoCita> {
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina) return { ok: false, error: NO_DISPONIBLE };
  const storeId = pagina.storeId;

  if (!datos || typeof datos !== "object") return { ok: false, error: "Lo que llegó no es válido. Recargá la página." };

  const resuelta = await resolverSeleccion(prisma, storeId, datos.servicioIds);
  if (!resuelta.ok) return resuelta;
  const { seleccion } = resuelta;

  const personalId = typeof datos.personalId === "string" ? datos.personalId : "";
  if (!seleccion.personalIds.includes(personalId)) {
    return { ok: false, error: "Ese profesional no realiza los servicios elegidos." };
  }

  const fecha = typeof datos.fecha === "string" ? datos.fecha : "";
  const hora = typeof datos.hora === "string" ? datos.hora : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !esHoraValida(hora)) {
    return { ok: false, error: "El día o la hora no son válidos." };
  }

  const ahora = new Date();
  const hoy = claveDiaAsuncion(ahora);
  if (fecha < hoy || fecha > claveSumarDias(hoy, DIAS_ADELANTE - 1)) {
    return { ok: false, error: "Esa fecha no está disponible.", horarioOcupado: true };
  }

  const campos = completarCampos(pagina.campos);
  const validado = validarDatosCliente(campos, datos.cliente ?? DATOS_CLIENTE_VACIOS);
  if (!validado.ok) return validado;
  const cliente = validado.cliente;

  // Freno a los pedidos en cadena con el mismo número: unas pocas citas pendientes alcanzan.
  if (cliente.telefono) {
    const pendientes = await prisma.cita.count({
      where: {
        storeId,
        origen: "web",
        clienteTelefono: cliente.telefono,
        estado: { in: ["pendiente", "proxima"] },
        inicio: { gte: ahora },
      },
    });
    if (pendientes >= 3) {
      return {
        ok: false,
        error: "Ya tenés varias citas pendientes con este número. Esperá a que el negocio las confirme.",
      };
    }
  }

  const inicio = instanteAsuncionDesdeTexto(`${fecha}T${hora}`);
  if (!inicio) return { ok: false, error: "El día o la hora no son válidos." };
  const minutosInicio = aMinutos(hora);
  const fin = new Date(inicio.getTime() + seleccion.duracion * 60_000);

  const visible = !pagina.avisoWhatsapp || pagina.entradaCalendario === "al_reservar";
  const extras = [
    ...(cliente.direccion ? [{ clave: "direccion", etiqueta: "Dirección", valor: cliente.direccion }] : []),
    ...cliente.extras,
  ];

  const creada = await prisma.$transaction(
    async (tx) => {
      // Un candado por profesional: dos clientes que piden la misma hora a la vez
      // se ordenan, y el segundo ve el horario ya ocupado.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${personalId}))`;

      const disponibilidad = await disponibilidadDePersonal(tx, storeId, seleccion, [personalId], ahora);
      const libres = disponibilidad.get(personalId)?.[fecha] ?? [];
      if (!libres.includes(minutosInicio)) return null;

      return tx.cita.create({
        data: {
          storeId,
          personalId,
          clienteNombre: [cliente.nombre, cliente.apellido].filter(Boolean).join(" "),
          clienteTelefono: cliente.telefono,
          clienteEmail: cliente.email,
          nota: cliente.nota,
          extras: extras.length > 0 ? (extras as unknown as Prisma.InputJsonValue) : undefined,
          inicio,
          fin,
          estado: "pendiente",
          precio: seleccion.total,
          serviciosTexto: seleccion.servicios.map((s) => s.nombre).join(" + ").slice(0, 300),
          bufferMin: seleccion.buffer,
          origen: "web",
          visible,
          servicios: {
            create: seleccion.servicios.map((s) => ({
              storeId,
              servicioId: s.id,
              nombre: s.nombre,
              duracionMin: s.duracionMin,
              precio: s.precio,
            })),
          },
        },
        select: { id: true },
      });
    },
    { timeout: 15_000 }
  );

  if (!creada) {
    return { ok: false, error: "Ese horario ya no está disponible. Elegí otro.", horarioOcupado: true };
  }

  const profesionales = await cargarPersonalPublico(prisma, storeId, [personalId]);
  const profesional = profesionales[0]?.nombre ?? "";
  const horaFin = horaDeMinutos(minutosInicio + seleccion.duracion);
  const fechaTexto = diaLargo(fecha);
  const codigo = codigoDeCita(creada.id);

  const enlaceWhatsapp =
    pagina.avisoWhatsapp && pagina.whatsapp
      ? construirLinkWhatsapp(
          pagina.whatsapp,
          mensajeWhatsappCita({
            negocio: pagina.nombre,
            cliente: { ...cliente, extras },
            servicios: seleccion.servicios,
            profesional,
            fechaTexto,
            horaInicio: hora,
            horaFin,
            total: seleccion.total,
            codigo,
          })
        )
      : null;

  return {
    ok: true,
    cita: {
      citaId: creada.id,
      codigo,
      fechaTexto,
      horaInicio: hora,
      horaFin,
      profesional,
      total: seleccion.total,
      enlaceWhatsapp,
      esperaEnvio: !visible,
    },
  };
}

/**
 * El cliente tocó "Enviar por WhatsApp": desde ese momento la cita se ve en el
 * calendario del negocio. Solo toca citas pedidas por la web y todavía ocultas, de
 * ESTE negocio; el id es imposible de adivinar.
 */
export async function marcarCitaEnviada(slug: string, citaId: string): Promise<{ ok: boolean }> {
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina || typeof citaId !== "string" || !citaId) return { ok: false };
  await prisma.cita.updateMany({
    where: { id: citaId, storeId: pagina.storeId, origen: "web", visible: false },
    data: { visible: true },
  });
  return { ok: true };
}
