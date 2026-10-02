/**
 * Detección de gestos en la cara para el Registro de asistencia (prueba de "persona real").
 *
 * El detector es MediaPipe Face Landmarker (de Google), que corre ENTERO en el navegador del
 * celular: el video no sale a ningún servidor. Se descarga en el momento desde un CDN (la
 * librería y el modelo), así que no hay nada que instalar con npm; por eso los tipos de abajo
 * son los mínimos que usamos, escritos a mano.
 *
 * Todo lo de después de `cargarDetectorRostro` es puro (sin cámara ni red): recibe lo que
 * devolvió el detector y dice si hay cara, si parpadeó, si abrió la boca, etc.
 */

// ---------------------------------------------------------------------------
//  El detector (se descarga del CDN)
// ---------------------------------------------------------------------------

export type Categoria = { categoryName: string; score: number };
export type Punto = { x: number; y: number };
export type ResultadoRostro = {
  faceLandmarks: Punto[][];
  faceBlendshapes?: { categories: Categoria[] }[];
};
export type DetectorRostro = {
  detectForVideo(video: HTMLVideoElement, marcaDeTiempoMs: number): ResultadoRostro;
  close(): void;
};

type ModuloVision = {
  FilesetResolver: { forVisionTasks(carpetaWasm: string): Promise<unknown> };
  FaceLandmarker: { createFromOptions(vision: unknown, opciones: unknown): Promise<DetectorRostro> };
};

const VERSION = "0.10.14";
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELO =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Descarga y prepara el detector. Prueba con la placa de video y, si no puede, con el procesador. */
export async function cargarDetectorRostro(): Promise<DetectorRostro> {
  const urlModulo = `${BASE}/vision_bundle.mjs`;
  // El import va por una variable y con estas marcas para que el empaquetador NO intente resolverlo
  // (es una dirección de internet, se carga recién en el navegador).
  const modulo = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ urlModulo)) as ModuloVision;
  const vision = await modulo.FilesetResolver.forVisionTasks(`${BASE}/wasm`);

  const opciones = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: MODELO, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  try {
    return await modulo.FaceLandmarker.createFromOptions(vision, opciones("GPU"));
  } catch {
    return await modulo.FaceLandmarker.createFromOptions(vision, opciones("CPU"));
  }
}

// ---------------------------------------------------------------------------
//  Qué se midió en cada cuadro
// ---------------------------------------------------------------------------

export type Medidas = {
  hayRostro: boolean;
  /** 0 = ojos abiertos, 1 = cerrados (promedio de los dos ojos). */
  parpadeo: number;
  /** 0 = boca cerrada, 1 = muy abierta. */
  boca: number;
  /** 0 = sin sonrisa, 1 = sonrisa grande. */
  sonrisa: number;
  /** De -1 a 1: positivo = giró la cabeza a SU derecha, negativo = a su izquierda. 0 = de frente. */
  giro: number;
  /** Cuánto del ancho del cuadro ocupa la cara (0 a 1). */
  anchoRostro: number;
};

export const SIN_ROSTRO: Medidas = { hayRostro: false, parpadeo: 0, boca: 0, sonrisa: 0, giro: 0, anchoRostro: 0 };

// Puntos de la malla de la cara: la punta de la nariz y los dos bordes (cerca de las orejas).
const NARIZ = 1;
const BORDE_A = 234;
const BORDE_B = 454;

