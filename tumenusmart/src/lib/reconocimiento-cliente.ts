/**
 * Saca el "rostro" (128 números, ver src/lib/reconocimiento-facial.ts) de una foto, en el propio navegador.
 *
 * Usa face-api (de vladmandic: la versión mantenida de face-api.js, que corre con TensorFlow.js) y sus modelos, que se descargan
 * del CDN de jsDelivr en el momento: no hay nada que instalar con npm. Todo corre en el navegador de quien marca: la foto no sale
 * a ningún servidor para esto, y al servidor solo viajan los 128 números. Igual que el detector de caras (vision-facial.ts), el
 * CDN ya está permitido en la política de seguridad de next.config.mjs (script-src y connect-src).
 *
 * El script lleva su huella (SRI) y la versión fija: si el CDN lo cambiara, el navegador lo rechaza en vez de ejecutarlo. Si se
 * sube de versión hay que recalcular `HUELLA_SCRIPT`.
 */

const VERSION = "1.7.15";
const BASE = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${VERSION}`;
const URL_SCRIPT = `${BASE}/dist/face-api.js`;
const URL_MODELOS = `${BASE}/model`;
/** sha384 del archivo `dist/face-api.js` de la versión de arriba. */
const HUELLA_SCRIPT = "sha384-M5nePoB6/w/a9JhtegEibSLGiJy/+QMZZMfvcxjWVCQW/HPwrQ7i21V/Px/8AyVA";

/** Lo mínimo de la librería que usamos (la carga el CDN, así que los tipos van a mano). */
type Entrada = HTMLCanvasElement;
type FaceApi = {
  nets: {
    tinyFaceDetector: { loadFromUri(url: string): Promise<void> };
    faceLandmark68Net: { loadFromUri(url: string): Promise<void> };
    faceRecognitionNet: { loadFromUri(url: string): Promise<void> };
  };
  TinyFaceDetectorOptions: new (opciones?: { inputSize?: number; scoreThreshold?: number }) => unknown;
  detectSingleFace(entrada: Entrada, opciones: unknown): {
    withFaceLandmarks(): { withFaceDescriptor(): Promise<{ descriptor: Float32Array } | undefined> };
  };
};

declare global {
  interface Window {
    faceapi?: FaceApi;
  }
}

export type Reconocedor = {
  /** El rostro de la cara que se ve en la imagen, o null si no se encontró ninguna cara. */
  rostroDe(entrada: Entrada): Promise<number[] | null>;
};

let carga: Promise<Reconocedor> | null = null;

function cargarScript(): Promise<FaceApi> {
  return new Promise((resolver, rechazar) => {
    if (window.faceapi) {
      resolver(window.faceapi);
      return;
    }
    const s = document.createElement("script");
    s.src = URL_SCRIPT;
    s.integrity = HUELLA_SCRIPT;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () => (window.faceapi ? resolver(window.faceapi) : rechazar(new Error("No se pudo preparar el reconocimiento de caras.")));
    s.onerror = () => {
      s.remove();
      rechazar(new Error("No se pudo descargar el reconocimiento de caras. ¿Hay internet?"));
    };
    document.head.appendChild(s);
  });
}

/** Una imagen en blanco: sirve para "calentar" el detector y que la primera foto de verdad no tarde tanto. */
function lienzoEnBlanco(lado: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = lado;
  c.height = lado;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, lado, lado);
  }
  return c;
}

async function preparar(): Promise<Reconocedor> {
  const faceapi = await cargarScript();
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(URL_MODELOS),
    faceapi.nets.faceLandmark68Net.loadFromUri(URL_MODELOS),
    faceapi.nets.faceRecognitionNet.loadFromUri(URL_MODELOS),
  ]);
  const opciones = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

  const reconocedor: Reconocedor = {
    async rostroDe(entrada) {
      const resultado = await faceapi.detectSingleFace(entrada, opciones).withFaceLandmarks().withFaceDescriptor();
      return resultado ? Array.from(resultado.descriptor) : null;
    },
  };

  // Calentamiento (la primera pasada compila los programas de la placa de video y puede tardar): un fallo acá no importa.
  try {
    await reconocedor.rostroDe(lienzoEnBlanco(160));
  } catch {
    // Sin cara en la imagen en blanco es lo esperado; cualquier otra cosa se vuelve a ver al usarlo de verdad.
  }
  return reconocedor;
}

/**
 * Descarga y prepara el reconocimiento (la primera vez son unos 8 MB que el navegador guarda: las siguientes es casi
 * instantáneo). Se puede llamar de antemano para que cuando haga falta ya esté listo. Si falla, la próxima llamada reintenta.
 */
export function cargarReconocedor(): Promise<Reconocedor> {
  if (!carga) {
    carga = preparar().catch((e) => {
      carga = null;
      throw e;
    });
  }
  return carga;
}

/** El lado más largo al que se achica una foto antes de buscarle la cara: una foto de celular de 12 megapíxeles tardaría de más. */
const LADO_MAXIMO_FOTO = 800;

/** Dibuja la imagen en un lienzo (achicada si es muy grande): así no depende de que la dirección temporal siga viva. */
function aLienzo(img: HTMLImageElement): HTMLCanvasElement {
  const ancho = img.naturalWidth;
  const alto = img.naturalHeight;
  if (!ancho || !alto) throw new Error("La imagen no se pudo leer.");
  const escala = Math.min(1, LADO_MAXIMO_FOTO / Math.max(ancho, alto));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(1, Math.round(ancho * escala));
  lienzo.height = Math.max(1, Math.round(alto * escala));
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return lienzo;
}

/** Abre una foto (un archivo o la selfie recién sacada) como lienzo, lista para sacarle el rostro. */
async function lienzoDeBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return aLienzo(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Abre una foto ya guardada (la selfie del alta). Falla si el almacenamiento no deja leerla desde este sitio. */
async function lienzoDeUrl(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  // Sin esto el navegador "mancha" el lienzo de una imagen de otro sitio y no deja leerla.
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  return aLienzo(img);
}

/** El rostro de la cara de una foto, o null si no se ve ninguna. Lanza si el reconocimiento no se pudo preparar. */
export async function rostroDeFoto(foto: Blob): Promise<number[] | null> {
  const [reconocedor, lienzo] = await Promise.all([cargarReconocedor(), lienzoDeBlob(foto)]);
  return reconocedor.rostroDe(lienzo);
}

/** Lo mismo, pero de una foto que ya está guardada en internet (la selfie del alta de un colaborador). */
export async function rostroDeFotoGuardada(url: string): Promise<number[] | null> {
  const [reconocedor, lienzo] = await Promise.all([cargarReconocedor(), lienzoDeUrl(url)]);
  return reconocedor.rostroDe(lienzo);
}
