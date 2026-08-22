/**
 * Generador de códigos QR, escrito desde cero.
 *
 * Está hecho a mano en vez de sumar una librería para no agregar
 * dependencias nuevas al proyecto. Cubre lo que necesitamos: modo byte
 * (URLs), nivel de corrección de errores M (recupera ~15%, buen margen
 * para un cartel impreso que se ensucia o se raya) y versiones 1 a 15,
 * que alcanzan de sobra para cualquier URL de un negocio.
 *
 * La salida es una matriz de booleanos: true = módulo negro.
 */

// ---------------------------------------------------------------------------
// Campo de Galois GF(256), la aritmética que usa Reed-Solomon
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function inicializarTablas() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // polinomio primitivo del estándar QR
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function multiplicar(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Polinomio generador de grado `grado`, para Reed-Solomon. */
function polinomioGenerador(grado: number): number[] {
  let poly = [1];
  for (let i = 0; i < grado; i++) {
    const nuevo = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      nuevo[j] ^= poly[j];
      nuevo[j + 1] ^= multiplicar(poly[j], EXP[i]);
    }
    poly = nuevo;
  }
  return poly;
}

/** Codewords de corrección de errores para un bloque de datos. */
function codewordsCorreccion(datos: number[], cantidad: number): number[] {
  const generador = polinomioGenerador(cantidad);
  const resto = datos.concat(new Array<number>(cantidad).fill(0));

  for (let i = 0; i < datos.length; i++) {
    const coeficiente = resto[i];
    if (coeficiente === 0) continue;
    for (let j = 0; j < generador.length; j++) {
      resto[i + j] ^= multiplicar(generador[j], coeficiente);
    }
  }

  return resto.slice(datos.length);
}

// ---------------------------------------------------------------------------
// Tablas del estándar (nivel de corrección M, versiones 1 a 15)
// ---------------------------------------------------------------------------

type EspecificacionVersion = {
  /** codewords totales del símbolo */
  total: number;
  /** codewords de corrección por bloque */
  ecPorBloque: number;
  /** bloques del grupo 1 y cuántos codewords de datos tiene cada uno */
  bloques1: number;
  datos1: number;
  /** ídem grupo 2 (0 cuando la versión usa un solo grupo) */
  bloques2: number;
  datos2: number;
};

const VERSIONES: EspecificacionVersion[] = [
  { total: 26, ecPorBloque: 10, bloques1: 1, datos1: 16, bloques2: 0, datos2: 0 },
  { total: 44, ecPorBloque: 16, bloques1: 1, datos1: 28, bloques2: 0, datos2: 0 },
  { total: 70, ecPorBloque: 26, bloques1: 1, datos1: 44, bloques2: 0, datos2: 0 },
  { total: 100, ecPorBloque: 18, bloques1: 2, datos1: 32, bloques2: 0, datos2: 0 },
  { total: 134, ecPorBloque: 24, bloques1: 2, datos1: 43, bloques2: 0, datos2: 0 },
  { total: 172, ecPorBloque: 16, bloques1: 4, datos1: 27, bloques2: 0, datos2: 0 },
  { total: 196, ecPorBloque: 18, bloques1: 4, datos1: 31, bloques2: 0, datos2: 0 },
  { total: 242, ecPorBloque: 22, bloques1: 2, datos1: 38, bloques2: 2, datos2: 39 },
  { total: 292, ecPorBloque: 22, bloques1: 3, datos1: 36, bloques2: 2, datos2: 37 },
  { total: 346, ecPorBloque: 26, bloques1: 4, datos1: 43, bloques2: 1, datos2: 44 },
  { total: 404, ecPorBloque: 30, bloques1: 1, datos1: 50, bloques2: 4, datos2: 51 },
  { total: 466, ecPorBloque: 22, bloques1: 6, datos1: 36, bloques2: 2, datos2: 37 },
  { total: 532, ecPorBloque: 22, bloques1: 8, datos1: 37, bloques2: 1, datos2: 38 },
  { total: 581, ecPorBloque: 24, bloques1: 4, datos1: 40, bloques2: 5, datos2: 41 },
  { total: 655, ecPorBloque: 24, bloques1: 5, datos1: 41, bloques2: 5, datos2: 42 },
];

