"use server";

import type { Prisma } from "@prisma/client";
import { diaLargo, horaDeMinutos } from "@/lib/agenda";
import { claveSumarDias } from "@/lib/calendario";
import {
  DIAS_POR_VENTANA,
  codigoDeReserva,
  etiquetaDeDeporte,
  mensajeWhatsappReservaCancha,
  precioDeReserva,
  ventanaDeDisponibilidad,
  type DisponibilidadPorDia,
  type ReservaCreada,
} from "@/lib/canchas";
import {
  cargarCanchasPublicas,
  disponibilidadDeCanchas,
  limpiarReservasCanchaSinEnviar,
} from "@/lib/canchas-publicas";
import { DIAS_ADELANTE, MINUTOS_BLOQUEO_SIN_CONFIRMAR } from "@/lib/disponibilidad";
import { aMinutos, esHoraValida } from "@/lib/horario-trabajo";
import { completarCampos } from "@/lib/pagina-reservas";
import { prisma } from "@/lib/prisma";
import { DATOS_CLIENTE_VACIOS, validarDatosCliente, type DatosCliente } from "@/lib/reserva-cliente";
import { cargarPaginaPublica } from "@/lib/reservas-publicas";
import { claveDiaAsuncion, instanteAsuncionDesdeTexto } from "@/lib/timezone";
import { construirLinkWhatsapp } from "@/lib/whatsapp";

/**
 * Las acciones de la reserva pública de canchas. Las usa el cliente desde su celular, sin iniciar sesión: no hay usuario
 * que consultar. Se protegen de la misma forma que la reserva de turnos:
 *
 *  - el local sale SIEMPRE de la dirección de la página (`slug`), nunca de algo que mande el navegador, y la página
 *    tiene que estar habilitada;
 *  - todo lo que llega (cancha, duración, día, hora, datos) se vuelve a verificar contra la base: nada se da por bueno,
 *    y el precio lo calcula el servidor;
 *  - al crear la reserva se revisa de nuevo que el horario siga libre, con un candado por cancha, para que dos clientes
 *    no tomen la misma hora.
 */

const NO_DISPONIBLE = "Las reservas no están disponibles en este momento.";
/** Cuántas reservas pendientes puede tener un mismo teléfono antes de que se le pida esperar. */
const MAX_PENDIENTES_POR_TELEFONO = 3;

export type DatosReservaPublica = {
  canchaId: string;
  /** Minutos: una de las duraciones de la cancha. */
  duracion: number;
  /** "YYYY-MM-DD" */
  fecha: string;
  /** "HH:MM" */
  hora: string;
  cliente: DatosCliente;
};

export type ResultadoReserva =
  | { ok: true; reserva: ReservaCreada }
  | { ok: false; error: string; /** El horario se ocupó justo antes: hay que elegir otro. */ horarioOcupado?: boolean };

export type ResultadoTablero =
  | {
      ok: true;
      /** "YYYY-MM-DD": el primer día de lo que se trajo. */
      desde: string;
      /** Cuántos días trae (puede ser menos de la ventana si se llega al límite de días reservables). */
      dias: DisponibilidadPorDia;
      /** El último día que cubre esta respuesta ("YYYY-MM-DD"). */
      hasta: string;
    }
  | { ok: false; error: string };

/**
 * El tablero de la página: las horas libres de TODAS las canchas, para cada duración, en una ventana de días desde `desde`.
 * Es lo que permite elegir "viernes, 21:00, hora y media" y ver de una qué canchas están libres. Solo lee.
 */
