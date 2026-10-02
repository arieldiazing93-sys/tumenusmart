"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clasesBoton } from "@/components/ui";
import { cargarDetectorRostro, medirRostro, type DetectorRostro, type Medidas } from "@/lib/vision-facial";

/** Lo que devuelve la cámara cuando termina. */
export type ResultadoVerificacion = {
  /** La foto sacada (JPEG). */
  foto: Blob;
  /** true = la cámara vio una cara de frente al sacar la foto. false = se sacó igual, sin que la viera (queda para revisar). */
  verificada: boolean;
};

/** La cara tiene que estar bien puesta este tiempo seguido antes de sacar la foto. */
const MS_CARA_QUIETA = 1000;
/** Si en este tiempo no logra poner la cara bien, se avisa y se vuelve a intentar. */
const MS_POR_INTENTO = 8000;
/** Cuántos intentos fallidos hacen falta para ofrecer "marcar igual" (la foto queda para revisar). */
const FALLOS_PARA_MARCAR_IGUAL = 2;
/** Por debajo de este brillo promedio (0 a 255) se avisa que hay poca luz. */
const LUZ_MINIMA = 70;
/** Cuánto puede estar girada la cabeza (de 0 a 1) para contar como "mirando de frente". */
const GIRO_MAXIMO = 0.35;
const PAUSA_ENTRE_CUADROS_MS = 66;
const PAUSA_PANTALLA_MS = 120;
const PAUSA_LUZ_MS = 700;

const ANCHO_FOTO = 480;

/**
 * "selfie": sin detector, un botón saca la foto cuando el dueño quiere (el alta de un colaborador).
 * "marcacion": con detector, saca la foto sola apenas ve una cara de frente (el celular fijo).
 */
export type ModoCamara = "selfie" | "marcacion";

type Fase = "cargando" | "listo" | "sin_detector" | "error" | "ok";

function mensajeDeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError") {
      return "No se dio permiso para usar la cámara. Habilitala desde el candado de la barra de direcciones y recargá la página.";
    }
    if (e.name === "NotFoundError") return "No se encontró ninguna cámara en este dispositivo.";
    if (e.name === "NotReadableError") return "La cámara la está usando otra aplicación. Cerrala y recargá la página.";
  }
  return e instanceof Error && e.message ? e.message : "No se pudo iniciar la cámara.";
}

/**
 * La cámara del Registro de asistencia. Tiene dos usos (ver `ModoCamara`):
 *
 * - `marcacion` (el celular fijo): enciende la cámara y, cuando ve una cara de frente, bien puesta y quieta un
 *   segundo, saca la foto sola y avisa. No hay que tocar nada ni hacer ningún gesto: se pone la cara y listo. Si en
 *   unos segundos no logra verla, lo dice ("acercate", "mirá de frente"…) y vuelve a intentar. Todo corre en el
 *   propio celular (ver src/lib/vision-facial.ts): el video no sale a ningún servidor, solo la foto final.
 * - `selfie` (el alta de un colaborador): sin detector, un botón saca la foto cuando el dueño quiere.
 *
 * Si el detector no se puede descargar (sin internet) o tras varios intentos no logra ver la cara, se ofrece marcar
 * igual: la foto se saca igual y queda marcada como "sin verificar" para que el dueño la revise. Así una falla de luz
 * o de conexión no deja a nadie sin poder marcar.
 */
