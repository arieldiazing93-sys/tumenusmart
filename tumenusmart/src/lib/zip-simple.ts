/**
 * Un armador de archivos .zip mínimo, sin librerías: guarda cada archivo sin
 * comprimir ("stored"), que es un ZIP válido que abre cualquier programa.
 *
 * Existe para el archivo de importación de comprobantes de la DNIT (RG 90), que
 * tiene que ir comprimido en .zip con el mismo nombre del archivo que contiene.
 * Son archivos de texto chicos: no hace falta comprimirlos, y así no se suma
 * una dependencia solo para esto.
 *
 * Formato (PKWARE APPNOTE): por cada archivo un "local file header" seguido de
 * sus datos; después el directorio central con una entrada por archivo; y al
 * final el registro de cierre. Todo en little-endian.
 */

// Tabla del CRC-32 estándar (polinomio 0xEDB88320), armada una sola vez.
const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type EntradaZip = { nombre: string; datos: Uint8Array };

/** Fecha y hora en el formato de 16 bits de MS-DOS que usa el ZIP. */
function fechaHoraDos(fecha: Date): { hora: number; dia: number } {
  const anio = Math.max(fecha.getUTCFullYear(), 1980);
  return {
    hora: (fecha.getUTCHours() << 11) | (fecha.getUTCMinutes() << 5) | (fecha.getUTCSeconds() >> 1),
    dia: ((anio - 1980) << 9) | ((fecha.getUTCMonth() + 1) << 5) | fecha.getUTCDate(),
  };
}

/** Arma un .zip con los archivos dados, en ese orden. Los nombres se guardan en UTF-8. */
export function crearZip(entradas: EntradaZip[], ahora: Date = new Date()): Uint8Array {
  const { hora, dia } = fechaHoraDos(ahora);
  const UTF8 = 0x0800; // bit 11 del "general purpose flag": el nombre está en UTF-8

  const partesLocales: Uint8Array[] = [];
  const partesCentrales: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const e of entradas) {
    const nombre = new TextEncoder().encode(e.nombre);
    const crc = crc32(e.datos);
    const tamano = e.datos.length;

    // ---- encabezado local (30 bytes) + nombre + datos
    const local = new Uint8Array(30 + nombre.length + tamano);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true); // firma
    vl.setUint16(4, 20, true); // versión necesaria para abrirlo
    vl.setUint16(6, UTF8, true);
    vl.setUint16(8, 0, true); // método 0 = sin comprimir
    vl.setUint16(10, hora, true);
    vl.setUint16(12, dia, true);
    vl.setUint32(14, crc, true);
    vl.setUint32(18, tamano, true); // tamaño comprimido (= el original)
    vl.setUint32(22, tamano, true); // tamaño original
    vl.setUint16(26, nombre.length, true);
    vl.setUint16(28, 0, true); // sin campo extra
    local.set(nombre, 30);
    local.set(e.datos, 30 + nombre.length);
    partesLocales.push(local);

    // ---- entrada del directorio central (46 bytes) + nombre
    const central = new Uint8Array(46 + nombre.length);
    const vc = new DataView(central.buffer);
    vc.setUint32(0, 0x02014b50, true); // firma
    vc.setUint16(4, 20, true); // versión con la que se armó
    vc.setUint16(6, 20, true); // versión necesaria para abrirlo
    vc.setUint16(8, UTF8, true);
    vc.setUint16(10, 0, true); // método 0 = sin comprimir
    vc.setUint16(12, hora, true);
    vc.setUint16(14, dia, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, tamano, true);
    vc.setUint32(24, tamano, true);
    vc.setUint16(28, nombre.length, true);
    vc.setUint16(30, 0, true); // campo extra
    vc.setUint16(32, 0, true); // comentario
    vc.setUint16(34, 0, true); // número de disco
    vc.setUint16(36, 0, true); // atributos internos
    vc.setUint32(38, 0, true); // atributos externos
    vc.setUint32(42, desplazamiento, true); // dónde empieza su encabezado local
    central.set(nombre, 46);
    partesCentrales.push(central);

    desplazamiento += local.length;
  }

  const tamanoCentral = partesCentrales.reduce((s, p) => s + p.length, 0);

  // ---- registro de cierre (22 bytes)
  const fin = new Uint8Array(22);
  const vf = new DataView(fin.buffer);
  vf.setUint32(0, 0x06054b50, true); // firma
  vf.setUint16(4, 0, true); // número de este disco
  vf.setUint16(6, 0, true); // disco donde empieza el directorio central
  vf.setUint16(8, entradas.length, true); // entradas en este disco
  vf.setUint16(10, entradas.length, true); // entradas en total
  vf.setUint32(12, tamanoCentral, true);
  vf.setUint32(16, desplazamiento, true); // dónde empieza el directorio central
  vf.setUint16(20, 0, true); // sin comentario

  const zip = new Uint8Array(desplazamiento + tamanoCentral + fin.length);
  let pos = 0;
  for (const p of [...partesLocales, ...partesCentrales, fin]) {
    zip.set(p, pos);
    pos += p.length;
  }
  return zip;
}