export async function tableroDeCanchas(slug: string, desde: string): Promise<ResultadoTablero> {
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina) return { ok: false, error: NO_DISPONIBLE };

  const ahora = new Date();
  const hoy = claveDiaAsuncion(ahora);
  const ultimo = claveSumarDias(hoy, DIAS_ADELANTE - 1);
  let inicio = typeof desde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : hoy;
  if (claveSumarDias(inicio, 0) !== inicio) inicio = hoy;
  if (inicio < hoy) inicio = hoy;
  if (inicio > ultimo) return { ok: false, error: "Esa fecha no está disponible." };

  const canchas = await cargarCanchasPublicas(prisma, pagina.storeId);
  const disponibilidad = await disponibilidadDeCanchas(prisma, pagina.storeId, canchas, ahora);
  const cantidad = Math.min(DIAS_POR_VENTANA, DIAS_ADELANTE - diasEntre(hoy, inicio));
  return {
    ok: true,
    desde: inicio,
    dias: ventanaDeDisponibilidad(disponibilidad, inicio, cantidad),
    hasta: claveSumarDias(inicio, cantidad - 1),
  };
}

/** Cuántos días hay de `a` a `b` (ambos "YYYY-MM-DD", b >= a). */
function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * Crea la reserva. Vuelve a comprobar todo (cancha, duración, día, hora libre y los datos del cliente contra los campos
 * que pide el negocio) y calcula el precio.
 *
 * Según cómo lo configuró el negocio, la reserva aparece en su calendario apenas se crea, o recién cuando el cliente manda
 * el aviso por WhatsApp (mientras tanto reserva el horario un rato, pero no se ve).
 */
export async function crearReservaCanchaPublica(slug: string, datos: DatosReservaPublica): Promise<ResultadoReserva> {
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina) return { ok: false, error: NO_DISPONIBLE };
  const storeId = pagina.storeId;

  if (!datos || typeof datos !== "object") return { ok: false, error: "Lo que llegó no es válido. Recargá la página." };

  const canchaId = typeof datos.canchaId === "string" ? datos.canchaId : "";
  const canchas = canchaId ? await cargarCanchasPublicas(prisma, storeId, [canchaId]) : [];
  const cancha = canchas[0];
  if (!cancha) return { ok: false, error: "Esa cancha ya no está disponible. Volvé a elegir." };

  const duracion = Number(datos.duracion);
  if (!cancha.duraciones.includes(duracion)) {
    return { ok: false, error: "Esa duración no se ofrece para esta cancha." };
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

  // Las reservas que otros clientes dejaron sin enviar el aviso por WhatsApp ya se cancelaron: no ocupan horario ni
  // cuentan para el freno de más abajo.
  await limpiarReservasCanchaSinEnviar(prisma, storeId, ahora);

  // Freno a los pedidos en cadena con el mismo número: unas pocas reservas pendientes alcanzan.
  if (cliente.telefono) {
    const pendientes = await prisma.reservaCancha.count({
      where: {
        storeId,
        origen: "web",
        clienteTelefono: cliente.telefono,
        estado: { in: ["pendiente", "proxima"] },
        inicio: { gte: ahora },
      },
    });
    if (pendientes >= MAX_PENDIENTES_POR_TELEFONO) {
      return {
        ok: false,
        error: "Ya tenés varias reservas pendientes con este número. Esperá a que el complejo las confirme.",
      };
    }
  }

  const inicio = instanteAsuncionDesdeTexto(`${fecha}T${hora}`);
  if (!inicio) return { ok: false, error: "El día o la hora no son válidos." };
  const minutosInicio = aMinutos(hora);
  const fin = new Date(inicio.getTime() + duracion * 60_000);
  const precio = precioDeReserva(cancha, minutosInicio, duracion);

  const visible = !pagina.avisoWhatsapp || pagina.entradaCalendario === "al_reservar";
  const extras = [
    ...(cliente.direccion ? [{ clave: "direccion", etiqueta: "Dirección", valor: cliente.direccion }] : []),
    ...cliente.extras,
  ];

  const creada = await prisma.$transaction(
    async (tx) => {
      // Un candado por cancha: dos clientes que piden la misma hora a la vez se ordenan, y el segundo ve el horario ya
      // ocupado.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${canchaId}))`;

      const disponibilidad = await disponibilidadDeCanchas(tx, storeId, [cancha], ahora);
      const libres = disponibilidad.get(canchaId)?.[duracion]?.[fecha] ?? [];
      if (!libres.includes(minutosInicio)) return null;

      return tx.reservaCancha.create({
        data: {
          storeId,
          canchaId,
          canchaNombre: cancha.nombre,
          clienteNombre: [cliente.nombre, cliente.apellido].filter(Boolean).join(" "),
          clienteTelefono: cliente.telefono,
          clienteEmail: cliente.email,
          extras: extras.length > 0 ? (extras as unknown as Prisma.InputJsonValue) : undefined,
          inicio,
          fin,
          duracionMin: duracion,
          estado: "pendiente",
          precio,
          origen: "web",
          visible,
        },
        select: { id: true },
      });
    },
    { timeout: 15_000 }
  );

  if (!creada) {
    return { ok: false, error: "Ese horario ya no está disponible. Elegí otro.", horarioOcupado: true };
  }

  const horaFin = horaDeMinutos(minutosInicio + duracion);
  const fechaTexto = diaLargo(fecha);
  const codigo = codigoDeReserva(creada.id);

  const enlaceWhatsapp =
    pagina.avisoWhatsapp && pagina.whatsapp
      ? construirLinkWhatsapp(
          pagina.whatsapp,
          mensajeWhatsappReservaCancha({
            negocio: pagina.nombre,
            cliente: { ...cliente, extras },
            canchaNombre: cancha.nombre,
            deporte: etiquetaDeDeporte(cancha.deporte),
            fechaTexto,
            horaInicio: hora,
            horaFin,
            duracionMin: duracion,
            total: precio,
            codigo,
          })
        )
      : null;

  return {
    ok: true,
    reserva: {
      reservaId: creada.id,
      codigo,
      fechaTexto,
      horaInicio: hora,
      horaFin,
      canchaNombre: cancha.nombre,
      duracionMin: duracion,
      total: precio,
      enlaceWhatsapp,
      esperaEnvio: !visible,
      // Cuánto tiene el cliente para mandar el aviso (unos segundos menos que lo real, por lo que tarda la respuesta en
      // llegar): pasado ese tiempo la reserva se cancela y el horario se libera.
      venceEnSegundos: visible ? null : Math.max(MINUTOS_BLOQUEO_SIN_CONFIRMAR * 60 - 5, 0),
    },
  };
}

