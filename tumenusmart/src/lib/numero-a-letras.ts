/**
 * Convierte un monto en guaraníes a su forma escrita ("SON: ... GUARANIES"),
 * como exige el formato de factura de una imprenta/talonario tradicional.
 *
 * Sin decimales: el guaraní no usa céntimos en el uso diario. Sin tildes,
 * por la misma razón que el resto del ticket (`sinAcentos` en format.ts) —
 * esto ya se genera directamente sin ellas, no hace falta pasarlo por esa
 * función después.
 *
 * Cubre hasta 999.999.999 (novecientos noventa y nueve millones), de sobra
 * para una venta de mostrador — no está pensado para montos más grandes.
 */

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES_10_19 = [
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE",
  "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

function dosDigitos(n: number): string {
  if (n === 0) return "";
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES_10_19[n - 10];
  const decena = Math.floor(n / 10);
  const unidad = n % 10;
  if (decena === 2) return unidad === 0 ? "VEINTE" : `VEINTI${unidad === 1 ? "UN" : UNIDADES[unidad]}`;
  return unidad === 0 ? DECENAS[decena] : `${DECENAS[decena]} Y ${UNIDADES[unidad]}`;
}

function tresDigitos(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  return [CENTENAS[centena], dosDigitos(resto)].filter(Boolean).join(" ");
}

export function numeroALetras(valor: number): string {
  const numero = Math.min(999_999_999, Math.round(Math.abs(valor)));
  if (numero === 0) return "CERO";

  const millones = Math.floor(numero / 1_000_000);
  const miles = Math.floor((numero % 1_000_000) / 1000);
  const resto = numero % 1000;

  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLON" : `${tresDigitos(millones)} MILLONES`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "MIL" : `${tresDigitos(miles)} MIL`);
  }
  if (resto > 0) {
    partes.push(tresDigitos(resto));
  }
  return partes.join(" ");
}
