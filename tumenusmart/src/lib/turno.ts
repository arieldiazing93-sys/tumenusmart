/**
 * La jornada de trabajo de un local de comida.
 *
 * Una noche de servicio NO es un día del calendario, y esa diferencia es
 * justo la que rompe el cierre de caja: el turno arranca el 29 a la tarde y
 * los últimos pedidos se entregan a las 2 de la madrugada del 30. Si se
 * filtrara "los pedidos del 29", esas entregas de la madrugada quedarían
 * afuera y el repartidor rendiría de menos.
 *
 * Por eso la jornada corre de las 6 de la mañana de un día a las 6 de la
 * mañana del siguiente. A esa hora ningún local está entregando pedidos, así
 * que el corte nunca parte un turno al medio.
 */
import { inicioDeHoyEnAsuncion, ZONA_NEGOCIO } from "./timezone";

/** A qué hora se considera que empieza una jornada nueva. */
export const HORA_CORTE = 6;

export type Rango = { desde: Date; hasta: Date };

/**
 * La jornada a la que pertenece un instante.
 *
 * Antes de las 6 de la mañana todavía se está trabajando la noche anterior,
 * así que la jornada arrancó el día anterior.
 */
export function jornadaDe(referencia: Date = new Date(), corte = HORA_CORTE): Rango {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONA_NEGOCIO,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(referencia)
  );

  const medianoche = inicioDeHoyEnAsuncion(referencia);
  const unDia = 24 * 3_600_000;
  const inicioHoy = new Date(medianoche.getTime() + corte * 3_600_000);

  const desde = hora < corte ? new Date(inicioHoy.getTime() - unDia) : inicioHoy;
  return { desde, hasta: new Date(desde.getTime() + unDia) };
}

/** La jornada anterior a la de `referencia`. */
export function jornadaAnterior(referencia: Date = new Date(), corte = HORA_CORTE): Rango {
  const actual = jornadaDe(referencia, corte);
  const unDia = 24 * 3_600_000;
  return {
    desde: new Date(actual.desde.getTime() - unDia),
    hasta: actual.desde,
  };
}

/**
 * Si un instante cae dentro del rango.
 *
 * El inicio entra y el final no. Con dos jornadas seguidas, un pedido
 * entregado exactamente a las 6:00 tiene que contarse en UNA sola: si los dos
 * extremos fueran inclusivos aparecería en las dos y se rendiría dos veces.
 */
export function dentroDelRango(instante: Date | null, rango: Rango | null): boolean {
  if (!rango) return true;
  if (!instante) return false;
  const t = instante.getTime();
  return t >= rango.desde.getTime() && t < rango.hasta.getTime();
}

/** Valida un rango escrito a mano. Devuelve el error en criollo, o null. */
export function revisarRango(desde: Date | null, hasta: Date | null): string | null {
  if (!desde || !hasta) return "Poné las dos fechas, desde y hasta.";
  if (hasta.getTime() <= desde.getTime()) {
    return "La fecha de fin tiene que ser posterior a la de inicio.";
  }
  // 45 días: más que eso no es un turno, es un error de tipeo (poner 2025 en
  // vez de 2026, por ejemplo) y traería media base a la pantalla.
  if (hasta.getTime() - desde.getTime() > 45 * 24 * 3_600_000) {
    return "Ese rango es de más de 45 días. Revisá las fechas.";
  }
  return null;
}