/**
 * El cliente tocó "Enviar por WhatsApp": desde ese momento la reserva se ve en el calendario del complejo. Solo toca
 * reservas pedidas por la web y todavía ocultas, de ESTE negocio; el id es imposible de adivinar.
 *
 * Solo vale dentro del tiempo que da la reserva (MINUTOS_BLOQUEO_SIN_CONFIRMAR): si ya pasó, la reserva se canceló y el
 * horario se liberó, así que ya no se puede confirmar (`vencida`).
 */
export async function marcarReservaCanchaEnviada(
  slug: string,
  reservaId: string
): Promise<{ ok: boolean; vencida?: boolean }> {
  const pagina = await cargarPaginaPublica(slug);
  if (!pagina || typeof reservaId !== "string" || !reservaId) return { ok: false };
  const storeId = pagina.storeId;

  await limpiarReservasCanchaSinEnviar(prisma, storeId, new Date());
  const marcada = await prisma.reservaCancha.updateMany({
    where: { id: reservaId, storeId, origen: "web", visible: false },
    data: { visible: true },
  });
  if (marcada.count === 1) return { ok: true };

  // Si ya se veía (tocó el botón más de una vez) está bien; si no existe más, la reserva venció y se canceló.
  const existe = await prisma.reservaCancha.findFirst({
    where: { id: reservaId, storeId, origen: "web" },
    select: { id: true },
  });
  return existe ? { ok: true } : { ok: false, vencida: true };
}
