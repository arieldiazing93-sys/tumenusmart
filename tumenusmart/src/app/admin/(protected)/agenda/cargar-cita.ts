import { partesLocales, horaDeMinutos } from "@/lib/agenda";
import type {
  ActividadCita,
  DetalleCita,
  EstadoCaja,
  PersonalDeCita,
  ServicioOpcion,
  TonoActividad,
} from "@/lib/agenda-cita";
import { nombreCompleto } from "@/lib/agenda-personal";
import { estacionActual } from "@/lib/estacion-actual";
import { formatearNumero } from "@/lib/format";
import { detallePagos } from "@/lib/pago-venta";
import { prisma } from "@/lib/prisma";
import type { PrismaLocal } from "@/lib/prisma-local";
import { codigoDeCita } from "@/lib/reserva-cliente";
import { normalizarColor } from "@/lib/servicios-agenda";
import { turnoAbierto } from "../pos/turno-actual";

/**
 * Lo que necesita el panel de una cita, leído del servidor. Todo sale del cliente del
 * local (`db`): un id de otro negocio simplemente no aparece.
 */

/** Las respuestas a los campos extra del formulario público, guardadas como JSON. */
function leerExtras(valor: unknown): { etiqueta: string; valor: string }[] {
  if (!Array.isArray(valor)) return [];
  const salida: { etiqueta: string; valor: string }[] = [];
  for (const x of valor) {
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      if (typeof o.etiqueta === "string" && typeof o.valor === "string") {
        salida.push({ etiqueta: o.etiqueta, valor: o.valor });
      }
    }
  }
  return salida;
}

export async function cargarDetalleCita(db: PrismaLocal, id: string): Promise<DetalleCita | null> {
  const c = await db.cita.findFirst({
    where: { id },
    select: {
      id: true,
      personalId: true,
      clienteNombre: true,
      clienteTelefono: true,
      clienteEmail: true,
      nota: true,
      extras: true,
      inicio: true,
      estado: true,
      bufferMin: true,
      origen: true,
      descuento: true,
      descuentoPorcentaje: true,
      createdAt: true,
      servicios: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          servicioId: true,
          nombre: true,
          duracionMin: true,
          precio: true,
          servicio: { select: { color: true, product: { select: { category: { select: { nombre: true } } } } } },
        },
      },
      ventaPos: {
        select: {
          id: true,
          numero: true,
          total: true,
          cancelada: true,
          comprobanteTipo: true,
          facturaNumero: true,
          facturaAnulada: true,
          pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } },
        },
      },
    },
  });
  if (!c) return null;

  const inicio = partesLocales(c.inicio);
  const cobrada = c.ventaPos && !c.ventaPos.cancelada ? c.ventaPos : null;

  return {
    id: c.id,
    codigo: codigoDeCita(c.id),
    origen: c.origen === "web" ? "web" : "panel",
    estado: c.estado,
    clienteNombre: c.clienteNombre,
    clienteTelefono: c.clienteTelefono ?? "",
    clienteEmail: c.clienteEmail ?? "",
    nota: c.nota ?? "",
    extras: leerExtras(c.extras),
    personalId: c.personalId,
    fecha: inicio.dia,
    hora: horaDeMinutos(inicio.minutos),
    servicios: c.servicios.map((s) => ({
      clave: s.id,
      servicioId: s.servicioId,
      citaServicioId: s.id,
      nombre: s.nombre,
      categoriaNombre: s.servicio?.product.category.nombre ?? null,
      duracionMin: s.duracionMin,
      precio: Number(s.precio),
      color: normalizarColor(s.servicio?.color),
    })),
    bufferMin: c.bufferMin,
    descuentoMonto: Number(c.descuento),
    descuentoPorcentaje: c.descuentoPorcentaje == null ? null : Number(c.descuentoPorcentaje),
    creadaEn: c.createdAt.toISOString(),
    cobro: cobrada
      ? {
          ventaId: cobrada.id,
          numero: formatearNumero(cobrada.numero),
          pagoTexto: detallePagos(cobrada.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) }))),
          total: Number(cobrada.total),
          comprobanteTipo: cobrada.comprobanteTipo,
          facturaNumero: cobrada.facturaNumero,
          facturaAnulada: cobrada.facturaAnulada,
        }
      : null,
  };
}

