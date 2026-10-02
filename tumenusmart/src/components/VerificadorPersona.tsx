"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clasesBoton } from "@/components/ui";
import {
  GESTOS,
  cargarDetectorRostro,
  gestoCumplido,
  medirRostro,
  nuevoSeguimiento,
  sortearGestos,
  type DetectorRostro,
  type Gesto,
  type Medidas,
  type SeguimientoGesto,
} from "@/lib/vision-facial";

/** Lo que devuelve el verificador cuando termina. */
export type ResultadoVerificacion = {
  /** La foto sacada (JPEG). */
  foto: Blob;
  /** Los gestos que se le pidieron (vacío si solo se sacó la foto). */
  gestos: Gesto[];
  /** true = hizo todos los gestos delante de la cámara. false = se sacó la foto sin la prueba. */
  verificada: boolean;
};

const SEGUNDOS_POR_GESTO = 6;
/** La cara tiene que estar bien puesta este tiempo seguido antes de pedir los gestos. */
const MS_CARA_QUIETA = 1000;
/** Tras un fallo, cuánto se espera antes de volver a pedir gestos. */
const MS_PAUSA_TRAS_FALLO = 1800;
/** Cuántos desafíos fallidos hacen falta para ofrecer "marcar igual" (la foto queda para revisar). */
const FALLOS_PARA_MARCAR_IGUAL = 3;
/** Por debajo de este brillo promedio (0 a 255) se avisa que hay poca luz. */
const LUZ_MINIMA = 70;
const PAUSA_ENTRE_CUADROS_MS = 66;
const PAUSA_PANTALLA_MS = 120;
const PAUSA_LUZ_MS = 700;
/** Lo que espera, ya cumplidos los gestos, para sacar la foto con la cara de frente. */
const MS_ANTES_DE_LA_FOTO = 700;

const ANCHO_FOTO = 480;

type Fase = "cargando" | "listo" | "sin_detector" | "error" | "ok";

type Desafio = {
  gestos: Gesto[];
  indice: number;
  inicioGesto: number;
  seguimiento: SeguimientoGesto;
};

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
 * La cámara del Registro de asistencia. Tiene dos usos:
 *
 * - `gestos` = 1 o 2 (la marcación): enciende la cámara y, cuando ve una cara bien puesta, le pide uno o dos
 *   gestos al azar (parpadear, abrir la boca, sonreír, girar la cabeza). Si los hace, saca la foto y avisa.
 *   Es la prueba de que quien marca es una persona de verdad y no una foto o un video. Todo corre en el propio
 *   celular (ver src/lib/vision-facial.ts): el video no sale a ningún servidor, solo la foto final.
 * - `gestos` = 0 (el alta de un colaborador): sin prueba, un botón saca la foto cuando el dueño quiere.
 *
 * Si el detector no se puede descargar (sin internet) o la persona no logra hacer los gestos tras varios
 * intentos, se ofrece marcar igual: la foto se saca igual y queda marcada como "sin verificar" para que el
 * dueño la revise. Así una falla de luz o de conexión no deja a nadie sin poder marcar.
 */
