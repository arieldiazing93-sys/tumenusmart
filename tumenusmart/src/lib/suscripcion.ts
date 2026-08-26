/**
 * Reglas de vencimiento y cobranza.
 *
 * Puro a propósito: son las reglas que deciden si el negocio de un cliente
 * atiende o no atiende. Merecen poder probarse con casos armados a mano, sin
 * base de datos de por medio.
 *
 * La regla del vencimiento, decidida explícitamente: la fecha significa
 * "pagado hasta esa fecha INCLUSIVE". Un local con vencimiento el 30 atiende
 * todo el 30 y se apaga a la medianoche. Sin días de gracia.
 */

import { ZONA_NEGOCIO } from "./timezone";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** A partir de cuántos días por vencer se muestra el aviso en la cartera. */
export const DIAS_PARA_AVISAR = 7;

export type EstadoSuscripcion =
  | { clase: "sin_vencimiento"; etiqueta: string }
  | { clase: "suspendido"; etiqueta: string }
  | { clase: "vencido"; dias: number; etiqueta: string }
  | { clase: "por_vencer"; dias: number; etiqueta: string }
  | { clase: "al_dia"; dias: number; etiqueta: string };

/**
 * El instante exacto en que un local deja de atender.
 *
 * Es la medianoche siguiente a su fecha de vencimiento, en hora de Asunción.
 * Sin esto, un vencimiento guardado como "30 de septiembre a las 00:00" haría
 * que el local se apagara al empezar el 30 en vez de al terminarlo — y el
 * cliente que pagó hasta el 30 tendría razón en quejarse.
 */
export function momentoDeCorte(vencimiento: Date, zona: string = ZONA_NEGOCIO): Date {
  const clave = claveDia(vencimiento, zona);
  const [a, m, d] = clave.split("-").map(Number);
  // Medianoche del día SIGUIENTE, en hora local, expresada en UTC.
  const medianocheSiguienteUTC = Date.UTC(a, m - 1, d + 1);
  return new Date(medianocheSiguienteUTC + desfaseHorario(zona, vencimiento) * 60000);
}

/** "AAAA-MM-DD" del día al que pertenece un instante, en la zona indicada. */
function claveDia(fecha: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const y = partes.find((p) => p.type === "year")?.value ?? "1970";
  const m = partes.find((p) => p.type === "month")?.value ?? "01";
  const d = partes.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/**
 * Cuántos minutos hay que sumarle a la hora local para obtener UTC.
 *
 * Asunción está detrás de UTC, así que da un número positivo. Se calcula en
 * vez de escribirlo fijo para que un cambio de horario de verano no lo rompa.
 */
function desfaseHorario(zona: string, referencia: Date = new Date()): number {
  const enZona = new Date(referencia.toLocaleString("en-US", { timeZone: zona }));
  const enUTC = new Date(referencia.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((enUTC.getTime() - enZona.getTime()) / 60000);
}

/** ¿Este local ya dejó de atender? */
export function estaVencido(
  vencimiento: Date | null,
  ahora: Date = new Date(),
  zona: string = ZONA_NEGOCIO
): boolean {
  if (!vencimiento) return false;
  return ahora >= momentoDeCorte(vencimiento, zona);
}

/** Días completos que faltan para el corte. Negativo si ya pasó. */
export function diasHastaVencer(
  vencimiento: Date,
  ahora: Date = new Date(),
  zona: string = ZONA_NEGOCIO
): number {
  const corte = momentoDeCorte(vencimiento, zona).getTime();
  return Math.ceil((corte - ahora.getTime()) / MS_POR_DIA);
}

/**
 * Cómo está la suscripción de un local, en un solo objeto listo para mostrar.
 */
export function estadoSuscripcion(
  local: { estado: string; vencimiento: Date | null },
  ahora: Date = new Date(),
  zona: string = ZONA_NEGOCIO
): EstadoSuscripcion {
  if (local.estado === "suspendido") {
    return { clase: "suspendido", etiqueta: "Suspendido a mano" };
  }

  if (!local.vencimiento) {
    return { clase: "sin_vencimiento", etiqueta: "Sin fecha de vencimiento" };
  }

  const dias = diasHastaVencer(local.vencimiento, ahora, zona);

  if (dias <= 0) {
    const vencidoHace = Math.abs(dias);
    return {
      clase: "vencido",
      dias: vencidoHace,
      etiqueta:
        vencidoHace === 0
          ? "Vencido hoy"
          : `Vencido hace ${vencidoHace} ${vencidoHace === 1 ? "día" : "días"}`,
    };
  }

  if (dias <= DIAS_PARA_AVISAR) {
    return {
      clase: "por_vencer",
      dias,
      etiqueta: dias === 1 ? "Vence mañana" : `Vence en ${dias} días`,
    };
  }

  return { clase: "al_dia", dias, etiqueta: `Vence en ${dias} días` };
}

/**
 * Hasta cuándo queda cubierto un local al registrarle un pago.
 *
 * Si todavía no venció, los meses se suman a su vencimiento actual y no a hoy:
 * pagar antes de tiempo no puede hacerle perder los días que ya tenía.
 */
export function calcularNuevoVencimiento(
  vencimientoActual: Date | null,
  meses: number,
  ahora: Date = new Date(),
  zona: string = ZONA_NEGOCIO
): Date {
  const base =
    vencimientoActual && !estaVencido(vencimientoActual, ahora, zona)
      ? vencimientoActual
      : ahora;

  const clave = claveDia(base, zona);
  const [a, m, d] = clave.split("-").map(Number);

  // Se suma en meses de calendario. Si el día no existe en el mes destino
  // —un 31 cayendo en un mes de 30— JavaScript lo corre al mes siguiente, así
  // que se retrocede al último día real del mes.
  const tentativa = new Date(Date.UTC(a, m - 1 + meses, d));
  if (tentativa.getUTCDate() !== d) {
    tentativa.setUTCDate(0);
  }

  return new Date(
    Date.UTC(tentativa.getUTCFullYear(), tentativa.getUTCMonth(), tentativa.getUTCDate()) +
      desfaseHorario(zona, base) * 60000
  );
}

/** Texto del recordatorio de vencimiento, listo para mandar por WhatsApp. */
export function mensajeRecordatorio(
  nombreLocal: string,
  estado: EstadoSuscripcion
): string {
  const saludo = `Hola! Te escribo de TuMenuSmart por la suscripción de ${nombreLocal}.`;

  if (estado.clase === "vencido") {
    return (
      `${saludo}\n\n` +
      `El servicio venció y el menú dejó de tomar pedidos. ` +
      `Apenas registremos el pago vuelve a funcionar al instante.\n\n` +
      `¿Te paso los datos para la transferencia?`
    );
  }

  if (estado.clase === "por_vencer") {
    const cuando = estado.dias === 1 ? "mañana" : `en ${estado.dias} días`;
    return (
      `${saludo}\n\n` +
      `Te aviso que vence ${cuando}. Si querés lo renovamos antes para que ` +
      `no se te corte el menú.\n\n` +
      `¿Te paso los datos para la transferencia?`
    );
  }

  return `${saludo}\n\n¿Cómo va todo con el sistema?`;
}
