/**
 * El detalle de una cita en la Agenda: lo que muestra el panel de la derecha al
 * tocar un turno del calendario, y lo que ese panel manda al servidor.
 *
 * El panel es a la vez la ficha de la cita y un punto de venta: ahí se cambian los
 * servicios y sus precios, se aplica un descuento y se cobra, y lo cobrado entra
 * en la caja (ver cobrarCita en agenda/actions.ts).
 *
 * Todo puro (sin Prisma) para que el panel del navegador y las acciones del
 * servidor hagan siempre las mismas cuentas.
 */

import { horaDeMinutos } from "./agenda";
import { calcularDescuento, type DescuentoPedido } from "./descuento-venta";
import { aMinutos } from "./horario-trabajo";
import type { FormaPagoPos } from "./turno-pos";

/** Un servicio tiene que costar menos que esto (el precio se guarda con Decimal(10,2)). */
export const PRECIO_MAXIMO_SERVICIO = 99_999_999;

/** Una cita dura como mínimo esto (si por algún motivo los servicios no suman nada). */
export const DURACION_MINIMA_CITA = 15;

// ---------------------------------------------------------------------------
//  Lo que muestra el panel
// ---------------------------------------------------------------------------

/** Un servicio de la cita, como lo maneja el panel. */
export type LineaServicioCita = {
  /** Clave estable de la fila en pantalla (no se guarda). */
  clave: string;
  /** El id de ServicioAgenda; null si ese servicio ya no existe (se conserva lo que se reservó). */
  servicioId: string | null;
  /** El id de CitaServicio: sirve para conservar nombre y duración de un servicio que ya no existe. */
  citaServicioId: string | null;
  nombre: string;
  categoriaNombre: string | null;
  duracionMin: number;
  precio: number;
  /** El color del servicio ("#RRGGBB"), el que se eligió en Servicios. */
  color: string;
};

/** Un servicio del catálogo, para agregarlo a la cita. */
export type ServicioOpcion = {
  /** El id de ServicioAgenda. */
  id: string;
  nombre: string;
  categoriaNombre: string;
  duracionMin: number;
  bufferMin: number;
  precio: number;
  tipoPrecio: string;
  color: string;
  /** Quiénes lo realizan (solo para avisar si se elige a alguien que no lo hace). */
  personalIds: string[];
};

export type PersonalDeCita = { id: string; nombre: string; fotoUrl: string | null };

/** Lo que se cobró de una cita (la venta del punto de venta). */
export type CobroDeCita = {
  ventaId: string;
  /** El número de la cuenta en el mostrador ("0012"). */
  numero: string;
  /** Cómo se pagó, ya escrito ("Efectivo", "Efectivo Gs. 20.000 + Tarjeta débito Gs. 25.000"). */
  pagoTexto: string;
  total: number;
  /** "ticket" | "factura" */
  comprobanteTipo: string;
  facturaNumero: string | null;
  facturaAnulada: boolean;
};

export type DetalleCita = {
  id: string;
  /** Los últimos 6 caracteres del id, para reconocerla ("AB12CD"). */
  codigo: string;
  origen: "panel" | "web" | "mostrador";
  estado: string;
  clienteNombre: string;
  /** Solo dígitos, internacional (595984123456), o "". */
  clienteTelefono: string;
  clienteEmail: string;
  /** Una nota vieja (de cuando el formulario público la pedía): ya no se carga, solo se lee si la hay. */
  nota: string;
  /** Las respuestas a los campos extra del formulario público (solo se leen). */
  extras: { etiqueta: string; valor: string }[];
  personalId: string;
  /** "YYYY-MM-DD" y "HH:MM" en hora de Asunción. */
  fecha: string;
  hora: string;
  servicios: LineaServicioCita[];
  bufferMin: number;
  descuentoMonto: number;
  /** El porcentaje si el descuento se cargó así; null si fue un monto fijo o no hay descuento. */
  descuentoPorcentaje: number | null;
  /** Cuándo se pidió o cargó (ISO). */
  creadaEn: string;
  /** null = todavía sin cobrar. */
  cobro: CobroDeCita | null;
};

/** Una línea de la pestaña Actividad. */
export type ActividadCita = { cuando: string; quien: string; texto: string };

/**
 * Si se puede cobrar desde este navegador. Cobrar necesita que la computadora esté
 * vinculada a una caja (estación) y que esa caja tenga el turno abierto.
 */
export type EstadoCaja =
  | { listo: false; motivo: "sin_estacion" | "sin_turno" }
  | {
      listo: true;
      estacion: string;
      /** Si la caja tiene un punto de expedición vigente (se puede emitir factura). */
      puedeFacturar: boolean;
      /** Si el local exige facturar toda venta. */
      facturaObligatoria: boolean;
      /** La impresora del ticket de esta caja (QZ Tray), o null si no hay una configurada. */
      nombreImpresoraTicket: string | null;
    };

// ---------------------------------------------------------------------------
//  Lo que el panel manda
// ---------------------------------------------------------------------------

export type DatosCita = {
  estado: string;
  clienteNombre: string;
  clienteTelefono: string;
  personalId: string;
  fecha: string;
  hora: string;
  /** Los servicios en orden. El precio es el final (puede diferir del catálogo). */
  servicios: { servicioId: string | null; citaServicioId: string | null; precio: number }[];
  descuento: DescuentoPedido | null;
  /** Guardar aunque se pise con otra cita del mismo profesional (el usuario ya lo vio y aceptó). */
  forzar?: boolean;
};

/** Cómo se cobra: forma de pago y comprobante. */
export type DatosCobro = {
  forma: FormaPagoPos;
  comprobanteTipo: "ticket" | "factura";
  registroFiscal: "con" | "sin";
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  razonSocial: string;
  email: string;
};

// ---------------------------------------------------------------------------
//  Cuentas
// ---------------------------------------------------------------------------

export function subtotalServicios(lineas: { precio: number }[]): number {
  return lineas.reduce((suma, l) => suma + (Number.isFinite(l.precio) ? l.precio : 0), 0);
}

/** Cuánto dura la cita: la suma de sus servicios (con un mínimo). */
export function duracionDeServicios(lineas: { duracionMin: number }[]): number {
  const suma = lineas.reduce((s, l) => s + l.duracionMin, 0);
  return Math.max(suma, DURACION_MINIMA_CITA);
}

/** El mayor tiempo de búfer entre los servicios: se limpia una sola vez, al final. */
export function bufferDeServicios(lineas: { bufferMin: number }[]): number {
  return lineas.reduce((mayor, l) => Math.max(mayor, l.bufferMin), 0);
}

/** "09:05" + 40 min → "09:45". */
export function horaFinDeCita(hora: string, duracionMin: number): string {
  return horaDeMinutos((aMinutos(hora) + duracionMin) % (24 * 60));
}

export type ResumenDescuento =
  | { ok: true; monto: number; porcentaje: number | null; total: number }
  | { ok: false; error: string };

/** El descuento sobre el subtotal y lo que queda por cobrar. Mismas reglas que el punto de venta. */
export function resumirDescuento(subtotal: number, pedido: DescuentoPedido | null): ResumenDescuento {
  const r = calcularDescuento(subtotal, pedido);
  if (!r.ok) return r;
  return { ok: true, monto: r.monto, porcentaje: r.porcentaje, total: subtotal - r.monto };
}

/** De dónde vino la cita. */
export function textoFuente(origen: string): string {
  if (origen === "web") return "Enlace de reserva";
  if (origen === "mostrador") return "Mostrador (sin reserva)";
  return "Cargada en el panel";
}
