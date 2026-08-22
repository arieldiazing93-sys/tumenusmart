import { prisma } from "./prisma";
import { calcularEstadoAtencion } from "./horario-atencion";

export type EstadoTienda = {
  /** true solo si está dentro de horario Y no está pausado a mano. */
  aceptaPedidos: boolean;
  abierto: boolean;
  pausado: boolean;
  proximaApertura: string | null;
  mensajePausa: string | null;
};

/**
 * Fuente única de verdad para "¿se pueden tomar pedidos ahora?".
 * La usan tanto las pantallas públicas (para avisar) como el server action
 * que crea el pedido (para rechazarlo) — nunca se confía en el navegador.
 */
export async function obtenerEstadoTienda(): Promise<EstadoTienda> {
  const [store, horarios] = await Promise.all([
    prisma.store.findFirst(),
    prisma.horarioAtencion.findMany(),
  ]);

  const { abierto, proximaApertura } = calcularEstadoAtencion(horarios);
  const pausado = store?.pedidosPausados ?? false;

  return {
    aceptaPedidos: abierto && !pausado,
    abierto,
    pausado,
    proximaApertura,
    mensajePausa: store?.mensajePausa?.trim() || null,
  };
}

/** Texto único que explica por qué no se puede pedir (o null si sí se puede). */
export function motivoSinPedidos(estado: EstadoTienda): string | null {
  if (estado.aceptaPedidos) return null;
  if (estado.pausado) {
    return estado.mensajePausa ?? "Estamos con mucha demanda y pausamos los pedidos por un rato.";
  }
  return estado.proximaApertura
    ? `Estamos cerrados en este momento. Abrimos ${estado.proximaApertura}.`
    : "Estamos cerrados en este momento.";
}
