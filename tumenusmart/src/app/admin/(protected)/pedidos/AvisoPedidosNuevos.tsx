"use client";

import { clasesBoton } from "@/components/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const CLAVE_PREFERENCIA = "tumenusmart:avisoSonoro";
const SEGUNDOS_ENTRE_CHEQUEOS = 15;

type Props = {
  /** cantidad de pedidos enviados al momento de renderizar la página */
  enviadosIniciales: number;
};

/**
 * Vigila si entran pedidos nuevos y avisa con un sonido + un cartel.
 *
 * El sonido se genera con la Web Audio API (no hay archivo que cargar) y el
 * navegador NO lo deja sonar hasta que la persona toque algo de la página.
 *
 * Ese permiso no se hereda entre visitas. Antes, al volver a entrar, se leía
 * la preferencia guardada, el botón se ponía en verde y quedaba diciendo
 * "activado" — pero el audio seguía bloqueado, así que entraba el pedido, se
 * veía el cartel y no sonaba nada. El botón mentía.
 *
 * Ahora se distinguen dos cosas que antes eran una: QUERER el aviso (la
 * preferencia, que sí se recuerda) y PODER sonar (el permiso del navegador,
 * que hay que volver a conseguir en cada visita). Mientras falte el permiso,
 * el botón lo dice en ámbar en vez de mostrarse verde; se destraba con el
 * primer toque en cualquier parte de la pantalla, sin apretar nada especial.
 */
