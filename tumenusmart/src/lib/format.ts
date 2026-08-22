export function formatearGuarani(valor: number | string) {
  const numero = typeof valor === "string" ? parseFloat(valor) : valor;
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(numero);
}

// Número correlativo simple para mostrarle al cliente (ej: "#0042") en vez
// del id interno (cuid, con letras) — mucho más fácil de leer por teléfono.
export function formatearNumero(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}
