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

const COLORES_ESTADO: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-800",
  confirmado: "bg-blue-100 text-blue-800",
  en_preparacion: "bg-purple-100 text-purple-800",
  en_despacho: "bg-cyan-100 text-cyan-800",
  entregado: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-700",
};

export function colorEstado(estado: string): string {
  return COLORES_ESTADO[estado] ?? "bg-neutral-100 text-neutral-700";
}