export function AvisoPedidosNuevos({ enviadosIniciales }: Props) {
  const router = useRouter();
  // "Lo quiere" y "puede sonar" son dos cosas distintas: la primera se
  // guarda entre visitas, la segunda la da el navegador y se pierde siempre.
  const [sonidoActivo, setSonidoActivo] = useState(false);
  const [audioListo, setAudioListo] = useState(false);
  const [nuevos, setNuevos] = useState(0);
  const vistos = useRef(enviadosIniciales);
  // Arranca en null y no en 0: el total real se conoce recién en el primer
  // chequeo, y comparar contra un 0 inventado dispararía un refresco al pedo
  // apenas se abre la pantalla.
  const totalVisto = useRef<number | null>(null);
  const contexto = useRef<AudioContext | null>(null);

  // Crea (o reanuda) el contexto de audio. Devuelve si quedó sonando.
  //
  // El `Promise.race` no es paranoia: si se llama a resume() ANTES de que la
  // persona haya tocado la pantalla, Chrome devuelve una promesa que NO SE
  // RESUELVE NUNCA — ni siquiera cuando después toca algo. Lo comprobé en
  // Chromium: el resume() de la carga sigue pendiente para siempre, y hay que
  // llamar a resume() de nuevo, ya con el toque hecho, para que ande.
  //
  // Sin el corte por tiempo, esta función quedaba colgada y nadie se enteraba:
  // el estado del botón no se actualizaba y el aviso no volvía a intentarlo.
  const asegurarAudio = useCallback(async () => {
    try {
      if (!contexto.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return false;
        contexto.current = new Ctor();
      }
      const ctx = contexto.current;
      if (ctx.state === "suspended") {
        await Promise.race([
          ctx.resume(),
          new Promise((listo) => setTimeout(listo, 400)),
        ]);
      }
      return ctx.state === "running";
    } catch {
      return false;
    }
  }, []);

  // Dos tonos cortos, tipo campanilla de mostrador.
  //
  // Antes de sonar se reintenta destrabar el audio. Los navegadores suspenden
  // el contexto cuando la pestaña queda mucho rato de fondo — que es
  // exactamente lo que hace una pantalla de pedidos abierta toda la noche — y
  // sin esto el aviso se apagaba solo sin que nadie se enterara.
  const sonar = useCallback(async () => {
    const listo = await asegurarAudio();
    setAudioListo(listo);
    const ctx = contexto.current;
    if (!listo || !ctx) return;
    const inicio = ctx.currentTime;
    [880, 1320].forEach((frecuencia, i) => {
      const desde = inicio + i * 0.18;
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, desde);
      vol.gain.exponentialRampToValueAtTime(0.25, desde + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, desde + 0.16);
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.start(desde);
      osc.stop(desde + 0.18);
    });
  }, [asegurarAudio]);

  // Recuerda si el encargado ya había dejado el aviso activado. Se intenta
  // destrabar el audio, pero SIN dar por hecho que salió: recién volviendo de
  // `asegurarAudio` se sabe si el navegador lo permitió.
  useEffect(() => {
    let cancelado = false;
    try {
      if (window.localStorage.getItem(CLAVE_PREFERENCIA) !== "1") return;
    } catch {
      return; // Sin localStorage, arranca desactivado.
    }
    setSonidoActivo(true);
    void asegurarAudio().then((listo) => {
      if (!cancelado) setAudioListo(listo);
    });
    return () => {
      cancelado = true;
    };
  }, [asegurarAudio]);

  // Si lo quiere pero el navegador todavía no deja, se espera el primer toque
  // en CUALQUIER parte de la pantalla. Así el encargado no tiene que saber que
  // hay que apretar un botón en particular: abre la pantalla, toca un pedido
  // como hace siempre, y el aviso queda andando.
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

  async function alternarSonido() {
    if (sonidoActivo) {
      setSonidoActivo(false);
      try {
        window.localStorage.setItem(CLAVE_PREFERENCIA, "0");
      } catch {
        /* preferencia no persistida, no es grave */
      }
      return;
    }

    const listo = await asegurarAudio();
    setSonidoActivo(true);
    setAudioListo(listo);
    try {
      window.localStorage.setItem(CLAVE_PREFERENCIA, "1");
    } catch {
      /* preferencia no persistida, no es grave */
    }
    if (listo) void sonar(); // prueba, para que se escuche cómo suena
  }

  // Chequeo periódico contra el servidor.
  useEffect(() => {
    let cancelado = false;

    async function revisar() {
      try {
        const respuesta = await fetch("/admin/api/pedidos-nuevos", { cache: "no-store" });
        if (!respuesta.ok || cancelado) return;
        const datos: { enviados: number; total?: number } = await respuesta.json();

        // Un pedido ENVIADO: campana, cartel y refresco.
        if (datos.enviados > vistos.current) {
          const diferencia = datos.enviados - vistos.current;
          vistos.current = datos.enviados;
          setNuevos((previos) => previos + diferencia);
          if (sonidoActivo) void sonar();
          router.refresh();
        } else if (datos.enviados < vistos.current) {
          // Puede pasar si se borró algún pedido: se resincroniza y listo.
          vistos.current = datos.enviados;
        }

        // Cualquier otro movimiento —un pedido que quedó "sin enviar", un
        // cambio de estado desde otra pantalla— solo refresca la tabla, en
        // silencio. Sin esto, un pedido trabado no aparecía hasta que alguien
        // recargaba el navegador a mano.
        const total = datos.total;
        if (typeof total === "number") {
          if (totalVisto.current === null) {
            totalVisto.current = total;
          } else if (total !== totalVisto.current) {
            totalVisto.current = total;
            router.refresh();
          }
        }
      } catch {
        // Sin conexión momentánea: se reintenta en el próximo ciclo.
      }
    }

    const id = setInterval(revisar, SEGUNDOS_ENTRE_CHEQUEOS * 1000);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [router, sonar, sonidoActivo]);

  // Tres estados y no dos. El del medio es el que faltaba: lo quiere prendido
  // pero el navegador todavía no deja sonar. Mostrarlo verde ahí es lo que
  // hacía que el encargado confiara en un aviso que no iba a llegar.
  const estado: "apagado" | "trabado" | "andando" = !sonidoActivo
    ? "apagado"
    : audioListo
      ? "andando"
      : "trabado";

  function verNuevos() {
    setNuevos(0);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        El botón dice qué pasa si lo apretás, no en qué estado está: "Activar
        aviso sonoro" cuando está apagado. El estado se ve por el color y la
        campana. Antes ocupaba una línea entera para decir "activado", que es
        justamente cuando NO hace falta explicar nada.
      */}
      <button
        type="button"
        onClick={alternarSonido}
        title={
          estado === "andando"
            ? "El aviso sonoro está andando. Tocá para apagarlo."
            : estado === "trabado"
              ? "El navegador todavía no deja sonar. Se destraba tocando cualquier parte de la pantalla."
              : "Activalo una vez y esta pantalla te avisa cuando entra un pedido."
        }
        aria-pressed={sonidoActivo}
        className={`flex flex-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold transition-colors duration-150 ${
          estado === "andando"
            ? "border-exito/45 bg-exito-tinte text-exito"
            : estado === "trabado"
              ? "border-aviso/45 bg-aviso-tinte text-aviso"
              : "border-linea bg-papel-hundido text-tinta-media hover:border-brand hover:bg-brand-light hover:text-brand-texto"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-[15px] w-[15px] flex-none"
        >
          <path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9Z" />
          <path d="M10.5 18a1.5 1.5 0 0 0 3 0" />
          {estado !== "andando" && <path d="m4 4 16 16" />}
        </svg>
        <span className="hidden sm:inline">
          {estado === "andando"
            ? "Aviso sonoro"
            : estado === "trabado"
              ? "Tocá para el sonido"
              : "Activar aviso"}
        </span>
      </button>

      {nuevos > 0 && (
        <button
          type="button"
          onClick={verNuevos}
          className={`animate-pulse ${clasesBoton("principal", "sm")}`}
        >
          🛎 {nuevos} {nuevos === 1 ? "pedido nuevo" : "pedidos nuevos"} — ver
        </button>
      )}
    </div>
  );
}
