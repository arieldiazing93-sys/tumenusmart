"use client";

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
 * El sonido se genera con la Web Audio API (no hay archivo de audio que
 * cargar) y hace falta activarlo con un clic: los navegadores no dejan
 * reproducir audio sin que la persona haya interactuado con la página.
 */
export function AvisoPedidosNuevos({ enviadosIniciales }: Props) {
  const router = useRouter();
  const [sonidoActivo, setSonidoActivo] = useState(false);
  const [nuevos, setNuevos] = useState(0);
  const vistos = useRef(enviadosIniciales);
  const contexto = useRef<AudioContext | null>(null);

  // Crea (o reanuda) el contexto de audio. Debe llamarse desde un clic.
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
      if (contexto.current.state === "suspended") {
        await contexto.current.resume();
      }
      return contexto.current.state === "running";
    } catch {
      return false;
    }
  }, []);

  // Dos tonos cortos, tipo campanilla de mostrador.
  const sonar = useCallback(() => {
    const ctx = contexto.current;
    if (!ctx || ctx.state !== "running") return;
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
  }, []);

  // Recuerda si el encargado ya había dejado el aviso activado.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_PREFERENCIA) === "1") {
        setSonidoActivo(true);
        void asegurarAudio();
      }
    } catch {
      // Sin localStorage, simplemente arranca desactivado.
    }
  }, [asegurarAudio]);

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
    try {
      window.localStorage.setItem(CLAVE_PREFERENCIA, "1");
    } catch {
      /* preferencia no persistida, no es grave */
    }
    if (listo) sonar(); // prueba, para que se escuche cómo suena
  }

  // Chequeo periódico contra el servidor.
  useEffect(() => {
    let cancelado = false;

    async function revisar() {
      try {
        const respuesta = await fetch("/admin/api/pedidos-nuevos", { cache: "no-store" });
        if (!respuesta.ok || cancelado) return;
        const datos: { enviados: number } = await respuesta.json();

        if (datos.enviados > vistos.current) {
          const diferencia = datos.enviados - vistos.current;
          vistos.current = datos.enviados;
          setNuevos((previos) => previos + diferencia);
          if (sonidoActivo) sonar();
          router.refresh();
        } else if (datos.enviados < vistos.current) {
          // Puede pasar si se borró algún pedido: se resincroniza y listo.
          vistos.current = datos.enviados;
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

  function verNuevos() {
    setNuevos(0);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={alternarSonido}
        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
          sonidoActivo
            ? "border-green-300 bg-green-50 text-green-800"
            : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
        }`}
      >
        {sonidoActivo ? "🔔 Aviso sonoro activado" : "🔕 Activar aviso sonoro"}
      </button>

      {!sonidoActivo && (
        <span className="text-xs text-neutral-400">
          Activalo una vez y esta pantalla te avisa cuando entra un pedido.
        </span>
      )}

      {nuevos > 0 && (
        <button
          type="button"
          onClick={verNuevos}
          className="animate-pulse rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          🛎 {nuevos} {nuevos === 1 ? "pedido nuevo" : "pedidos nuevos"} — ver
        </button>
      )}
    </div>
  );
}
