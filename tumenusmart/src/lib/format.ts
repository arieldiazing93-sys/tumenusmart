/**
 * Formatea un monto en guaraníes.
 *
 * El "Gs." se escribe acá a mano, y NO se deja que lo ponga el navegador.
 *
 * Antes esto usaba el formateador de moneda del sistema pidiéndole "PYG", y el
 * símbolo salía distinto según el teléfono: en una computadora con los datos
 * de es-PY daba "Gs. 60.000", pero en un celular sin esos datos caía al código
 * internacional y mostraba "PYG 60.000" — que la gente lee "PIG". El cliente
 * veía una moneda que no existe justo cuando iba a confirmar cuánto paga.
 *
 * El separador de miles sí lo sigue poniendo el formateador, pero con el
 * idioma fijo en "es-PY" y sin moneda: eso solo decide punto o coma, y ahí no
 * hay ambigüedad posible.
 */
export function formatearGuarani(valor: number | string): string {
  const numero = typeof valor === "string" ? parseFloat(valor) : valor;
  if (!Number.isFinite(numero)) return "Gs. 0";

  const miles = new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0,
  }).format(Math.round(numero));

  return `Gs. ${miles}`;
}

// Número correlativo simple para mostrarle al cliente (ej: "#0042") en vez
// del id interno (cuid, con letras) — mucho más fácil de leer por teléfono.
export function formatearNumero(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}