/** Centros de los patrones de alineación, por versión (índice 0 = versión 1). */
const ALINEACION: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
];

/** Capacidad de datos en codewords de una versión. */
function capacidadDatos(spec: EspecificacionVersion): number {
  return spec.bloques1 * spec.datos1 + spec.bloques2 * spec.datos2;
}

// ---------------------------------------------------------------------------
// Codificación de los datos
// ---------------------------------------------------------------------------

class FlujoDeBits {
  private bits: number[] = [];

  agregar(valor: number, longitud: number): void {
    for (let i = longitud - 1; i >= 0; i--) {
      this.bits.push((valor >>> i) & 1);
    }
  }

  get longitud(): number {
    return this.bits.length;
  }

  aCodewords(): number[] {
    const codewords: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | (this.bits[i + j] ?? 0);
      }
      codewords.push(byte);
    }
    return codewords;
  }
}

/** Elige la versión más chica en la que entra el texto. */
function elegirVersion(cantidadBytes: number): number {
  for (let version = 1; version <= VERSIONES.length; version++) {
    const spec = VERSIONES[version - 1];
    const bitsIndicador = version <= 9 ? 8 : 16;
    // 4 bits de modo + indicador de longitud + los datos
    const bitsNecesarios = 4 + bitsIndicador + cantidadBytes * 8;
    if (bitsNecesarios <= capacidadDatos(spec) * 8) return version;
  }
  throw new Error("El texto es demasiado largo para generar un QR");
}

function construirCodewords(texto: string, version: number): number[] {
  const spec = VERSIONES[version - 1];
  const bytes = Array.from(new TextEncoder().encode(texto));
  const capacidad = capacidadDatos(spec);

  const flujo = new FlujoDeBits();
  flujo.agregar(0b0100, 4); // modo byte
  flujo.agregar(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) flujo.agregar(b, 8);

  // Terminador: hasta 4 bits de cero, si hay lugar.
  const bitsRestantes = capacidad * 8 - flujo.longitud;
  flujo.agregar(0, Math.min(4, bitsRestantes));
  // Relleno hasta completar el byte.
  if (flujo.longitud % 8 !== 0) flujo.agregar(0, 8 - (flujo.longitud % 8));

  const codewords = flujo.aCodewords();
  // Bytes de relleno alternados, como pide el estándar.
  const RELLENO = [0xec, 0x11];
  let i = 0;
  while (codewords.length < capacidad) {
    codewords.push(RELLENO[i++ % 2]);
  }

  return codewords;
}

