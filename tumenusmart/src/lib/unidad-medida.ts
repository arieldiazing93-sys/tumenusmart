/**
 * Unidad de medida de un producto o agregado de Paraguay.
 *
 * Mismo espíritu que src/lib/iva.ts: hoy nadie más lo consume, pero
 * centralizarlo acá evita que el formulario de producto y la futura API de
 * factura electrónica (SIFEN, vía un tercero — no se desarrolla acá) usen
 * dos catálogos distintos. Cada ítem de una factura electrónica en Paraguay
 * necesita su código de unidad de medida oficial.
 *
 * Códigos verificados contra el XSD oficial de la Tabla 5 (Codificación de
 * Unidades de Medida) de SIFEN:
 * https://ekuatia.set.gov.py/sifen/xsd/Unidades_Medida_v141.xsd
 */

export type UnidadMedida = "unidad" | "kilogramo" | "litro" | "hora";

export const UNIDADES_MEDIDA: { valor: UnidadMedida; etiqueta: string; codigoSifen: number }[] = [
  { valor: "unidad", etiqueta: "Unidad", codigoSifen: 77 },
  { valor: "kilogramo", etiqueta: "Kilogramo", codigoSifen: 83 },
  { valor: "litro", etiqueta: "Litro", codigoSifen: 89 },
  // El alquiler de una cancha se vende por hora (1 h, 1 h 30…). Código 100 = «Hora - Hs» en el mismo XSD oficial.
  { valor: "hora", etiqueta: "Hora", codigoSifen: 100 },
];

/** Cualquier valor raro (o vacío) cae en "unidad" — el más común en gastronomía. */
export function normalizarUnidadMedida(valor: unknown): UnidadMedida {
  const texto = String(valor ?? "");
  return UNIDADES_MEDIDA.some((u) => u.valor === texto) ? (texto as UnidadMedida) : "unidad";
}

export function etiquetaUnidadMedida(valor: string): string {
  return UNIDADES_MEDIDA.find((u) => u.valor === valor)?.etiqueta ?? "Unidad";
}

// ---------------------------------------------------------------------------------------------------------------------
//  Venta por peso o volumen (kilogramo / litro): se pesa y el monto sale de precio × peso
// ---------------------------------------------------------------------------------------------------------------------

/**
 * ¿Se vende por una medida que admite decimales? El precio del producto es por kilogramo, por litro o por hora y lo que se vende se
 * pesa, se mide o se cuenta en horas (0,285 kg, 1,5 h). Con la hora el «peso» es el tiempo: 1,5 = una hora y media.
 */
export function seVendePorPeso(unidad: string | null | undefined): boolean {
  return unidad === "kilogramo" || unidad === "litro" || unidad === "hora";
}

/** Lo más chico y lo más grande que se puede pesar en una línea: de 1 g (1 ml) a 999,999 kg (L). Siempre con hasta 3 decimales. */
export const PESO_MINIMO = 0.001;
export const PESO_MAXIMO = 999.999;

/** ¿Es un peso que se puede vender? Un número entre 1 g y 999,999 kg, con hasta 3 decimales (es decir, en gramos enteros). */
export function pesoValido(peso: unknown): peso is number {
  if (typeof peso !== "number" || !Number.isFinite(peso)) return false;
  if (peso < PESO_MINIMO || peso > PESO_MAXIMO) return false;
  return Math.abs(peso * 1000 - Math.round(peso * 1000)) < 1e-6;
}

/**
 * Lo que se pesó, como se lee en un ticket: "350 g", "1,25 kg", "250 ml", "1,5 L". Con la hora, el tiempo: "30 min", "1 h",
 * "1 h 30", "2 h 15".
 */
export function textoDePeso(peso: number, unidad: string): string {
  if (unidad === "hora") {
    const minutos = Math.round(peso * 60);
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    return resto === 0 ? `${horas} h` : `${horas} h ${String(resto).padStart(2, "0")}`;
  }
  const litro = unidad === "litro";
  if (peso < 1) return `${Math.round(peso * 1000)} ${litro ? "ml" : "g"}`;
  const redondeado = Math.round(peso * 1000) / 1000;
  const texto = Number.isInteger(redondeado) ? String(redondeado) : String(redondeado).replace(".", ",");
  return `${texto} ${litro ? "L" : "kg"}`;
}

/** De qué medida es el precio de un producto que se vende por peso: «kilo», «litro» u «hora» (para escribir «/ hora»). */
export function medidaDelPrecio(unidad: string | null | undefined): string {
  return unidad === "litro" ? "litro" : unidad === "hora" ? "hora" : "kilo";
}

/**
 * Lo que escribió la persona (en gramos o en kilos; en mililitros o litros) llevado a la unidad del producto (kg o L). Acepta coma o
 * punto decimal. Devuelve null si no es un número, si es cero o si no es un peso válido.
 */
export function pesoDesdeEscrito(texto: string, enChico: boolean): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  const numero = Number(limpio);
  const valor = enChico ? numero / 1000 : numero;
  // Los gramos se redondean al entero (no se pesa media gramo): 350,4 g → 350 g.
  const enGramos = Math.round(valor * 1000) / 1000;
  return pesoValido(enGramos) ? enGramos : null;
}

/**
 * Cuánto vale lo pesado: el precio de lista por kilogramo (o litro) × el peso, al guaraní entero. LA cuenta del peso: la hacen igual la
 * pantalla (para mostrar el monto) y el servidor (para cobrarlo), así que da el mismo número en los dos lados.
 *
 * Se hace con GRAMOS ENTEROS (el peso tiene hasta tres decimales): precio × gramos es un entero exacto y recién después se divide por
 * mil, así el redondeo "medio guaraní hacia arriba" cae donde debe y no depende de los errores de la coma flotante
 * (0,333 × 45.500 = 15.151,5 → 15.152, siempre).
 */
export function montoPorPeso(precioPorUnidad: number, peso: number): number {
  const gramos = Math.round(peso * 1000);
  return Math.round((precioPorUnidad * gramos) / 1000);
}
