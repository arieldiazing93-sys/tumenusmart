"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { urlCita } from "@/lib/agenda";

const CLAVE_SONIDO = "tumenusmart:avisoReservas";
const CLAVE_VISTAS = "tumenusmart:reservasVistas";
const SEGUNDOS_ENTRE_CHEQUEOS = 15;
/** Cuántos carteles se ven a la vez; el resto se cuenta ("y 2 más"). */
const MAXIMO_VISIBLES = 3;

type Reserva = {
  id: string;
  cliente: string;
  servicios: string | null;
  personal: string;
  /** "YYYY-MM-DD" y "HH:MM" del turno. */
  dia: string;
  hora: string;
  /** "jueves 25 de septiembre a las 18:30", ya armado. */
  cuando: string;
};

/** Las reservas que este navegador ya avisó, para no avisar dos veces la misma (ni al recargar). */
function leerVistas(): Set<string> {
  try {
    const texto = window.localStorage.getItem(CLAVE_VISTAS);
    const lista: unknown = texto ? JSON.parse(texto) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function guardarVistas(vistas: Set<string>) {
  try {
    window.localStorage.setItem(CLAVE_VISTAS, JSON.stringify([...vistas].slice(-100)));
  } catch {
    // Sin localStorage el aviso igual funciona; solo puede repetirse tras recargar.
  }
}

/**
 * Avisa —con un sonido y un cartel— cuando entra una reserva por la página pública, desde cualquier pantalla del
 * panel. La reserva "entra" cuando ya se ve en el calendario: apenas se crea, o cuando el cliente toca "Enviar por
 * WhatsApp", según cómo lo configuró el negocio.
 *
 * Es la misma idea que el aviso de Pedidos (consulta al servidor cada pocos segundos; el sonido se genera con la Web
 * Audio API) y con sus mismos límites: el navegador no deja sonar hasta que la persona toque la pantalla una vez por
 * visita —mientras tanto la campana lo dice en ámbar—, y el panel tiene que estar abierto. El sonido es otro (tres
 * notas que suben) para no confundirlo con un pedido.
 *
 * Trae la campana para la barra de arriba (prender o apagar el sonido) y dibuja los carteles fuera de ella, en el
 * <body>, para que ningún efecto de la barra los acomode mal.
 */
export function AvisoReservasNuevas() {
  const router = useRouter();
  const ruta = usePathname();
  const [montado, setMontado] = useState(false);
  // Arranca prendido: lo que se recuerda es si el usuario lo apagó.
  const [sonidoActivo, setSonidoActivo] = useState(true);
  // "Lo quiere" y "puede sonar" son dos cosas: la segunda la da el navegador y se pierde en cada visita.
  const [audioListo, setAudioListo] = useState(false);
  const [avisos, setAvisos] = useState<Reserva[]>([]);
  const contexto = useRef<AudioContext | null>(null);
  const vistas = useRef<Set<string>>(new Set());
  // Los chequeos corren en un intervalo: leen esto en vez de las variables del render para no quedar desactualizados.
  const sonidoRef = useRef(true);
  const rutaRef = useRef(ruta ?? "");
  useEffect(() => {
    sonidoRef.current = sonidoActivo;
  }, [sonidoActivo]);
  useEffect(() => {
    rutaRef.current = ruta ?? "";
  }, [ruta]);

  // Crea (o reanuda) el contexto de audio; devuelve si quedó sonando. El corte por tiempo es necesario: si se llama
  // a resume() antes de que la persona toque la pantalla, Chrome deja la promesa colgada para siempre.
  const asegurarAudio = useCallback(async () => {
    try {
      if (!contexto.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return false;
        contexto.current = new Ctor();
      }
      const ctx = contexto.current;
      if (ctx.state === "suspended") {
        await Promise.race([ctx.resume(), new Promise((listo) => setTimeout(listo, 400))]);
      }
      return ctx.state === "running";
    } catch {
      return false;
    }
  }, []);

  // Tres notas que suben (do, mi, sol): se distingue de la campanita de dos tonos de Pedidos.
  const sonar = useCallback(async () => {
    const listo = await asegurarAudio();
    setAudioListo(listo);
    const ctx = contexto.current;
    if (!listo || !ctx) return;
    const inicio = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((frecuencia, i) => {
      const desde = inicio + i * 0.17;
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, desde);
      vol.gain.exponentialRampToValueAtTime(0.28, desde + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, desde + 0.22);
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.start(desde);
      osc.stop(desde + 0.24);
    });
  }, [asegurarAudio]);

  // Al abrir: qué reservas ya se avisaron, y si el usuario había apagado el sonido.
  useEffect(() => {
    setMontado(true);
    vistas.current = leerVistas();
    let quiere = true;
    try {
      quiere = window.localStorage.getItem(CLAVE_SONIDO) !== "0";
    } catch {
      quiere = true;
    }
    setSonidoActivo(quiere);
    if (!quiere) return;
    let cancelado = false;
    void asegurarAudio().then((listo) => {
      if (!cancelado) setAudioListo(listo);
    });
    return () => {
      cancelado = true;
    };
  }, [asegurarAudio]);

  // Si lo quiere pero el navegador todavía no deja sonar, se espera el primer toque en CUALQUIER parte de la pantalla.
  useEffect(() => {
    if (!sonidoActivo || audioListo) return;
    const alTocar = () => {
      void asegurarAudio().then(setAudioListo);
    };
    document.addEventListener("pointerdown", alTocar);
    document.addEventListener("keydown", alTocar);
    return () => {
      document.removeEventListener("pointerdown", alTocar);
      document.removeEventListener("keydown", alTocar);
    };
  }, [sonidoActivo, audioListo, asegurarAudio]);

  // El chequeo periódico contra el servidor.
  useEffect(() => {
    let cancelado = false;

    async function revisar() {
      try {
        const respuesta = await fetch("/admin/api/reservas-nuevas", { cache: "no-store" });
        if (!respuesta.ok || cancelado) return;
        const datos: { reservas?: Reserva[] } = await respuesta.json();
        const nuevas = (datos.reservas ?? []).filter((r) => !vistas.current.has(r.id));
        if (nuevas.length === 0) return;

        for (const r of nuevas) vistas.current.add(r.id);
        guardarVistas(vistas.current);
        setAvisos((previos) => [...nuevas, ...previos].slice(0, 10));
        if (sonidoRef.current) void sonar();
        // Con el calendario (o Citas) abierto, la reserva aparece sola.
        if (rutaRef.current.startsWith("/admin/agenda")) router.refresh();
      } catch {
        // Sin conexión un momento: se reintenta en el próximo ciclo.
      }
    }

    void revisar();
    const id = setInterval(revisar, SEGUNDOS_ENTRE_CHEQUEOS * 1000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [router, sonar]);

  async function alternarSonido() {
    if (sonidoActivo) {
      setSonidoActivo(false);
      try {
        window.localStorage.setItem(CLAVE_SONIDO, "0");
      } catch {
        // No es grave.
      }
      return;
    }
    const listo = await asegurarAudio();
    setSonidoActivo(true);
    setAudioListo(listo);
    try {
      window.localStorage.setItem(CLAVE_SONIDO, "1");
    } catch {
      // No es grave.
    }
    if (listo) void sonar(); // una prueba, para que se escuche cómo suena
  }

  function descartar(id: string) {
    setAvisos((previos) => previos.filter((a) => a.id !== id));
  }

  const estado: "apagado" | "trabado" | "andando" = !sonidoActivo ? "apagado" : audioListo ? "andando" : "trabado";
  const visibles = avisos.slice(0, MAXIMO_VISIBLES);
  const ocultos = avisos.length - visibles.length;

  return (
    <>
      {/* ---------- la campana, en la barra de arriba ---------- */}
      <button
        type="button"
        onClick={alternarSonido}
        aria-pressed={sonidoActivo}
        aria-label="Aviso sonoro de reservas nuevas"
        title={
          estado === "andando"
            ? "Suena cuando entra una reserva. Tocá para apagarlo."
            : estado === "trabado"
              ? "El navegador todavía no deja sonar. Se destraba tocando cualquier parte de la pantalla."
              : "Activá el aviso y el panel suena cuando entra una reserva."
        }
        className={`relative flex h-8 w-8 flex-none items-center justify-center rounded-lg border transition-colors duration-150 ${
          estado === "andando"
            ? "border-azul/40 bg-azul-luz text-azul-oscuro"
            : estado === "trabado"
              ? "border-aviso/45 bg-aviso-tinte text-aviso"
              : "border-linea bg-papel-hundido text-tinta-suave hover:border-azul/40 hover:text-azul-oscuro"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-[16px] w-[16px]"
        >
          <path d="M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z" />
          {estado === "andando" ? <path d="m9 14.5 2 2 4-4" /> : <path d="m5 3 14 18" />}
        </svg>
        {avisos.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-azul px-1 text-[0.62rem] font-bold leading-none text-white">
            {avisos.length}
          </span>
        )}
      </button>

      {/* ---------- los carteles, fuera de la barra ---------- */}
      {montado &&
        visibles.length > 0 &&
        createPortal(
          <div
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3"
          >
            {visibles.map((a) => (
              <div
                key={a.id}
                role="status"
                className="pointer-events-auto flex w-full max-w-md animate-deslizar items-start gap-3 rounded-xl border border-l-4 border-linea border-l-azul bg-superficie p-3.5 shadow-alta"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-azul-oscuro">Reserva nueva</p>
                  <p className="mt-0.5 truncate text-[0.95rem] font-semibold text-tinta">{a.cliente}</p>
                  {a.servicios && <p className="truncate text-[0.82rem] text-tinta-media">{a.servicios}</p>}
                  <p className="text-[0.8rem] text-tinta-suave">
                    {a.cuando} · con {a.personal}
                  </p>
                </div>
                <div className="flex flex-none flex-col items-end gap-1.5">
                  <Link
                    href={urlCita({ vista: "dia", fecha: a.dia, personal: null, ocultar: [] }, a.id)}
                    scroll={false}
                    onClick={() => descartar(a.id)}
                    className={clasesBoton("navegar", "sm")}
                  >
                    Ver
                  </Link>
                  <button
                    type="button"
                    onClick={() => descartar(a.id)}
                    className="text-[0.74rem] font-medium text-tinta-suave hover:text-tinta hover:underline"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ))}
            {ocultos > 0 && (
              <button
                type="button"
                onClick={() => setAvisos([])}
                className="pointer-events-auto rounded-full border border-linea bg-superficie px-3 py-1 text-[0.76rem] font-medium text-tinta-media shadow-media hover:text-tinta"
              >
                y {ocultos} {ocultos === 1 ? "reserva más" : "reservas más"} · cerrar todas
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
