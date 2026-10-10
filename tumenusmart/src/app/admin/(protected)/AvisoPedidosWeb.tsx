"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { formatearGuarani, formatearNumero } from "@/lib/format";

const CLAVE_SONIDO = "tumenusmart:avisoPedidosWeb";
const CLAVE_VISTOS = "tumenusmart:pedidosWebVistos";
const SEGUNDOS_ENTRE_CHEQUEOS = 10;
/** Cuántos carteles se ven a la vez; el resto se cuenta ("y 2 más"). */
const MAXIMO_VISIBLES = 3;

type PedidoNuevo = { id: string; numero: number; cliente: string; total: number; tipoEntrega: string };

/** Los pedidos que este navegador ya avisó, para no avisar dos veces el mismo (ni al recargar). */
function leerVistos(): Set<string> {
  try {
    const texto = window.localStorage.getItem(CLAVE_VISTOS);
    const lista: unknown = texto ? JSON.parse(texto) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function guardarVistos(vistos: Set<string>) {
  try {
    window.localStorage.setItem(CLAVE_VISTOS, JSON.stringify([...vistos].slice(-200)));
  } catch {
    // Sin localStorage el aviso igual funciona; solo puede repetirse tras recargar.
  }
}

/**
 * Avisa —con un sonido y un cartel— cuando entra un pedido por el menú digital, desde cualquier pantalla del panel. Con la
 * cantidad de pedidos que esperan decisión sobre la campana, para que se vea aunque el cartel ya se haya cerrado.
 *
 * Misma mecánica que el aviso de reservas: consulta al servidor cada pocos segundos y el sonido se genera con la Web Audio API.
 * Con sus mismos límites: el navegador no deja sonar hasta que la persona toque la pantalla una vez por visita (mientras tanto la
 * campana lo dice en ámbar) y el panel tiene que estar abierto. El sonido son dos notas (distinto al de reservas).
 */
export function AvisoPedidosWeb() {
  const router = useRouter();
  const ruta = usePathname();
  const [montado, setMontado] = useState(false);
  const [sonidoActivo, setSonidoActivo] = useState(true);
  const [audioListo, setAudioListo] = useState(false);
  const [avisos, setAvisos] = useState<PedidoNuevo[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const contexto = useRef<AudioContext | null>(null);
  const vistos = useRef<Set<string>>(new Set());
  const sonidoRef = useRef(true);
  const rutaRef = useRef(ruta ?? "");
  useEffect(() => {
    sonidoRef.current = sonidoActivo;
  }, [sonidoActivo]);
  useEffect(() => {
    rutaRef.current = ruta ?? "";
  }, [ruta]);

  // Crea (o reanuda) el contexto de audio; devuelve si quedó sonando. El corte por tiempo es necesario: si se llama a resume()
  // antes de que la persona toque la pantalla, Chrome deja la promesa colgada para siempre.
  const asegurarAudio = useCallback(async () => {
    try {
      if (!contexto.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  // Una campanita de dos notas (sol y do agudo), dos veces: se distingue del aviso de reservas.
  const sonar = useCallback(async () => {
    const listo = await asegurarAudio();
    setAudioListo(listo);
    const ctx = contexto.current;
    if (!listo || !ctx) return;
    const inicio = ctx.currentTime;
    [0, 0.55].forEach((desfase) => {
      [783.99, 1046.5].forEach((frecuencia, i) => {
        const desde = inicio + desfase + i * 0.16;
        const osc = ctx.createOscillator();
        const vol = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = frecuencia;
        vol.gain.setValueAtTime(0.0001, desde);
        vol.gain.exponentialRampToValueAtTime(0.3, desde + 0.02);
        vol.gain.exponentialRampToValueAtTime(0.0001, desde + 0.3);
        osc.connect(vol);
        vol.connect(ctx.destination);
        osc.start(desde);
        osc.stop(desde + 0.32);
      });
    });
  }, [asegurarAudio]);

  // Al abrir: qué pedidos ya se avisaron, y si el usuario había apagado el sonido.
  useEffect(() => {
    setMontado(true);
    vistos.current = leerVistos();
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
        const respuesta = await fetch("/admin/api/pedidos-web-nuevos", { cache: "no-store" });
        if (!respuesta.ok || cancelado) return;
        const datos: { pendientes?: number; pedidos?: PedidoNuevo[] } = await respuesta.json();
        setPendientes(datos.pendientes ?? 0);
        const nuevos = (datos.pedidos ?? []).filter((p) => !vistos.current.has(p.id));
        if (nuevos.length === 0) return;

        for (const p of nuevos) vistos.current.add(p.id);
        guardarVistos(vistos.current);
        setAvisos((previos) => [...nuevos, ...previos].slice(0, 10));
        if (sonidoRef.current) void sonar();
        // Con la bandeja abierta, el pedido aparece solo.
        if (rutaRef.current.startsWith("/admin/pedidos-web")) router.refresh();
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
        aria-label="Aviso sonoro de pedidos nuevos del menú"
        title={
          estado === "andando"
            ? "Suena cuando entra un pedido del menú. Tocá para apagarlo."
            : estado === "trabado"
              ? "El navegador todavía no deja sonar. Se destraba tocando cualquier parte de la pantalla."
              : "Activá el aviso y el panel suena cuando entra un pedido del menú."
        }
        className={`relative flex h-8 w-8 flex-none items-center justify-center rounded-lg border transition-colors duration-150 ${
          estado === "andando"
            ? "border-brand/40 bg-brand-light text-brand-texto"
            : estado === "trabado"
              ? "border-aviso/45 bg-aviso-tinte text-aviso"
              : "border-linea bg-papel-hundido text-tinta-suave hover:border-brand/40 hover:text-brand-texto"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[16px] w-[16px]">
          <path d="M6 7h12l1 13H5L6 7Z" />
          <path d="M9 7V6a3 3 0 0 1 6 0v1" />
          {estado === "andando" ? null : <path d="m4 3 16 18" />}
        </svg>
        {pendientes > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[0.62rem] font-bold leading-none text-white">
            {pendientes}
          </span>
        )}
      </button>

      {/* ---------- los carteles, fuera de la barra ---------- */}
      {montado &&
        visibles.length > 0 &&
        createPortal(
          <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3">
            {visibles.map((a) => (
              <div
                key={a.id}
                role="status"
                className="pointer-events-auto flex w-full max-w-md animate-deslizar items-start gap-3 rounded-xl border border-l-4 border-linea border-l-brand bg-superficie p-3.5 shadow-alta"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-brand-texto">Pedido nuevo del menú</p>
                  <p className="mt-0.5 truncate text-[0.95rem] font-semibold text-tinta">
                    {formatearNumero(a.numero)} · {a.cliente}
                  </p>
                  <p className="text-[0.8rem] text-tinta-suave">
                    {a.tipoEntrega === "retiro" ? "Retiro en el local" : "Delivery"} · {formatearGuarani(a.total)}
                  </p>
                </div>
                <div className="flex flex-none flex-col items-end gap-1.5">
                  <Link href="/admin/pedidos-web" scroll={false} onClick={() => descartar(a.id)} className={clasesBoton("navegar", "sm")}>
                    Ver
                  </Link>
                  <button type="button" onClick={() => descartar(a.id)} className="text-[0.74rem] font-medium text-tinta-suave hover:text-tinta hover:underline">
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
                y {ocultos} {ocultos === 1 ? "pedido más" : "pedidos más"} · cerrar todos
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
