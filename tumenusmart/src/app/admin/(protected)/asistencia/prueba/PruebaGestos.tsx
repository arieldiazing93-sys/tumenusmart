"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Aviso, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import {
  GESTOS,
  UMBRALES,
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

const SEGUNDOS_POR_GESTO = 6;
/** Por debajo de este brillo promedio (0 a 255) la imagen es muy oscura para confiar en la detección. */
const LUZ_MINIMA = 70;
const PAUSA_ENTRE_CUADROS_MS = 66;
const PAUSA_PANTALLA_MS = 120;
const PAUSA_LUZ_MS = 700;

type Fase = "inicio" | "cargando" | "listo" | "error";

type Intento = {
  id: number;
  hora: string;
  gestos: Gesto[];
  aprobado: boolean;
  segundos: number;
  detalle: string;
  foto: string | null;
};

type Desafio = {
  gestos: Gesto[];
  indice: number;
  inicio: number;
  inicioGesto: number;
  seguimiento: SeguimientoGesto;
  detalle: string[];
};

function mensajeDeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError") {
      return "No diste permiso para usar la cámara. Habilitalo desde el candado de la barra de direcciones y probá de nuevo.";
    }
    if (e.name === "NotFoundError") return "No se encontró ninguna cámara en este dispositivo.";
    if (e.name === "NotReadableError") return "La cámara la está usando otra aplicación. Cerrala y probá de nuevo.";
  }
  if (e instanceof Error && /dynamically imported module|Failed to fetch|NetworkError|Load failed/i.test(e.message)) {
    return "No se pudo descargar el detector de caras. Revisá la conexión a internet y probá de nuevo.";
  }
  return e instanceof Error && e.message ? e.message : "No se pudo iniciar la cámara.";
}

