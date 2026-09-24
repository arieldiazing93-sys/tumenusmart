/**
 * El cierre de caja del Punto de Venta (mostrador).
 *
 * A diferencia de la rendición del repartidor —donde solo importa cuánto
 * efectivo hay que devolver—, acá el cajero declara las 4 formas de pago por
 * separado: lo que interesa no es "cuánto falta", sino si lo que declaró en
 * cada una coincide con lo que el sistema calculó a partir de las ventas.
 *
 * Acá adentro no hay base de datos: se le pasan las ventas ya leídas y
 * devuelve las cuentas, para poder probarlo de verdad.
 */

import type { Monto } from "./rendicion";

export type FormaPagoPos = "efectivo" | "transferencia" | "tarjeta_debito" | "tarjeta_credito";

export const FORMAS_PAGO_POS: { valor: FormaPagoPos; etiqueta: string }[] = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta_debito", etiqueta: "Tarjeta débito" },
  { valor: "tarjeta_credito", etiqueta: "Tarjeta crédito" },
];

const VALIDAS = new Set(FORMAS_PAGO_POS.map((f) => f.valor));

/**
 * Convierte lo que venga en una forma de pago válida.
 *
 * Cae en "efectivo" cuando no reconoce el valor — mismo criterio que
 * normalizarCobro en rendicion.ts: mejor contarlo de más en algún lado que
 * dejarlo desaparecer de la cuenta.
 */
export function normalizarFormaPagoPos(valor: unknown): FormaPagoPos {
  const texto = String(valor ?? "").trim().toLowerCase();
  return (VALIDAS.has(texto as FormaPagoPos) ? texto : "efectivo") as FormaPagoPos;
}

/**
 * "A crédito" (fiado): la venta se hace pero el cliente todavía no pagó. NO es
 * una forma de cobro: no entra en ninguna de las 4 de arriba, ni en la caja ni
 * en el corte. Se cobra después (Cuentas por cobrar). Solo existe en las
 * ventas del mostrador, y solo si el local la activó en Configuración.
 */
export const FORMA_PAGO_A_CREDITO = "a_credito";

export function esVentaACredito(formaPago: string | null | undefined): boolean {
  return formaPago === FORMA_PAGO_A_CREDITO;
}

/**
 * Como normalizarFormaPagoPos, pero para una VENTA del mostrador: además de las
 * 4 formas de cobro reconoce "a_credito". Cualquier otra cosa cae en efectivo.
 */
export function normalizarFormaPagoVenta(valor: unknown): FormaPagoPos | typeof FORMA_PAGO_A_CREDITO {
  return String(valor ?? "").trim().toLowerCase() === FORMA_PAGO_A_CREDITO
    ? FORMA_PAGO_A_CREDITO
    : normalizarFormaPagoPos(valor);
}

export function etiquetaFormaPagoPos(valor: string): string {
  if (esVentaACredito(valor)) return "A crédito";
  return FORMAS_PAGO_POS.find((f) => f.valor === valor)?.etiqueta ?? "Efectivo";
}

function aNumero(valor: Monto): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

export type VentaDeTurno = { total: Monto; formaPago: string };

export type ResumenTurno = {
  /** Todas las ventas del turno, también las a crédito. */
  cantidad: number;
  /** Lo COBRADO en el turno (las 4 formas de cobro): las ventas a crédito no suman acá. */
  totalGeneral: number;
  porForma: Record<FormaPagoPos, number>;
  /** Ventas a crédito del turno: se vendieron pero todavía no se cobraron, no entran en la caja. */
  aCredito: { cantidad: number; total: number };
};

/** Suma las ventas de un turno, agrupadas por forma de pago. */
export function resumirTurno(ventas: VentaDeTurno[]): ResumenTurno {
  const porForma: Record<FormaPagoPos, number> = {
    efectivo: 0,
    transferencia: 0,
    tarjeta_debito: 0,
    tarjeta_credito: 0,
  };
  let totalGeneral = 0;
  const aCredito = { cantidad: 0, total: 0 };

  for (const v of ventas) {
    const monto = aNumero(v.total);
    // Una venta a crédito no es plata que entró: se cuenta aparte. Sin esto,
    // caería en "efectivo" (lo que no se reconoce se cuenta como efectivo) y
    // el corte de caja diría que falta plata que nunca entró.
    if (esVentaACredito(v.formaPago)) {
      aCredito.cantidad += 1;
      aCredito.total += monto;
      continue;
    }
    const forma = normalizarFormaPagoPos(v.formaPago);
    porForma[forma] += monto;
    totalGeneral += monto;
  }

  return { cantidad: ventas.length, totalGeneral, porForma, aCredito };
}

// ===========================================================================
//  Comparar lo calculado contra lo declarado, al cerrar el turno
// ===========================================================================

export type DeclaradoPorForma = Record<FormaPagoPos, number>;

export type FilaCierre = {
  forma: FormaPagoPos;
  etiqueta: string;
  calculado: number;
  declarado: number;
  diferencia: number;
};

export type CierreTurno = {
  porForma: FilaCierre[];
  totalCalculado: number;
  totalDeclarado: number;
  diferenciaTotal: number;
};

/** Arma la comparación fila por fila que se muestra en la pantalla de cierre. */
export function compararCierre(
  resumen: Pick<ResumenTurno, "cantidad" | "totalGeneral" | "porForma">,
  declarado: DeclaradoPorForma
): CierreTurno {
  const porForma: FilaCierre[] = FORMAS_PAGO_POS.map((f) => {
    const calculado = resumen.porForma[f.valor];
    const decl = declarado[f.valor] ?? 0;
    return { forma: f.valor, etiqueta: f.etiqueta, calculado, declarado: decl, diferencia: decl - calculado };
  });

  const totalDeclarado = porForma.reduce((s, f) => s + f.declarado, 0);

  return {
    porForma,
    totalCalculado: resumen.totalGeneral,
    totalDeclarado,
    diferenciaTotal: totalDeclarado - resumen.totalGeneral,
  };
}

// ===========================================================================
//  El comprobante de un turno ya cerrado
// ===========================================================================

/**
 * Los totales que quedaron congelados al cerrar.
 *
 * Vienen de la tabla TurnoPos, no de sumar las ventas otra vez — el
 * comprobante existe para decir qué se declaró ESE día, y eso no puede
 * cambiar porque después se edite algo.
 */
export type TurnoCongelado = {
  cantidadVentas: number;
  calculado: DeclaradoPorForma;
};

export type ContrasteTurno = {
  /** Si las ventas de hoy siguen dando lo mismo que se calculó al cerrar. */
  coincide: boolean;
  cantidadCongelada: number;
  cantidadAhora: number;
  totalCongelado: number;
  totalAhora: number;
};

/**
 * Compara lo que se calculó al cerrar contra lo que esas mismas ventas dicen
 * hoy — no sirve para corregir el comprobante (el número bueno es siempre el
 * congelado), sino para poder avisar en la hoja si algo se tocó después.
 */
export function contrastarTurno(ventas: VentaDeTurno[], congelado: TurnoCongelado): ContrasteTurno {
  const ahora = resumirTurno(ventas);
  const totalCongelado = FORMAS_PAGO_POS.reduce((s, f) => s + (congelado.calculado[f.valor] ?? 0), 0);

  return {
    coincide:
      congelado.cantidadVentas === ahora.cantidad &&
      Math.round(totalCongelado) === Math.round(ahora.totalGeneral),
    cantidadCongelada: congelado.cantidadVentas,
    cantidadAhora: ahora.cantidad,
    totalCongelado,
    totalAhora: ahora.totalGeneral,
  };
}
