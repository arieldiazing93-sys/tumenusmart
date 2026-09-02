/**
 * Comprime una foto en el navegador, antes de subirla.
 *
 * Por qué del lado del cliente y no del servidor:
 *
 *   - No hace falta ninguna librería nueva. El navegador ya sabe decodificar,
 *     redimensionar y volver a codificar imágenes.
 *   - Le ahorra datos móviles a quien sube. Un encargado cargando la carta
 *     desde el celular en el local sube 60 KB en vez de 3 MB por foto.
 *   - Lo que se guarda ya está comprimido, así que ahorra en almacenamiento y
 *     en transferencia para siempre, no solo una vez.
 *
 * En la carta las fotos se muestran a 96 píxeles. Guardar el original de la
 * cámara es descargar varios megas para pintar una miniatura.
 */

export type OpcionesCompresion = {
  /** Lado más largo de la imagen resultante, en píxeles. */
  ladoMaximo: number;
  /** Entre 0 y 1. Por encima de 0.85 el archivo crece sin que se note. */
  calidad: number;
};

export const PARA_PRODUCTO: OpcionesCompresion = { ladoMaximo: 900, calidad: 0.8 };
export const PARA_LOGO: OpcionesCompresion = { ladoMaximo: 500, calidad: 0.85 };
// Se muestra a lo ancho de toda la pantalla, no como miniatura — necesita más
// resolución que el logo, pero sigue sin hacer falta el original de cámara.
export const PARA_PORTADA: OpcionesCompresion = { ladoMaximo: 1200, calidad: 0.8 };

/** Más grande que esto ni se intenta: sería lentísimo y no es una foto normal. */
const TAMANO_MAXIMO_ACEPTADO = 25 * 1024 * 1024;

/**
 * Formatos que NO se tocan.
 *
 * Un GIF perdería la animación al pasar por el lienzo, y un SVG se
 * convertiría en píxeles perdiendo justamente lo que lo hace liviano.
 */
const NO_COMPRIMIR = new Set(["image/gif", "image/svg+xml"]);

export type ResultadoCompresion = {
  archivo: File;
  bytesAntes: number;
  bytesDespues: number;
  /** false cuando se devolvió el original sin tocar, y por qué. */
  comprimida: boolean;
  motivo?: string;
};

/**
 * Calcula el tamaño final respetando la proporción.
 *
 * Nunca agranda: una imagen ya chica se deja como está. Agrandarla sumaría
 * peso sin sumar un solo detalle.
 */
export function calcularMedidas(
  ancho: number,
  alto: number,
  ladoMaximo: number
): { ancho: number; alto: number } {
  const lado = Math.max(ancho, alto);
  if (lado <= ladoMaximo || lado === 0) return { ancho, alto };

  const escala = ladoMaximo / lado;
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/**
 * Decodifica el archivo respetando la orientación de la cámara.
 *
 * Las fotos de celular guardan aparte si el teléfono estaba de costado. Si se
 * dibuja en el lienzo sin tener eso en cuenta, la foto sale acostada — y el
 * dueño va a pensar, con razón, que el sistema le rotó la foto.
 */
async function decodificar(archivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch {
      // Algunos navegadores viejos no aceptan la opción: se sigue por el otro camino.
    }
  }

  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dimensiones(fuente: ImageBitmap | HTMLImageElement): {
  ancho: number;
  alto: number;
} {
  if ("naturalWidth" in fuente) {
    return { ancho: fuente.naturalWidth, alto: fuente.naturalHeight };
  }
  return { ancho: fuente.width, alto: fuente.height };
}

function aBlob(
  lienzo: HTMLCanvasElement,
  tipo: string,
  calidad: number
): Promise<Blob | null> {
  return new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad));
}

function cambiarExtension(nombre: string, extension: string): string {
  const sinExtension = nombre.replace(/\.[^.]+$/, "");
  const limpio = sinExtension.trim() || "foto";
  return `${limpio}.${extension}`;
}

/**
 * Devuelve la foto lista para subir.
 *
 * Si algo sale mal en cualquier paso, devuelve el archivo original en vez de
 * fallar: que una foto pese de más es un problema; que el encargado no pueda
 * cargar su producto es un problema mucho peor.
 */
export async function comprimirImagen(
  archivo: File,
  opciones: OpcionesCompresion = PARA_PRODUCTO
): Promise<ResultadoCompresion> {
  const sinTocar = (motivo: string): ResultadoCompresion => ({
    archivo,
    bytesAntes: archivo.size,
    bytesDespues: archivo.size,
    comprimida: false,
    motivo,
  });

  if (!archivo.type.startsWith("image/")) return sinTocar("no es una imagen");
  if (NO_COMPRIMIR.has(archivo.type)) return sinTocar("formato que conviene no tocar");
  if (archivo.size > TAMANO_MAXIMO_ACEPTADO) return sinTocar("demasiado grande");

  try {
    const fuente = await decodificar(archivo);
    const original = dimensiones(fuente);
    const destino = calcularMedidas(original.ancho, original.alto, opciones.ladoMaximo);

    const lienzo = document.createElement("canvas");
    lienzo.width = destino.ancho;
    lienzo.height = destino.alto;

    const contexto = lienzo.getContext("2d");
    if (!contexto) return sinTocar("el navegador no permitió dibujar");

    // Fondo blanco: si la imagen tiene transparencia y se guarda como JPEG,
    // lo transparente saldría negro.
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, destino.ancho, destino.alto);
    contexto.imageSmoothingQuality = "high";
    contexto.drawImage(fuente as CanvasImageSource, 0, 0, destino.ancho, destino.alto);

    if ("close" in fuente && typeof fuente.close === "function") fuente.close();

    // WebP pesa bastante menos que JPEG a la misma calidad visible. Si el
    // navegador no sabe generarlo, devuelve otro tipo y se usa JPEG.
    let blob = await aBlob(lienzo, "image/webp", opciones.calidad);
    let extension = "webp";

    if (!blob || blob.type !== "image/webp") {
      blob = await aBlob(lienzo, "image/jpeg", opciones.calidad);
      extension = "jpg";
    }

    if (!blob) return sinTocar("no se pudo generar la imagen");

    // Si el original ya era más liviano, se queda el original. Pasa con
    // imágenes chicas y ya optimizadas.
    if (blob.size >= archivo.size) return sinTocar("el original ya era más liviano");

    const comprimido = new File([blob], cambiarExtension(archivo.name, extension), {
      type: blob.type,
      lastModified: Date.now(),
    });

    return {
      archivo: comprimido,
      bytesAntes: archivo.size,
      bytesDespues: comprimido.size,
      comprimida: true,
    };
  } catch {
    return sinTocar("no se pudo procesar");
  }
}

/** "2,4 MB" / "312 KB" — para mostrarle al usuario cuánto se ahorró. */
export function pesoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
