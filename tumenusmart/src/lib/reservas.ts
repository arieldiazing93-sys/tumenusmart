export const TURNOS = [
  { value: "dia", label: "Día" },
  { value: "tarde", label: "Tarde" },
  { value: "noche", label: "Noche" },
] as const;

export type Turno = (typeof TURNOS)[number]["value"];

export function etiquetaTurno(turno: string): string {
  return TURNOS.find((t) => t.value === turno)?.label ?? turno;
}

export const MOTIVOS_RESERVA = [
  { value: "cumple", label: "Cumpleaños" },
  { value: "cita", label: "Cita" },
  { value: "reunion", label: "Reunión" },
  { value: "aniversario", label: "Aniversario" },
  { value: "otro", label: "Otro" },
] as const;

export function etiquetaMotivo(motivo: string): string {
  return MOTIVOS_RESERVA.find((m) => m.value === motivo)?.label ?? motivo;
}

export const ESTADOS_RESERVA = [
  { value: "pendiente", label: "Pendiente", emoji: "⏳" },
  { value: "confirmada", label: "Confirmada", emoji: "✅" },
  { value: "cancelada", label: "Cancelada", emoji: "❌" },
] as const;

export function etiquetaEstadoReserva(estado: string): string {
  return ESTADOS_RESERVA.find((e) => e.value === estado)?.label ?? estado;
}

// Mismo criterio que los estados de pedido: colores del sistema y fondo
// "tinte", para que se distingan dentro de una lista.
const COLORES_ESTADO_RESERVA: Record<string, string> = {
  pendiente: "bg-aviso-tinte text-aviso",
  confirmada: "bg-exito-tinte text-exito",
  cancelada: "bg-peligro-tinte text-peligro",
};

export function colorEstadoReserva(estado: string): string {
  return COLORES_ESTADO_RESERVA[estado] ?? "bg-papel-hundido text-tinta-media";
}
