/**
 * Reconocer cuándo lo que llegó por teclado es un LECTOR de códigos de barras y no una persona escribiendo.
 *
 * Un lector láser (USB o Bluetooth, de cualquier marca) funciona como un teclado: «escribe» los números del código de golpe y termina con Enter.
 * No hace falta ningún programa. Lo que lo distingue de una persona es la VELOCIDAD: un lector entrega cada carácter en unos pocos milisegundos
 * (5 a 30), mientras que quien escribe más rápido no baja de unos 80 ms entre tecla y tecla.
 *
 * Este módulo es la cuenta pura (sin pantalla): recibe cada tecla con su hora y avisa cuando una ráfaga rápida terminó en Enter. El gancho de
 * React que lo conecta con la pantalla está en src/components/useLectorDeCodigos.ts.
 */

/** Entre una tecla y la siguiente de un mismo código pasa menos que esto. Una persona escribiendo (incluso rápido) pasa de largo. */
export const MAX_MS_ENTRE_TECLAS = 60;
/** Un código más corto que esto no se toma por un escaneo (un «5» y Enter es una persona). */
export const LARGO_MINIMO_ESCANEO = 4;

export type EventoDeTecla =
  /** La tecla no es parte de un código (Shift, flechas…): no cambia nada. */
  | { tipo: "ignorada" }
  /** Un carácter que podría ser parte de un escaneo. `primero` = es el primero de una ráfaga nueva. */
  | { tipo: "caracter"; primero: boolean }
  /** Se apretó Enter (o Tab) y lo anterior fue una ráfaga rápida: es un escaneo. */
  | { tipo: "escaneo"; codigo: string }
  /** Se apretó Enter (o Tab) pero lo anterior no era un lector (o no había nada): una tecla común. */
  | { tipo: "enter_comun" };

export type DetectorDeEscaneo = {
  /** Registra una tecla (su `key`) apretada a la hora `t` (en milisegundos). */
  tecla(clave: string, t: number): EventoDeTecla;
  /** Olvida lo acumulado (cuando se cambia de campo, por ejemplo). */
  reiniciar(): void;
};

export function crearDetectorDeEscaneo(opciones?: { maxMsEntreTeclas?: number; largoMinimo?: number }): DetectorDeEscaneo {
  const maxMs = opciones?.maxMsEntreTeclas ?? MAX_MS_ENTRE_TECLAS;
  const largoMinimo = opciones?.largoMinimo ?? LARGO_MINIMO_ESCANEO;
  let acumulado = "";
  let ultima = 0;
  // Si alguna pausa de la ráfaga pasó del límite, no era un lector (una persona que escribe y para).
  let rapida = true;

  function reiniciar() {
    acumulado = "";
    ultima = 0;
    rapida = true;
  }

  return {
    reiniciar,
    tecla(clave, t) {
      if (clave === "Enter" || clave === "Tab") {
        const esEscaneo = rapida && acumulado.length >= largoMinimo && t - ultima <= maxMs * 4;
        const codigo = acumulado;
        reiniciar();
        return esEscaneo ? { tipo: "escaneo", codigo } : { tipo: "enter_comun" };
      }
      // Solo cuentan los caracteres sueltos (una letra o un número). Shift, Control, flechas… llegan con nombre largo y se saltean:
      // un lector con letras manda un Shift antes de cada mayúscula y eso no tiene que cortar la ráfaga.
      if (clave.length !== 1) return { tipo: "ignorada" };

      let primero = false;
      if (acumulado.length === 0 || t - ultima > maxMs) {
        // Empieza una ráfaga nueva: lo que había se olvida.
        acumulado = "";
        rapida = true;
        primero = true;
      }
      acumulado += clave;
      ultima = t;
      return { tipo: "caracter", primero };
    },
  };
}

/**
 * El análisis de lo que tecleó un lector, para la pantalla «Probar lector»: cuántos caracteres, qué tan rápido y cómo terminó. Dice si se
 * comporta como un lector (rápido, con Enter al final) o parece una persona escribiendo.
 */
export type AnalisisDeRafaga = {
  texto: string;
  largo: number;
  /** Promedio de milisegundos entre una tecla y la siguiente (0 si hubo un solo carácter). */
  promedioMs: number;
  maxMs: number;
  /** Con qué tecla terminó: "Enter", "Tab" o null si no terminó con ninguna. */
  terminador: "Enter" | "Tab" | null;
  veredicto: "lector" | "persona" | "sin_terminador" | "corto";
  mensaje: string;
};

export function analizarRafaga(
  teclas: { clave: string; t: number }[],
  opciones?: { maxMsEntreTeclas?: number; largoMinimo?: number }
): AnalisisDeRafaga {
  const maxLimite = opciones?.maxMsEntreTeclas ?? MAX_MS_ENTRE_TECLAS;
  const largoMinimo = opciones?.largoMinimo ?? LARGO_MINIMO_ESCANEO;
  let texto = "";
  const tiempos: number[] = [];
  let terminador: "Enter" | "Tab" | null = null;
  for (const { clave, t } of teclas) {
    if (clave === "Enter" || clave === "Tab") {
      terminador = clave;
      continue;
    }
    if (clave.length !== 1) continue;
    texto += clave;
    tiempos.push(t);
  }
  const pausas = tiempos.slice(1).map((t, i) => t - tiempos[i]);
  const promedioMs = pausas.length ? Math.round(pausas.reduce((a, b) => a + b, 0) / pausas.length) : 0;
  const maxMs = pausas.length ? Math.round(Math.max(...pausas)) : 0;
  const base = { texto, largo: texto.length, promedioMs, maxMs, terminador };
  if (texto.length < largoMinimo) {
    return { ...base, veredicto: "corto", mensaje: `Llegaron solo ${texto.length} caracteres: un código tiene al menos ${largoMinimo}.` };
  }
  if (maxMs > maxLimite) {
    return {
      ...base,
      veredicto: "persona",
      mensaje: `Hubo pausas de ${maxMs} ms entre un número y otro: parece escrito a mano. Un lector entrega todo de golpe (menos de ${maxLimite} ms entre números).`,
    };
  }
  if (!terminador) {
    return {
      ...base,
      veredicto: "sin_terminador",
      mensaje: "El lector entregó los números pero no terminó con Enter. Hay que configurarlo para que agregue Enter al final (casi todos lo traen así de fábrica).",
    };
  }
  return {
    ...base,
    veredicto: "lector",
    mensaje: `Se lee como un lector: ${texto.length} caracteres en promedio cada ${promedioMs} ms y terminó con ${terminador}.`,
  };
}
