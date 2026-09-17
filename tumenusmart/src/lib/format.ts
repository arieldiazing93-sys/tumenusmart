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

/**
 * Igual que formatearGuarani pero sin el prefijo "Gs." — para la columna
 * "Monto" de la tabla de productos del ticket (filaTabla), calibrada a un
 * ancho fijo de columna donde el prefijo no entra. El resto del ticket
 * (Total, Subtotal, desglose de IVA) sigue usando formatearGuarani con
 * prefijo, porque ahí sí hay lugar y no van en una tabla de columnas fijas.
 */
export function formatearMiles(valor: number | string): string {
  const numero = typeof valor === "string" ? parseFloat(valor) : valor;
  if (!Number.isFinite(numero)) return "0";
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(Math.round(numero));
}

// Número correlativo simple para mostrarle al cliente (ej: "#0042") en vez
// del id interno (cuid, con letras) — mucho más fácil de leer por teléfono.
export function formatearNumero(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

/**
 * "595984357698" -> "0984-357-698".
 *
 * `Store.whatsappNumero` se guarda en formato internacional (595 adelante)
 * porque así lo necesitan los links de wa.me — pero en un ticket impreso la
 * gente lee el número como lo marcaría desde acá, con el 0 local. Si el
 * número no tiene la forma esperada (9 dígitos después del 595, o 10 con el
 * 0 ya puesto), se devuelve tal cual en vez de inventar un formato raro.
 */
export function formatearTelefonoLocal(numero: string): string {
  const digitos = numero.replace(/[^\d]/g, "");
  const local = digitos.startsWith("595")
    ? "0" + digitos.slice(3)
    : digitos.startsWith("0")
      ? digitos
      : "0" + digitos;
  if (local.length !== 10) return numero;
  return `${local.slice(0, 4)}-${local.slice(4, 7)}-${local.slice(7)}`;
}

/**
 * Saca tildes, ñ/Ñ y el símbolo ° de un texto — para todo dato DINÁMICO
 * (nombre del local, razón social, nombre de producto, forma de pago, etc.)
 * que va a parar a la impresora térmica del ticket.
 *
 * Muchas impresoras ESC/POS (o el driver "Genérico / Solo texto" de Windows
 * que las maneja) imprimen con una página de códigos que no tiene esos
 * caracteres: en vez de fallar, el mismo byte sale como el símbolo que le
 * toca en OTRA tabla — "Razón" sale "Raz³n", "Válido" sale "Vßlido". Sacarlos
 * de raíz antes de imprimir es lo único que funciona igual en cualquier
 * impresora, sin depender de configurar el driver a mano en cada
 * computadora. El texto ESTÁTICO del ticket (las etiquetas fijas) va escrito
 * directamente sin tildes en el código — esta función es solo para lo que
 * viene de la base de datos.
 */
export function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/°/g, "");
}