export function medirRostro(r: ResultadoRostro): Medidas {
  const puntos = r.faceLandmarks[0];
  if (!puntos || puntos.length <= BORDE_B) return SIN_ROSTRO;

  const categorias = r.faceBlendshapes?.[0]?.categories ?? [];
  const dato = (nombre: string) => categorias.find((c) => c.categoryName === nombre)?.score ?? 0;

  // El giro se saca de dónde queda la nariz entre los dos bordes de la cara. La imagen que
  // llega NO está espejada: si la nariz se acerca al borde izquierdo de la imagen, la persona
  // giró hacia SU derecha.
  const xIzquierda = Math.min(puntos[BORDE_A].x, puntos[BORDE_B].x);
  const xDerecha = Math.max(puntos[BORDE_A].x, puntos[BORDE_B].x);
  const distIzq = puntos[NARIZ].x - xIzquierda;
  const distDer = xDerecha - puntos[NARIZ].x;
  const total = distIzq + distDer;
  const giro = total > 0 ? (distDer - distIzq) / total : 0;

  let minX = 1;
  let maxX = 0;
  for (const p of puntos) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }

  return {
    hayRostro: true,
    parpadeo: (dato("eyeBlinkLeft") + dato("eyeBlinkRight")) / 2,
    boca: dato("jawOpen"),
    sonrisa: (dato("mouthSmileLeft") + dato("mouthSmileRight")) / 2,
    giro,
    anchoRostro: maxX - minX,
  };
}

// ---------------------------------------------------------------------------
//  Los gestos que se piden
// ---------------------------------------------------------------------------

export type Gesto = "parpadear" | "boca" | "sonreir" | "izquierda" | "derecha";

export const GESTOS: Record<Gesto, { instruccion: string; corto: string }> = {
  parpadear: { instruccion: "Parpadeá", corto: "parpadeo" },
  boca: { instruccion: "Abrí la boca", corto: "boca abierta" },
  sonreir: { instruccion: "Sonreí", corto: "sonrisa" },
  izquierda: { instruccion: "Girá la cabeza a tu izquierda", corto: "giro a la izquierda" },
  derecha: { instruccion: "Girá la cabeza a tu derecha", corto: "giro a la derecha" },
};

/** Desde qué valor se da por hecho cada gesto. Se afinan con las pruebas en el celular real. */
export const UMBRALES = {
  /** Ojos cerrados si pasan de esto; abiertos si bajan de `ojoAbierto`. */
  ojoCerrado: 0.5,
  ojoAbierto: 0.25,
  boca: 0.4,
  sonrisa: 0.45,
  giro: 0.3,
} as const;

/** Elige `cantidad` gestos distintos al azar: lo que pide cada vez no se puede adivinar. */
export function sortearGestos(cantidad: number): Gesto[] {
  const todos = Object.keys(GESTOS) as Gesto[];
  for (let i = todos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [todos[i], todos[j]] = [todos[j], todos[i]];
  }
  return todos.slice(0, cantidad);
}

/** Lo que se va acordando de un gesto mientras se espera que lo haga. */
export type SeguimientoGesto = {
  vioAbierto: boolean;
  vioCerrado: boolean;
  /** El valor más alto que alcanzó (para mostrar en la prueba y afinar los umbrales). */
  mejor: number;
};

export function nuevoSeguimiento(): SeguimientoGesto {
  return { vioAbierto: false, vioCerrado: false, mejor: 0 };
}

/** ¿Hizo el gesto? Se llama con cada cuadro que tenga cara; el parpadeo necesita abrir, cerrar y volver a abrir. */
export function gestoCumplido(gesto: Gesto, m: Medidas, s: SeguimientoGesto): boolean {
  switch (gesto) {
    case "parpadear": {
      s.mejor = Math.max(s.mejor, m.parpadeo);
      if (m.parpadeo < UMBRALES.ojoAbierto) {
        if (s.vioCerrado) return true;
        s.vioAbierto = true;
      } else if (m.parpadeo > UMBRALES.ojoCerrado && s.vioAbierto) {
        s.vioCerrado = true;
      }
      return false;
    }
    case "boca":
      s.mejor = Math.max(s.mejor, m.boca);
      return m.boca > UMBRALES.boca;
    case "sonreir":
      s.mejor = Math.max(s.mejor, m.sonrisa);
      return m.sonrisa > UMBRALES.sonrisa;
    case "derecha":
      s.mejor = Math.max(s.mejor, m.giro);
      return m.giro > UMBRALES.giro;
    case "izquierda":
      s.mejor = Math.max(s.mejor, -m.giro);
      return m.giro < -UMBRALES.giro;
  }
}