export function VerificadorPersona({
  modo,
  onResultado,
  onCancelar,
}: {
  modo: ModoCamara;
  onResultado: (resultado: ResultadoVerificacion) => void;
  onCancelar?: () => void;
}) {
  const usaDetector = modo === "marcacion";

  const [fase, setFase] = useState<Fase>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  const [luz, setLuz] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fallos, setFallos] = useState(0);
  // Solo para el modo selfie: la foto sacada, esperando que se confirme o se repita.
  const [vista, setVista] = useState<{ foto: Blob; url: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<DetectorRostro | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cuadroRef = useRef<number | null>(null);
  const corriendoRef = useRef(false);
  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const ultimoVideoRef = useRef(-1);
  const ultimaDeteccionRef = useRef(0);
  const ultimaPantallaRef = useRef(0);
  const ultimaLuzRef = useRef(0);
  const caraQuietaDesdeRef = useRef(0);
  const intentoDesdeRef = useRef(0);
  const fallosRef = useRef(0);
  const alResultadoRef = useRef(onResultado);
  alResultadoRef.current = onResultado;

  const limpiar = useCallback(() => {
    corriendoRef.current = false;
    if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current);
    cuadroRef.current = null;
    streamRef.current?.getTracks().forEach((pista) => pista.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  function lienzo(): HTMLCanvasElement {
    if (!lienzoRef.current) lienzoRef.current = document.createElement("canvas");
    return lienzoRef.current;
  }

  /** Brillo promedio del cuadro, de 0 (negro) a 255 (blanco). */
  function medirLuz(video: HTMLVideoElement): number | null {
    const c = lienzo();
    c.width = 32;
    c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 32, 24);
    const px = ctx.getImageData(0, 0, 32, 24).data;
    let suma = 0;
    for (let i = 0; i < px.length; i += 4) suma += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    return suma / (px.length / 4);
  }

  /** Saca la foto del cuadro actual, sin espejar (como la vería otra persona). */
  function sacarFoto(): Promise<Blob | null> {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return Promise.resolve(null);
    const c = lienzo();
    c.width = ANCHO_FOTO;
    c.height = Math.round(ANCHO_FOTO * (video.videoHeight / video.videoWidth));
    const ctx = c.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(video, 0, 0, c.width, c.height);
    return new Promise((resolver) => c.toBlob((b) => resolver(b), "image/jpeg", 0.8));
  }

  /** Termina: saca la foto y se la entrega a quien llamó. */
  async function entregar(verificada: boolean) {
    // Mientras se saca la foto el detector se frena: no puede entregar dos veces.
    corriendoRef.current = false;
    const foto = await sacarFoto();
    if (!foto) {
      setError("No se pudo sacar la foto. Probá de nuevo.");
      caraQuietaDesdeRef.current = 0;
      intentoDesdeRef.current = performance.now();
      if (detectorRef.current) {
        // Se retoma el detector con un solo ciclo de cuadros.
        corriendoRef.current = true;
        if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current);
        cuadroRef.current = requestAnimationFrame(bucle);
        setFase("listo");
      } else {
        setFase("sin_detector");
      }
      return;
    }
    alResultadoRef.current({ foto, verificada });
  }

  function bucle() {
    const video = videoRef.current;
    const detector = detectorRef.current;
    if (!corriendoRef.current || !video || !detector) return;
    cuadroRef.current = requestAnimationFrame(bucle);

    const ahora = performance.now();
    if (video.readyState < 2 || video.currentTime === ultimoVideoRef.current) return;
    if (ahora - ultimaDeteccionRef.current < PAUSA_ENTRE_CUADROS_MS) return;
    ultimoVideoRef.current = video.currentTime;
    ultimaDeteccionRef.current = ahora;

    let m: Medidas;
    try {
      m = medirRostro(detector.detectForVideo(video, ahora));
    } catch {
      return;
    }

    // Una cara de frente, ni muy lejos ni muy cerca. Con eso la foto queda útil para revisarla después.
    const bienPuesta =
      m.hayRostro && m.anchoRostro >= 0.25 && m.anchoRostro <= 0.85 && Math.abs(m.giro) <= GIRO_MAXIMO;

    if (!bienPuesta) {
      caraQuietaDesdeRef.current = 0;
      // Tras unos segundos sin lograrlo se avisa y se sigue intentando.
      if (ahora - intentoDesdeRef.current > MS_POR_INTENTO) {
        fallosRef.current += 1;
        setFallos(fallosRef.current);
        setMensaje("No pudimos ver tu cara. Acercate, mirá de frente y buscá más luz.");
        intentoDesdeRef.current = ahora;
      }
    } else if (caraQuietaDesdeRef.current === 0) {
      caraQuietaDesdeRef.current = ahora;
    } else if (ahora - caraQuietaDesdeRef.current >= MS_CARA_QUIETA) {
      // Cara bien puesta y quieta: foto y listo.
      setMensaje(null);
      setFase("ok");
      void entregar(true);
      return;
    }

    if (ahora - ultimaPantallaRef.current > PAUSA_PANTALLA_MS) {
      ultimaPantallaRef.current = ahora;
      setMedidas(m);
      if (bienPuesta) setMensaje(null);
    }
    if (ahora - ultimaLuzRef.current > PAUSA_LUZ_MS) {
      ultimaLuzRef.current = ahora;
      setLuz(medirLuz(video));
    }
  }

  // Enciende la cámara (y el detector, en el celular fijo) al aparecer, y la apaga al irse.
  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Este navegador no permite usar la cámara. Abrí la página con https:// desde Chrome o Safari.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!activo) {
          stream.getTracks().forEach((pista) => pista.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("No se pudo mostrar la cámara.");
        video.srcObject = stream;
        await video.play();
        if (!usaDetector) {
          setFase("listo");
          return;
        }
        try {
          const detector = await cargarDetectorRostro();
          if (!activo) {
            detector.close();
            return;
          }
          detectorRef.current = detector;
        } catch {
          // La cámara anda pero el detector no se pudo descargar: se puede marcar igual, sin verificar.
          if (activo) setFase("sin_detector");
          return;
        }
        corriendoRef.current = true;
        ultimoVideoRef.current = -1;
        intentoDesdeRef.current = performance.now();
        setFase("listo");
        cuadroRef.current = requestAnimationFrame(bucle);
      } catch (e) {
        if (!activo) return;
        limpiar();
        setError(mensajeDeError(e));
        setFase("error");
      }
    })();
    return () => {
      activo = false;
      limpiar();
    };
    // `bucle` solo usa referencias y funciones de estado, que no cambian: no hace falta reiniciar la cámara por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usaDetector, limpiar]);

  // La URL de la vista previa se libera al cambiar o al irse.
  useEffect(() => {
    return () => {
      if (vista) URL.revokeObjectURL(vista.url);
    };
  }, [vista]);

  async function sacarFotoManual() {
    const foto = await sacarFoto();
    if (!foto) {
      setError("No se pudo sacar la foto. Probá de nuevo.");
      return;
    }
    setError(null);
    setVista({ foto, url: URL.createObjectURL(foto) });
  }

  const pista = (() => {
    if (!usaDetector || fase !== "listo" || !medidas) return null;
    if (!medidas.hayRostro) return "No veo ninguna cara";
    if (medidas.anchoRostro < 0.25) return "Acercate un poco";
    if (medidas.anchoRostro > 0.85) return "Alejate un poco";
    if (Math.abs(medidas.giro) > GIRO_MAXIMO) return "Mirá de frente a la cámara";
    if (luz !== null && luz < LUZ_MINIMA) return "Hay poca luz";
    return null;
  })();

  const puedeMarcarIgual = usaDetector && (fase === "sin_detector" || (fase === "listo" && fallos >= FALLOS_PARA_MARCAR_IGUAL));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-tinta">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover [transform:scaleX(-1)]" />
        {vista && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vista.url} alt="Foto sacada" className="absolute inset-0 h-full w-full object-cover" />
        )}

        {fase === "cargando" && (
          <div className="absolute inset-x-0 bottom-0 bg-tinta/80 p-3 text-center text-[0.9rem] text-white">
            Preparando la cámara… la primera vez tarda unos segundos.
          </div>
        )}

        {usaDetector && fase === "listo" && !pista && !mensaje && (
          <div className="absolute inset-x-0 bottom-0 bg-tinta/80 p-3 text-center text-[1.05rem] font-semibold text-white">
            Mirá a la cámara
          </div>
        )}
        {pista && (
          <div className="absolute inset-x-0 top-0 bg-aviso-tinte px-3 py-2 text-center text-[0.9rem] font-semibold text-aviso">
            {pista}
          </div>
        )}
        {mensaje && fase === "listo" && (
          <div className="absolute inset-x-0 bottom-0 bg-peligro/90 p-3 text-center text-[0.95rem] font-semibold text-white">
            {mensaje}
          </div>
        )}

        {fase === "ok" && (
          <div className="absolute inset-x-0 bottom-0 bg-exito/95 p-3 text-center text-[1.05rem] font-semibold text-white">
            ✓ Te vi
          </div>
        )}
      </div>

      {error && (
        <p className="w-full max-w-sm rounded-lg bg-peligro-luz px-3 py-2 text-center text-[0.85rem] text-peligro">{error}</p>
      )}
      {fase === "sin_detector" && !error && (
        <p className="w-full max-w-sm rounded-lg bg-aviso-luz px-3 py-2 text-center text-[0.85rem] text-aviso">
          No se pudo cargar el detector de caras (¿hay internet?). Podés marcar igual: la foto queda para que el dueño la
          revise.
        </p>
      )}
      {puedeMarcarIgual && fase === "listo" && (
        <p className="w-full max-w-sm rounded-lg bg-aviso-luz px-3 py-2 text-center text-[0.85rem] text-aviso">
          ¿No te reconoce la cámara? Podés marcar igual: la foto queda para que el dueño la revise.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {!usaDetector && fase === "listo" && !vista && (
          <button type="button" onClick={() => void sacarFotoManual()} className={clasesBoton("principal", "md")}>
            Sacar la foto
          </button>
        )}
        {!usaDetector && vista && (
          <>
            <button type="button" onClick={() => setVista(null)} className={clasesBoton("suave", "md")}>
              Repetir
            </button>
            <button
              type="button"
              onClick={() => alResultadoRef.current({ foto: vista.foto, verificada: false })}
              className={clasesBoton("exito", "md")}
            >
              Usar esta foto
            </button>
          </>
        )}
        {puedeMarcarIgual && (fase === "sin_detector" || fase === "listo") && (
          <button type="button" onClick={() => void entregar(false)} className={clasesBoton("suave", "md")}>
            Marcar igual
          </button>
        )}
        {onCancelar && fase !== "ok" && (
          <button type="button" onClick={onCancelar} className={clasesBoton("peligro", "md")}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