function Barra({ rotulo, valor, umbral, texto }: { rotulo: string; valor: number; umbral: number; texto?: string }) {
  const porcentaje = Math.min(1, Math.max(0, valor)) * 100;
  const supera = valor > umbral;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[0.78rem]">
        <span className="font-medium text-tinta">{rotulo}</span>
        <span className="cifra text-tinta-media">{texto ?? valor.toFixed(2)}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-papel-hundido">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${supera ? "bg-exito" : "bg-azul"}`}
          style={{ width: `${porcentaje}%` }}
        />
        <span className="absolute inset-y-0 w-0.5 bg-tinta" style={{ left: `${umbral * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * La prueba de "persona real" del Registro de asistencia: enciende la cámara, muestra en vivo lo
 * que mide (parpadeo, boca, sonrisa y giro de cabeza) y permite lanzar un desafío con dos gestos al
 * azar. Cada intento queda en una lista con su foto y lo que alcanzó, para ver cómo se comporta en
 * el celular y con la luz reales. No se guarda nada y el video no sale del dispositivo.
 */
export function PruebaGestos() {
  const [fase, setFase] = useState<Fase>("inicio");
  const [error, setError] = useState<string | null>(null);
  const [medidas, setMedidas] = useState<Medidas | null>(null);
  const [luz, setLuz] = useState<number | null>(null);
  const [desafioUI, setDesafioUI] = useState<{ gestos: Gesto[]; indice: number } | null>(null);
  const [segundosRestantes, setSegundosRestantes] = useState(SEGUNDOS_POR_GESTO);
  const [intentos, setIntentos] = useState<Intento[]>([]);
  // Cuántos gestos pide cada desafío: con el celular en un lugar a la vista, con uno puede alcanzar.
  const [cantidadGestos, setCantidadGestos] = useState(2);

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
  const contadorRef = useRef(0);

  const limpiar = useCallback(() => {
    corriendoRef.current = false;
    if (cuadroRef.current !== null) cancelAnimationFrame(cuadroRef.current);
    cuadroRef.current = null;
    streamRef.current?.getTracks().forEach((pista) => pista.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    desafioRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Al salir de la pantalla se apaga la cámara.
  useEffect(() => limpiar, [limpiar]);

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

  function tomarFoto(video: HTMLVideoElement): string | null {
    const c = lienzo();
    const ancho = 240;
    const alto = Math.round(ancho * ((video.videoHeight || 3) / (video.videoWidth || 4)));
    c.width = ancho;
    c.height = alto;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, ancho, alto);
    return c.toDataURL("image/jpeg", 0.7);
  }

  function terminar(aprobado: boolean, ahora: number) {
    const d = desafioRef.current;
    if (!d) return;
    desafioRef.current = null;
    contadorRef.current += 1;
    const video = videoRef.current;
    const intento: Intento = {
      id: contadorRef.current,
      hora: new Date().toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      gestos: d.gestos,
      aprobado,
      segundos: (ahora - d.inicio) / 1000,
      detalle: d.detalle.join(" · "),
      foto: video ? tomarFoto(video) : null,
    };
    setIntentos((previos) => [intento, ...previos].slice(0, 20));
    setDesafioUI(null);
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
        d.detalle.push(`${GESTOS[gesto].corto} ✓ (${d.seguimiento.mejor.toFixed(2)})`);
        if (d.indice + 1 >= d.gestos.length) {
          terminar(true, ahora);
        } else {
          d.indice += 1;
          d.inicioGesto = ahora;
          d.seguimiento = nuevoSeguimiento();
          setDesafioUI({ gestos: d.gestos, indice: d.indice });
          setSegundosRestantes(SEGUNDOS_POR_GESTO);
        }
      } else if (ahora - d.inicioGesto > SEGUNDOS_POR_GESTO * 1000) {
        d.detalle.push(`${GESTOS[gesto].corto} ✗ (máx ${d.seguimiento.mejor.toFixed(2)})`);
        terminar(false, ahora);
      } else {
        setSegundosRestantes(Math.max(0, Math.ceil(SEGUNDOS_POR_GESTO - (ahora - d.inicioGesto) / 1000)));
      }
    }

    if (ahora - ultimaPantallaRef.current > PAUSA_PANTALLA_MS) {
      ultimaPantallaRef.current = ahora;
      setMedidas(m);
    }
    if (ahora - ultimaLuzRef.current > PAUSA_LUZ_MS) {
      ultimaLuzRef.current = ahora;
      setLuz(medirLuz(video));
    }
  }

  async function iniciar() {
    setError(null);
    setFase("cargando");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador no permite usar la cámara. Abrí la página con https:// desde Chrome o Safari.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("No se pudo mostrar la cámara.");
      video.srcObject = stream;
      await video.play();
      detectorRef.current = await cargarDetectorRostro();
      corriendoRef.current = true;
      ultimoVideoRef.current = -1;
      setFase("listo");
      cuadroRef.current = requestAnimationFrame(bucle);
    } catch (e) {
      limpiar();
      setError(mensajeDeError(e));
      setFase("error");
    }
  }

  function detener() {
    limpiar();
    setFase("inicio");
    setMedidas(null);
    setLuz(null);
    setDesafioUI(null);
  }

  function empezarDesafio() {
    if (fase !== "listo" || desafioRef.current) return;
    const gestos = sortearGestos(cantidadGestos);
    const ahora = performance.now();
    desafioRef.current = {
      gestos,
      indice: 0,
      inicio: ahora,
      inicioGesto: ahora,
      seguimiento: nuevoSeguimiento(),
      detalle: [],
    };
    setDesafioUI({ gestos, indice: 0 });
    setSegundosRestantes(SEGUNDOS_POR_GESTO);
  }

  const pista = (() => {
    if (fase !== "listo" || !medidas) return null;
    if (!medidas.hayRostro) return "No veo ninguna cara";
    if (medidas.anchoRostro < 0.25) return "Acercate un poco";
    if (medidas.anchoRostro > 0.85) return "Alejate un poco";
    if (luz !== null && luz < LUZ_MINIMA) return "Hay poca luz";
    return null;
  })();

  const m = medidas ?? { hayRostro: false, parpadeo: 0, boca: 0, sonrisa: 0, giro: 0, anchoRostro: 0 };
  const aprobados = intentos.filter((i) => i.aprobado).length;

  return (
    <div className="flex flex-col gap-4">
      <Aviso titulo="Qué conviene probar" color="azul">
        Probá con la luz del local, de día y de noche, con y sin lentes o gorra, y con el celular a la altura de la cara.
        Después probá a engañarlo: mostrale una foto o un video de otra persona desde otro celular. Un desafío de
        dos gestos al azar no debería aprobar. La cámara y el análisis corren en este mismo dispositivo: no se guarda ni se
        envía ninguna imagen.
      </Aviso>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta className="flex flex-col gap-3 !border-2 !border-azul/50">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl bg-tinta">
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover [transform:scaleX(-1)]"
            />
            {fase === "inicio" && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[0.9rem] text-white/80">
                La cámara está apagada.
              </div>
            )}
            {fase === "cargando" && (
              <div className="absolute inset-x-0 bottom-0 bg-tinta/80 p-3 text-center text-[0.85rem] text-white">
                Preparando el detector de caras… la primera vez tarda unos segundos.
              </div>
            )}
            {pista && !desafioUI && (
              <div className="absolute inset-x-0 top-0 bg-aviso-tinte px-3 py-1.5 text-center text-[0.8rem] font-semibold text-aviso">
                {pista}
              </div>
            )}
            {desafioUI && (
              // Todos los gestos a la vista desde el principio: el que ya hiciste queda tachado en verde, el
              // que toca ahora va resaltado y los que faltan quedan apagados. Nada desaparece de golpe.
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
          </div>

          {error && <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] text-peligro">{error}</p>}

          <div role="group" aria-label="Cantidad de gestos" className="flex items-center justify-center gap-2 text-[0.82rem]">
            <span className="text-tinta-media">Gestos por desafío:</span>
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={cantidadGestos === n}
                disabled={!!desafioUI}
                onClick={() => setCantidadGestos(n)}
                className={`h-8 w-9 rounded-full border text-[0.85rem] font-semibold transition-colors disabled:opacity-50 ${
                  cantidadGestos === n
                    ? "border-azul bg-azul-luz text-azul-oscuro"
                    : "border-linea text-tinta-media hover:border-azul/40"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {(fase === "inicio" || fase === "error") && (
              <button type="button" onClick={iniciar} className={clasesBoton("principal", "md")}>
                Encender la cámara
              </button>
            )}
            {fase === "cargando" && (
              <button type="button" disabled className={clasesBoton("principal", "md")}>
                Preparando…
              </button>
            )}
            {fase === "listo" && (
              <>
                <button
                  type="button"
                  onClick={empezarDesafio}
                  disabled={!!desafioUI}
                  className={clasesBoton("principal", "md")}
                >
                  Probar desafío
                </button>
                <button type="button" onClick={detener} className={clasesBoton("peligro", "md")}>
                  Apagar la cámara
                </button>
              </>
            )}
          </div>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4 !border-2 !border-azul/50">
          <div>
            <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Lo que mide la cámara, en vivo</h2>
            <p className="mt-0.5 text-[0.8rem] text-tinta-suave">
              La rayita negra es el valor desde el que se da el gesto por hecho; la barra se pone verde al pasarlo.
            </p>
          </div>
          <Barra rotulo="Ojos cerrados (parpadeo)" valor={m.parpadeo} umbral={UMBRALES.ojoCerrado} />
          <Barra rotulo="Boca abierta" valor={m.boca} umbral={UMBRALES.boca} />
          <Barra rotulo="Sonrisa" valor={m.sonrisa} umbral={UMBRALES.sonrisa} />
          <Barra
            rotulo="Giro de cabeza"
            valor={Math.abs(m.giro)}
            umbral={UMBRALES.giro}
            texto={`${m.giro > 0 ? "+" : ""}${m.giro.toFixed(2)} ${
              Math.abs(m.giro) < 0.1 ? "de frente" : m.giro > 0 ? "a tu derecha" : "a tu izquierda"
            }`}
          />
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-linea pt-3 text-[0.8rem] text-tinta-media">
            <span>
              Cara: <strong className="text-tinta">{m.hayRostro ? "detectada" : "no detectada"}</strong>
            </span>
            <span>
              Luz: <strong className="text-tinta">{luz === null ? "—" : `${Math.round(luz)} / 255`}</strong>
            </span>
            <span>
              Tamaño de la cara: <strong className="text-tinta">{Math.round(m.anchoRostro * 100)}% del cuadro</strong>
            </span>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta className="flex flex-col gap-3 !border-2 !border-azul/50">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Intentos</h2>
          {intentos.length > 0 && (
            <span className="text-[0.82rem] text-tinta-media">
              {aprobados} de {intentos.length} aprobados
            </span>
          )}
        </div>

        {intentos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linea bg-papel-suave px-3 py-6 text-center text-[0.85rem] text-tinta-media">
            Todavía no hiciste ningún desafío. Encendé la cámara y tocá "Probar desafío".
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-linea-fina">
            {intentos.map((i) => (
              <li key={i.id} className="flex items-start gap-3 py-2.5">
                {i.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={i.foto}
                    alt=""
                    className="h-16 w-12 flex-none rounded-md border border-linea object-cover [transform:scaleX(-1)]"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pastilla color={i.aprobado ? "exito" : "peligro"} punto>
                      {i.aprobado ? "Aprobado" : "No aprobado"}
                    </Pastilla>
                    <span className="cifra text-[0.78rem] text-tinta-suave">
                      {i.hora} · {i.segundos.toFixed(1)} s
                    </span>
                  </div>
                  <p className="mt-1 text-[0.82rem] text-tinta">{i.gestos.map((g) => GESTOS[g].corto).join(" + ")}</p>
                  <p className="text-[0.76rem] text-tinta-suave">{i.detalle}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