/** Divide en bloques, calcula corrección y entrelaza todo. */
function entrelazar(codewords: number[], version: number): number[] {
  const spec = VERSIONES[version - 1];

  const bloquesDatos: number[][] = [];
  const bloquesEC: number[][] = [];
  let cursor = 0;

  const grupos = [
    { cantidad: spec.bloques1, tamano: spec.datos1 },
    { cantidad: spec.bloques2, tamano: spec.datos2 },
  ];

  for (const grupo of grupos) {
    for (let b = 0; b < grupo.cantidad; b++) {
      const bloque = codewords.slice(cursor, cursor + grupo.tamano);
      cursor += grupo.tamano;
      bloquesDatos.push(bloque);
      bloquesEC.push(codewordsCorreccion(bloque, spec.ecPorBloque));
    }
  }

  const resultado: number[] = [];

  const maxDatos = Math.max(...bloquesDatos.map((b) => b.length));
  for (let i = 0; i < maxDatos; i++) {
    for (const bloque of bloquesDatos) {
      if (i < bloque.length) resultado.push(bloque[i]);
    }
  }

  for (let i = 0; i < spec.ecPorBloque; i++) {
    for (const bloque of bloquesEC) {
      resultado.push(bloque[i]);
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------------
// Armado de la matriz
// ---------------------------------------------------------------------------

type Matriz = {
  /** true = módulo negro */
  modulos: boolean[][];
  /** true = posición reservada (patrones), no se puede escribir datos */
  reservado: boolean[][];
  tamano: number;
};

function crearMatriz(tamano: number): Matriz {
  return {
    modulos: Array.from({ length: tamano }, () => new Array<boolean>(tamano).fill(false)),
    reservado: Array.from({ length: tamano }, () => new Array<boolean>(tamano).fill(false)),
    tamano,
  };
}

function ponerPatronBusqueda(m: Matriz, fila: number, columna: number): void {
  for (let f = -1; f <= 7; f++) {
    for (let c = -1; c <= 7; c++) {
      const y = fila + f;
      const x = columna + c;
      if (y < 0 || y >= m.tamano || x < 0 || x >= m.tamano) continue;
      const enBorde = f === 0 || f === 6 || c === 0 || c === 6;
      const enCentro = f >= 2 && f <= 4 && c >= 2 && c <= 4;
      m.modulos[y][x] = (enBorde && f >= 0 && f <= 6 && c >= 0 && c <= 6) || enCentro;
      m.reservado[y][x] = true;
    }
  }
}

function ponerPatronAlineacion(m: Matriz, fila: number, columna: number): void {
  for (let f = -2; f <= 2; f++) {
    for (let c = -2; c <= 2; c++) {
      const y = fila + f;
      const x = columna + c;
      m.modulos[y][x] = Math.max(Math.abs(f), Math.abs(c)) !== 1;
      m.reservado[y][x] = true;
    }
  }
}

function ponerPatronesFijos(m: Matriz, version: number): void {
  ponerPatronBusqueda(m, 0, 0);
  ponerPatronBusqueda(m, 0, m.tamano - 7);
  ponerPatronBusqueda(m, m.tamano - 7, 0);

  // Líneas de temporización
  for (let i = 8; i < m.tamano - 8; i++) {
    const negro = i % 2 === 0;
    m.modulos[6][i] = negro;
    m.reservado[6][i] = true;
    m.modulos[i][6] = negro;
    m.reservado[i][6] = true;
  }

  // Patrones de alineación (no van encima de los de búsqueda)
  const centros = ALINEACION[version - 1];
  for (const fila of centros) {
    for (const columna of centros) {
      const enBusqueda =
        (fila <= 8 && columna <= 8) ||
        (fila <= 8 && columna >= m.tamano - 9) ||
        (fila >= m.tamano - 9 && columna <= 8);
      if (!enBusqueda) ponerPatronAlineacion(m, fila, columna);
    }
  }

  // Módulo negro fijo
  m.modulos[m.tamano - 8][8] = true;
  m.reservado[m.tamano - 8][8] = true;

  // Reserva del área de información de formato
  for (let i = 0; i < 9; i++) {
    if (!m.reservado[8][i]) m.reservado[8][i] = true;
    if (!m.reservado[i][8]) m.reservado[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    m.reservado[8][m.tamano - 1 - i] = true;
    m.reservado[m.tamano - 1 - i][8] = true;
  }

  // Reserva del área de información de versión (solo versión 7 en adelante)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        m.reservado[m.tamano - 11 + j][i] = true;
        m.reservado[i][m.tamano - 11 + j] = true;
      }
    }
  }
}

/** Recorrido en zigzag de derecha a izquierda, salteando la columna 6. */
function colocarDatos(m: Matriz, datos: number[]): void {
  let indiceBit = 0;
  const totalBits = datos.length * 8;
  let haciaArriba = true;

  for (let columnaBase = m.tamano - 1; columnaBase > 0; columnaBase -= 2) {
    // La columna 6 es la línea de temporización vertical: se saltea.
    const col = columnaBase <= 6 ? columnaBase - 1 : columnaBase;

    for (let paso = 0; paso < m.tamano; paso++) {
      const fila = haciaArriba ? m.tamano - 1 - paso : paso;
      for (const columna of [col, col - 1]) {
        if (m.reservado[fila][columna]) continue;
        let bit = false;
        if (indiceBit < totalBits) {
          const byte = datos[indiceBit >>> 3];
          bit = ((byte >>> (7 - (indiceBit & 7))) & 1) === 1;
        }
        m.modulos[fila][columna] = bit;
        indiceBit++;
      }
    }
    haciaArriba = !haciaArriba;
  }
}

function condicionMascara(mascara: number, fila: number, columna: number): boolean {
  switch (mascara) {
    case 0: return (fila + columna) % 2 === 0;
    case 1: return fila % 2 === 0;
    case 2: return columna % 3 === 0;
    case 3: return (fila + columna) % 3 === 0;
    case 4: return (Math.floor(fila / 2) + Math.floor(columna / 3)) % 2 === 0;
    case 5: return ((fila * columna) % 2) + ((fila * columna) % 3) === 0;
    case 6: return (((fila * columna) % 2) + ((fila * columna) % 3)) % 2 === 0;
    default: return (((fila + columna) % 2) + ((fila * columna) % 3)) % 2 === 0;
  }
}

function aplicarMascara(m: Matriz, mascara: number): boolean[][] {
  return m.modulos.map((filaModulos, fila) =>
    filaModulos.map((valor, columna) =>
      m.reservado[fila][columna] ? valor : valor !== condicionMascara(mascara, fila, columna)
    )
  );
}

/** Información de formato: nivel M + máscara, con BCH y XOR del estándar. */
function bitsFormato(mascara: number): number[] {
  const NIVEL_M = 0b00;
  let datos = (NIVEL_M << 3) | mascara;
  let bch = datos << 10;

  for (let i = 4; i >= 0; i--) {
    if ((bch >>> (10 + i)) & 1) bch ^= 0b10100110111 << i;
  }

  const formato = ((datos << 10) | bch) ^ 0b101010000010010;
  datos = formato;

  const bits: number[] = [];
  for (let i = 14; i >= 0; i--) bits.push((formato >>> i) & 1);
  return bits;
}

function ponerFormato(modulos: boolean[][], tamano: number, mascara: number): void {
  // bits[0] es el bit MÁS significativo, y así se van colocando: el primer
  // módulo de cada copia lleva el bit más significativo. (Invertir esto es
  // un error silencioso: el código se ve perfecto pero ningún lector lo
  // puede interpretar.)
  const bits = bitsFormato(mascara);

  // Copia 1: alrededor del patrón de búsqueda superior izquierdo.
  for (let i = 0; i <= 5; i++) modulos[8][i] = bits[i] === 1;
  modulos[8][7] = bits[6] === 1;
  modulos[8][8] = bits[7] === 1;
  modulos[7][8] = bits[8] === 1;
  for (let i = 9; i <= 14; i++) modulos[14 - i][8] = bits[i] === 1;

  // Copia 2: repartida entre los otros dos patrones de búsqueda.
  for (let i = 0; i <= 7; i++) modulos[tamano - 1 - i][8] = bits[i] === 1;
  for (let i = 8; i <= 14; i++) modulos[8][tamano - 15 + i] = bits[i] === 1;

  // Módulo negro fijo: pisa el último bit de la copia 2, como manda el
  // estándar (ese bit sobrevive igual en la copia 1).
  modulos[tamano - 8][8] = true;
}

/** Información de versión (solo 7 en adelante), 18 bits con BCH. */
function ponerVersion(modulos: boolean[][], tamano: number, version: number): void {
  if (version < 7) return;

  let bch = version << 12;
  for (let i = 5; i >= 0; i--) {
    if ((bch >>> (12 + i)) & 1) bch ^= 0b1111100100 << i;
  }
  const info = (version << 12) | bch;

  for (let i = 0; i < 18; i++) {
    const bit = ((info >>> i) & 1) === 1;
    const fila = Math.floor(i / 3);
    const columna = i % 3;
    modulos[tamano - 11 + columna][fila] = bit;
    modulos[fila][tamano - 11 + columna] = bit;
  }
}

/** Puntaje de penalización: cuanto más bajo, más fácil de leer es el código. */
function penalizacion(modulos: boolean[][], tamano: number): number {
  let total = 0;

  // Regla 1: rachas de 5 o más módulos del mismo color.
  for (let i = 0; i < tamano; i++) {
    for (const esFila of [true, false]) {
      let racha = 1;
      for (let j = 1; j < tamano; j++) {
        const actual = esFila ? modulos[i][j] : modulos[j][i];
        const previo = esFila ? modulos[i][j - 1] : modulos[j - 1][i];
        if (actual === previo) {
          racha++;
        } else {
          if (racha >= 5) total += 3 + (racha - 5);
          racha = 1;
        }
      }
      if (racha >= 5) total += 3 + (racha - 5);
    }
  }

  // Regla 2: bloques de 2x2 del mismo color.
  for (let f = 0; f < tamano - 1; f++) {
    for (let c = 0; c < tamano - 1; c++) {
      const v = modulos[f][c];
      if (v === modulos[f][c + 1] && v === modulos[f + 1][c] && v === modulos[f + 1][c + 1]) {
        total += 3;
      }
    }
  }

  // Regla 3: patrones que se confunden con los de búsqueda.
  const PATRON_A = [true, false, true, true, true, false, true, false, false, false, false];
  const PATRON_B = [false, false, false, false, true, false, true, true, true, false, true];
  for (let i = 0; i < tamano; i++) {
    for (let j = 0; j <= tamano - 11; j++) {
      let coincideFilaA = true;
      let coincideFilaB = true;
      let coincideColA = true;
      let coincideColB = true;
      for (let k = 0; k < 11; k++) {
        const enFila = modulos[i][j + k];
        const enColumna = modulos[j + k][i];
        if (enFila !== PATRON_A[k]) coincideFilaA = false;
        if (enFila !== PATRON_B[k]) coincideFilaB = false;
        if (enColumna !== PATRON_A[k]) coincideColA = false;
        if (enColumna !== PATRON_B[k]) coincideColB = false;
      }
      if (coincideFilaA) total += 40;
      if (coincideFilaB) total += 40;
      if (coincideColA) total += 40;
      if (coincideColB) total += 40;
    }
  }

  // Regla 4: desbalance entre módulos claros y oscuros.
  let oscuros = 0;
  for (let f = 0; f < tamano; f++) {
    for (let c = 0; c < tamano; c++) if (modulos[f][c]) oscuros++;
  }
  const porcentaje = (oscuros * 100) / (tamano * tamano);
  total += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;

  return total;
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

/**
 * Genera la matriz del QR para `texto`.
 * Devuelve un arreglo de filas de booleanos, donde true = módulo negro.
 * No incluye el margen blanco: eso lo agrega quien lo dibuja.
 */
export function generarMatrizQR(texto: string): boolean[][] {
  if (!texto) throw new Error("No hay texto para codificar");

  const bytes = new TextEncoder().encode(texto).length;
  const version = elegirVersion(bytes);
  const tamano = 17 + version * 4;

  const codewords = construirCodewords(texto, version);
  const datosFinales = entrelazar(codewords, version);

  const matriz = crearMatriz(tamano);
  ponerPatronesFijos(matriz, version);
  colocarDatos(matriz, datosFinales);

  // Se prueban las 8 máscaras y se queda la de menor penalización.
  let mejor: boolean[][] | null = null;
  let mejorPuntaje = Infinity;

  for (let mascara = 0; mascara < 8; mascara++) {
    const candidata = aplicarMascara(matriz, mascara);
    ponerFormato(candidata, tamano, mascara);
    ponerVersion(candidata, tamano, version);
    const puntaje = penalizacion(candidata, tamano);
    if (puntaje < mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = candidata;
    }
  }

  return mejor as boolean[][];
}