export function VerificadorPersona({
  gestos: cantidadGestos,
  onResultado,
  onCancelar,
}: {
  gestos: 0 | 1 | 2;
  onResultado: (resultado: ResultadoVerificacion) => void;
  onCancelar?: () => void;
}) {
  const usaDetector = cantidadGestos > 0;

  const [fase, setFase] = useState<Fase>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  const [luz, setLuz] = useState<number | null>(null);
  const [desafioUI, setDesafioUI] = useState<{ gestos: Gesto[]; indice: number } | null>(null);
  const [segundosRestantes, setSegundosRestantes] = useState(SEGUNDOS_POR_GESTO);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fallos, setFallos] = useState(0);
  // Solo para el modo foto: la foto sacada, esperando que se confirme o se repita.
  const [vista, setVista] = useState<{ foto: Blob; url: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<DetectorRostro | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cuadroRef = useRef<number | null>(null);
  const corriendoRef = useRef(false);
  const desafioRef = useRef<Desafio | null>(null);
  const lienzoRef = useRef<HTMLCanvasElement | null>(null);
  const ultimoVideoRef = useRef(-1);
  const ultimaDeteccionRef = useRef(0);
  const ultimaPantallaRef = useRef(0);
  const ultimaLuzRef = useRef(0);
  const luzRef = useRef<number | null>(null);
  const caraQuietaDesdeRef = useRef(0);
  const pausaHastaRef = useRef(0);
  const fallosRef = useRef(0);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alResultadoRef = useRef(onResultado);
  alResultadoRef.current = onResultado;

  const limpiar = useCallback(() => {
    corriendoRef.current = false;
    if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current);
    cuadroRef.current = null;
    if (temporizadorRef.current !== null) clearTimeout(temporizadorRef.current);
    temporizadorRef.current = null;
    streamRef.current?.getTracks().forEach((pista) => pista.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    desafioRef.current = null;
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
  async function entregar(gestos: Gesto[], verificada: boolean) {
    const foto = await sacarFoto();
    if (!foto) {
      setError("No se pudo sacar la foto. Probá de nuevo.");
      pausaHastaRef.current = 0;
      setFase(detectorRef.current ? "listo" : "sin_detector");
      return;
    }
    alResultadoRef.current({ foto, gestos, verificada });
  }

  function terminarDesafio(aprobado: boolean, ahora: number) {
    const d = desafioRef.current;
    if (!d) return;
    desafioRef.current = null;
    setDesafioUI(null);
    caraQuietaDesdeRef.current = 0;
    if (aprobado) {
      setMensaje(null);
      setFase("ok");
      // Mientras espera la foto no se arranca otro desafío.
      pausaHastaRef.current = Number.POSITIVE_INFINITY;
      // Un instante para que mire de frente: es la foto que queda de prueba.
      temporizadorRef.current = setTimeout(() => void entregar(d.gestos, true), MS_ANTES_DE_LA_FOTO);
    } else {
      fallosRef.current += 1;
      setFallos(fallosRef.current);
      setMensaje("No alcanzamos a ver el gesto. Probá de nuevo.");
      pausaHastaRef.current = ahora + MS_PAUSA_TRAS_FALLO;
    }
  }

  function empezarDesafio(ahora: number) {
    if (desafioRef.current) return;
    const gestos = sortearGestos(cantidadGestos);
    desafioRef.current = { gestos, indice: 0, inicioGesto: ahora, seguimiento: nuevoSeguimiento() };
    setMensaje(null);
    setDesafioUI({ gestos, indice: 0 });
    setSegundosRestantes(SEGUNDOS_POR_GESTO);
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

    const d = desafioRef.current;
    if (d) {
      const gesto = d.gestos[d.indice];
      if (m.hayRostro && gestoCumplido(gesto, m, d.seguimiento)) {
        if (d.indice + 1 >= d.gestos.length) {
          terminarDesafio(true, ahora);
        } else {
          d.indice += 1;
          d.inicioGesto = ahora;
          d.seguimiento = nuevoSeguimiento();
          setDesafioUI({ gestos: d.gestos, indice: d.indice });
          setSegundosRestantes(SEGUNDOS_POR_GESTO);
        }
      } else if (ahora - d.inicioGesto > SEGUNDOS_POR_GESTO * 1000) {
        terminarDesafio(false, ahora);
      } else {
        setSegundosRestantes(Math.max(0, Math.ceil(SEGUNDOS_POR_GESTO - (ahora - d.inicioGesto) / 1000)));
      }
    } else if (corriendoRef.current && ahora >= pausaHastaRef.current) {
      // Sin desafío en curso: apenas hay una cara bien puesta y quieta, arranca solo. Así no hay que tocar nada.
      const bienPuesta = m.hayRostro && m.anchoRostro >= 0.25 && m.anchoRostro <= 0.85;
      if (!bienPuesta) {
        caraQuietaDesdeRef.current = 0;
      } else if (caraQuietaDesdeRef.current === 0) {
        caraQuietaDesdeRef.current = ahora;
      } else if (ahora - caraQuietaDesdeRef.current >= MS_CARA_QUIETA) {
        empezarDesafio(ahora);
      }
    }

    if (ahora - ultimaPantallaRef.current > PAUSA_PANTALLA_MS) {
      ultimaPantallaRef.current = ahora;
      setMedidas(m);
    }
    if (ahora - ultimaLuzRef.current > PAUSA_LUZ_MS) {
      ultimaLuzRef.current = ahora;
      luzRef.current = medirLuz(video);
      setLuz(luzRef.current);
    }
  }

  // Enciende la cámara (y el detector, si hay que pedir gestos) al aparecer, y la apaga al irse.
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
          // La cámara anda pero el detector no se pudo descargar: se puede marcar igual, sin la prueba.
          if (activo) setFase("sin_detector");
          return;
        }
        corriendoRef.current = true;
        ultimoVideoRef.current = -1;
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
    if (!usaDetector || fase !== "listo" || !medidas || desafioUI) return null;
    if (!medidas.hayRostro) return "No veo ninguna cara";
    if (medidas.anchoRostro < 0.25) return "Acercate un poco";
    if (medidas.anchoRostro > 0.85) return "Alejate un poco";
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

        {usaDetector && fase === "listo" && !desafioUI && !mensaje && !pista && (
          <div className="absolute inset-x-0 bottom-0 bg-tinta/80 p-3 text-center text-[1rem] font-semibold text-white">
            Mirá a la cámara
          </div>
        )}
        {pista && (
          <div className="absolute inset-x-0 top-0 bg-aviso-tinte px-3 py-2 text-center text-[0.9rem] font-semibold text-aviso">
            {pista}
          </div>
        )}
        {mensaje && !desafioUI && fase === "listo" && (
          <div className="absolute inset-x-0 bottom-0 bg-peligro/90 p-3 text-center text-[0.95rem] font-semibold text-white">
            {mensaje}
          </div>
        )}

        {desafioUI && (
          // Todos los gestos a la vista desde el principio: el que ya hiciste queda en verde, el que toca ahora va
          // resaltado y los que faltan quedan apagados.
          <div className="absolute inset-x-0 bottom-0 bg-tinta/85 p-3 text-white">
            <div className="mb-2 flex items-center justify-between gap-2 text-[0.72rem] font-semibold uppercase tracking-wide text-white/70">
              <span>{desafioUI.gestos.length === 1 ? "Hacé este gesto" : "Hacé estos gestos, en orden"}</span>
              <span className="cifra">{segundosRestantes} s</span>
            </div>
            <ol className="flex flex-col gap-1.5">
              {desafioUI.gestos.map((g, n) => {
                const hecho = n < desafioUI.indice;
                const actual = n === desafioUI.indice;
                return (
                  <li
                    key={`${g}-${n}`}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[1.05rem] font-semibold ${
                      actual ? "bg-white text-tinta" : hecho ? "bg-exito/90 text-white" : "bg-white/10 text-white/60"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[0.8rem] ${
                        actual ? "bg-tinta text-white" : "bg-white/20"
                      }`}
                    >
                      {hecho ? "✓" : n + 1}
                    </span>
                    {GESTOS[g].instruccion}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {fase === "ok" && (
          <div className="absolute inset-x-0 bottom-0 bg-exito/95 p-3 text-center text-[1.05rem] font-semibold text-white">
            ✓ Verificado. Quedate mirando un segundo…
          </div>
        )}
      </div>

      {error && (
        <p className="w-full max-w-sm rounded-lg bg-peligro-luz px-3 py-2 text-center text-[0.85rem] text-peligro">{error}</p>
      )}
      {fase === "sin_detector" && !error && (
        <p className="w-full max-w-sm rounded-lg bg-aviso-luz px-3 py-2 text-center text-[0.85rem] text-aviso">
          No se pudo cargar la comprobación de persona real (¿hay internet?). Podés marcar igual: la foto queda para que
          el dueño la revise.
        </p>
      )}
      {puedeMarcarIgual && fase === "listo" && (
        <p className="w-full max-w-sm rounded-lg bg-aviso-luz px-3 py-2 text-center text-[0.85rem] text-aviso">
          ¿No logra hacer los gestos? Podés marcar igual: la foto queda para que el dueño la revise.
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
              onClick={() => alResultadoRef.current({ foto: vista.foto, gestos: [], verificada: false })}
              className={clasesBoton("exito", "md")}
            >
              Usar esta foto
            </button>
          </>
        )}
        {puedeMarcarIgual && (fase === "sin_detector" || fase === "listo") && (
          <button type="button" onClick={() => void entregar([], false)} className={clasesBoton("suave", "md")}>
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
