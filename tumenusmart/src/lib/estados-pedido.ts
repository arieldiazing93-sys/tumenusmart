export const ESTADOS_PEDIDO = [
  { value: "pendiente", label: "Por confirmar", emoji: "⏳" },
  { value: "confirmado", label: "Confirmado", emoji: "✅" },
  { value: "en_preparacion", label: "En preparación", emoji: "👨‍🍳" },
  { value: "en_despacho", label: "En despacho", emoji: "🛵" },
  { value: "entregado", label: "Entregado", emoji: "📦" },
  { value: "cancelado", label: "Cancelado", emoji: "❌" },
] as const;

export function etiquetaEstado(estado: string): string {
  return ESTADOS_PEDIDO.find((e) => e.value === estado)?.label ?? estado;
}

/**
 * El color de cada estado.
 *
 * Cada uno sale del sistema de color del producto, no de la paleta suelta de
 * Tailwind, y el fondo es el tono "tinte" —más fuerte que el de los carteles—
 * porque acá compiten dentro de una tabla larga: si son muy claros, el
 * encargado tiene que leer cada fila en vez de barrerla con la vista.
 *
 * El orden de los colores sigue el recorrido del pedido: ámbar es el que
 * espera algo tuyo, verde el que ya terminó, rojo el que se cayó.
 */
const COLORES_ESTADO: Record<string, string> = {
  pendiente: "bg-aviso-tinte text-aviso",
  confirmado: "bg-azul-tinte text-azul-oscuro",
  en_preparacion: "bg-brand-tinte text-brand-texto",
  en_despacho: "bg-violeta-tinte text-violeta-oscuro",
  entregado: "bg-exito-tinte text-exito",
  cancelado: "bg-peligro-tinte text-peligro",
};

export function colorEstado(estado: string): string {
  return COLORES_ESTADO[estado] ?? "bg-papel-hundido text-tinta-media";
}