/** Los servicios que se pueden agregar a una cita, agrupados por su categoría. */
export async function cargarServiciosDelPanel(db: PrismaLocal): Promise<ServicioOpcion[]> {
  const filas = await db.servicioAgenda.findMany({
    where: { product: { disponible: true, esServicio: true } },
    orderBy: [{ product: { category: { orden: "asc" } } }, { product: { nombre: "asc" } }],
    select: {
      id: true,
      duracionMin: true,
      bufferMin: true,
      tipoPrecio: true,
      color: true,
      product: { select: { nombre: true, precio: true, category: { select: { nombre: true } } } },
      personal: { select: { personalId: true } },
    },
  });
  return filas.map((f) => ({
    id: f.id,
    nombre: f.product.nombre,
    categoriaNombre: f.product.category.nombre,
    duracionMin: f.duracionMin,
    bufferMin: f.bufferMin,
    precio: Number(f.product.precio),
    tipoPrecio: f.tipoPrecio,
    color: normalizarColor(f.color),
    personalIds: f.personal.map((p) => p.personalId),
  }));
}

/** El personal activo, más el de la cita abierta aunque ya no esté activo (para no perderlo al guardar). */
export async function cargarPersonalDelPanel(db: PrismaLocal, incluirId: string | null): Promise<PersonalDeCita[]> {
  const filas = await db.miembroPersonal.findMany({
    where: incluirId ? { OR: [{ activo: true }, { id: incluirId }] } : { activo: true },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, apellido: true, fotoUrl: true },
  });
  return filas.map((f) => ({ id: f.id, nombre: nombreCompleto(f), fotoUrl: f.fotoUrl }));
}

/**
 * ¿Se puede cobrar desde esta computadora? Hace falta que esté vinculada a una caja
 * (estación) y que esa caja tenga el turno abierto. De paso, se fija si la caja puede
 * facturar y a qué impresora manda el ticket.
 */
export async function cargarEstadoCaja(db: PrismaLocal, storeId: string): Promise<EstadoCaja> {
  const estacion = await estacionActual(db);
  if (!estacion) return { listo: false, motivo: "sin_estacion" };
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) return { listo: false, motivo: "sin_turno" };

  const [datos, store] = await Promise.all([
    db.estacion.findUnique({
      where: { id: estacion.id },
      select: {
        puntoExpedicion: { select: { activo: true, timbradoHasta: true } },
        areaTicketId: true,
        impresoras: { select: { areaImpresionId: true, nombreImpresora: true } },
      },
    }),
    // Store no está en los modelos por local: se lee con el cliente global.
    prisma.store.findUnique({ where: { id: storeId }, select: { facturaObligatoria: true } }),
  ]);

  const punto = datos?.puntoExpedicion ?? null;
  const areaTicket = datos?.areaTicketId ?? null;
  return {
    listo: true,
    estacion: estacion.nombre,
    puedeFacturar: !!punto?.activo && punto.timbradoHasta > new Date(),
    facturaObligatoria: store?.facturaObligatoria ?? false,
    nombreImpresoraTicket: areaTicket
      ? (datos?.impresoras.find((i) => i.areaImpresionId === areaTicket)?.nombreImpresora ?? null)
      : null,
  };
}

/** El código de la bitácora ("cita_cobrada") pasado al tono con que se dibuja el movimiento. */
function tonoDeAccion(accion: string): TonoActividad {
  switch (accion) {
    case "cita_creada":
      return "creada";
    case "cita_cobrada":
      return "cobro";
    case "cita_cobro_anulado":
    case "cita_eliminada":
      return "anulado";
    case "cita_estado_cambiado":
      return "estado";
    default:
      return "edicion";
  }
}

/** Lo que pasó con la cita: cómo se creó y lo que se fue anotando en la bitácora. Lo más nuevo, primero. */
export async function cargarActividadDeCita(
  db: PrismaLocal,
  cita: { id: string; origen: string; creadaEn: string }
): Promise<ActividadCita[]> {
  const filas = await db.bitacora.findMany({
    where: { entidad: "Cita", entidadId: cita.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { usuario: true, accion: true, descripcion: true, createdAt: true },
  });
  const actividad: ActividadCita[] = filas.map((f) => ({
    cuando: f.createdAt.toISOString(),
    quien: f.usuario,
    texto: f.descripcion,
    tono: tonoDeAccion(f.accion),
  }));
  // Las citas del panel ya tienen su "creada" en la bitácora; las de la web las crea el cliente.
  if (cita.origen === "web") {
    actividad.push({
      cuando: cita.creadaEn,
      quien: "Cliente",
      texto: "Reservó desde el enlace de reservas.",
      tono: "creada",
    });
  }
  return actividad;
}
