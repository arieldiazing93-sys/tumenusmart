"use client";

import { useCallback, useEffect, useState } from "react";
import { VerificadorPersona, type ResultadoVerificacion } from "@/components/VerificadorPersona";
import { clasesBoton } from "@/components/ui";
import { ETIQUETA_TIPO, type TipoMarcacion } from "@/lib/asistencia";
import { identificarPin, registrarMarcacion, type ResultadoMarcacion } from "./actions";

type Exito = Extract<ResultadoMarcacion, { ok: true }>;

type Paso =
  | { paso: "inicio" }
  | { paso: "pin" }
  | { paso: "camara"; pin: string; nombre: string; tipo: TipoMarcacion; alternativas: TipoMarcacion[] }
  | { paso: "guardando"; nombre: string; tipo: TipoMarcacion }
  | { paso: "listo"; resultado: Exito }
  | { paso: "error"; mensaje: string };

/** Cuánto se espera sin que nadie toque nada antes de volver al inicio (para no dejar un PIN a medio escribir a la vista). */
const INACTIVIDAD_MS: Partial<Record<Paso["paso"], number>> = {
  pin: 45_000,
  camara: 90_000,
  error: 15_000,
  listo: 6_000,
};

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const LARGO_MAXIMO_PIN = 6;

/**
 * El celular fijo del Registro de asistencia, en la pared del local. El camino es siempre el mismo y corto:
 * "Registrar asistencia" → el PIN de la persona (que es lo que la identifica) → la cámara le saca la selfie sola y la
 * marcación queda guardada. No hay que elegir el nombre en una lista (con muchas personas sería interminable) ni qué se
 * marca: el sistema sabe qué le toca (entrada, salida a almorzar, vuelta del almuerzo o salida) según lo último que
 * marcó. Sin usuario ni contraseña: la llave está en la dirección.
 */
export function Kiosco({ token, nombreNegocio }: { token: string; nombreNegocio: string }) {
  const [estado, setEstado] = useState<Paso>({ paso: "inicio" });
  const [pin, setPin] = useState("");
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [reloj, setReloj] = useState("");

  const reiniciar = useCallback(() => {
    setEstado({ paso: "inicio" });
    setPin("");
    setErrorPin(null);
    setVerificando(false);
  }, []);

  // El reloj, en hora de Asunción. Recién después de montar, para que el servidor y el celular no discrepen.
  useEffect(() => {
    const dar = () =>
      setReloj(
        new Date().toLocaleTimeString("es-PY", {
          timeZone: "America/Asuncion",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    dar();
    const id = setInterval(dar, 1000);
    return () => clearInterval(id);
  }, []);

  // Que la pantalla no se apague: es un celular fijo en la pared.
  useEffect(() => {
    let candado: { release: () => Promise<void> } | null = null;
    let activo = true;
    async function pedir() {
      try {
        const wakeLock = (
          navigator as Navigator & {
            wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
          }
        ).wakeLock;
        if (wakeLock && document.visibilityState === "visible") {
          const obtenido = await wakeLock.request("screen");
          if (activo) candado = obtenido;
          else void obtenido.release();
        }
      } catch {
        // Sin soporte o sin permiso: la pantalla se apaga como siempre.
      }
    }
    void pedir();
    const alVolver = () => {
      if (document.visibilityState === "visible") void pedir();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      activo = false;
      document.removeEventListener("visibilitychange", alVolver);
      void candado?.release();
    };
  }, []);

  // Si nadie toca nada, vuelve al inicio.
  useEffect(() => {
    const ms = INACTIVIDAD_MS[estado.paso];
    if (!ms) return;
    const id = setTimeout(reiniciar, ms);
    return () => clearTimeout(id);
  }, [estado, pin, reiniciar]);

  function empezar() {
    setPin("");
    setErrorPin(null);
    setEstado({ paso: "pin" });
  }

  function tocarTecla(digito: string) {
    if (verificando) return;
    setErrorPin(null);
    setPin((p) => (p.length >= LARGO_MAXIMO_PIN ? p : p + digito));
  }

  async function enviarPin() {
    if (estado.paso !== "pin" || pin.length < 4 || verificando) return;
    setVerificando(true);
    setErrorPin(null);
    try {
      const r = await identificarPin(token, pin);
      if (!r.ok) {
        setErrorPin(r.error);
        setPin("");
        return;
      }
      setEstado({ paso: "camara", pin, nombre: r.nombre, tipo: r.tipo, alternativas: r.alternativas });
    } catch {
      setErrorPin("No se pudo conectar. Revisá el internet y probá de nuevo.");
    } finally {
      setVerificando(false);
    }
  }

  async function alVerificar(r: ResultadoVerificacion) {
    if (estado.paso !== "camara") return;
    const { pin: pinPuesto, nombre, tipo } = estado;
    setEstado({ paso: "guardando", nombre, tipo });

    const datos = new FormData();
    datos.set("token", token);
    datos.set("pin", pinPuesto);
    datos.set("tipo", tipo);
    datos.set("verificada", r.verificada ? "1" : "0");
    datos.set("archivo", r.foto, "marcacion.jpg");

    try {
      const resultado = await registrarMarcacion(datos);
      if (!resultado.ok) {
        setEstado({ paso: "error", mensaje: resultado.error });
        return;
      }
      setPin("");
      setEstado({ paso: "listo", resultado });
    } catch {
      setEstado({ paso: "error", mensaje: "No se pudo guardar la marcación. Revisá el internet y probá de nuevo." });
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-6 pt-4">
      <header className="flex items-center justify-between gap-3 border-b border-linea pb-3">
        <div className="min-w-0">
          <p className="truncate text-[1rem] font-semibold tracking-titular text-tinta">{nombreNegocio}</p>
          <p className="text-[0.76rem] text-tinta-suave">Registro de asistencia</p>
        </div>
        <p className="cifra flex-none text-[1.5rem] font-semibold tabular-nums text-tinta">{reloj}</p>
      </header>

      <main className="flex flex-1 flex-col gap-4 pt-4">
        {/* ---------- 1. Inicio ---------- */}
        {estado.paso === "inicio" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
            <div>
              <p className="text-[1.5rem] font-semibold tracking-titular text-tinta">Bienvenido</p>
              <p className="mt-1 text-[0.95rem] text-tinta-media">Tocá el botón, poné tu PIN y sacate la selfie.</p>
            </div>
            <button
              type="button"
              onClick={empezar}
              className={`${clasesBoton("principal", "lg")} w-full max-w-xs justify-center`}
              style={{ minHeight: "5rem", fontSize: "1.3rem" }}
            >
              Registrar asistencia
            </button>
          </div>
        )}

        {/* ---------- 2. El PIN ---------- */}
        {estado.paso === "pin" && (
          <>
            <div className="text-center">
              <p className="text-[1.25rem] font-semibold tracking-titular text-tinta">Poné tu PIN</p>
            </div>

            <div className="flex justify-center gap-2.5" aria-label={`${pin.length} números puestos`}>
              {Array.from({ length: LARGO_MAXIMO_PIN }, (_, n) => (
                <span
                  key={n}
                  className={`h-4 w-4 rounded-full border-2 ${
                    n < pin.length ? "border-azul bg-azul" : "border-linea bg-superficie"
                  }`}
                />
              ))}
            </div>
            <p className="min-h-[1.2rem] text-center text-[0.85rem] font-medium text-peligro">{errorPin}</p>

            <div className="grid grid-cols-3 gap-3">
              {TECLAS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => tocarTecla(t)}
                  className="h-16 rounded-2xl border border-linea bg-superficie text-[1.6rem] font-semibold text-tinta active:bg-azul-luz"
                >
                  {t}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin((p) => p.slice(0, -1))}
                aria-label="Borrar el último número"
                className="h-16 rounded-2xl border border-linea bg-papel-suave text-[1rem] font-semibold text-tinta-media active:bg-azul-luz"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => tocarTecla("0")}
                className="h-16 rounded-2xl border border-linea bg-superficie text-[1.6rem] font-semibold text-tinta active:bg-azul-luz"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => void enviarPin()}
                disabled={pin.length < 4 || verificando}
                className="h-16 rounded-2xl bg-azul text-[1.05rem] font-semibold text-white disabled:opacity-40"
              >
                {verificando ? "…" : "Entrar"}
              </button>
            </div>

            <button type="button" onClick={reiniciar} className={`${clasesBoton("peligro", "md")} self-center`}>
              Cancelar
            </button>
          </>
        )}

        {/* ---------- 3. La selfie ---------- */}
        {estado.paso === "camara" && (
          <>
            <div className="text-center">
              <p className="text-[1.25rem] font-semibold tracking-titular text-tinta">Hola, {estado.nombre}</p>
              <p className="mt-0.5 text-[0.95rem] text-tinta-media">
                Vas a marcar: <strong className="text-tinta">{ETIQUETA_TIPO[estado.tipo].toLowerCase()}</strong>
              </p>
              {/* Quien no llegó a almorzar y se va puede cambiar la marcación antes de sacarse la selfie. */}
              {estado.alternativas.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  onClick={() => setEstado({ ...estado, tipo: alt, alternativas: [estado.tipo] })}
                  className="mt-1.5 text-[0.85rem] font-semibold text-azul underline underline-offset-2"
                >
                  ¿No es eso? Marcar {ETIQUETA_TIPO[alt].toLowerCase()}
                </button>
              ))}
            </div>
            <VerificadorPersona modo="marcacion" onResultado={alVerificar} onCancelar={reiniciar} />
          </>
        )}

        {estado.paso === "guardando" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-linea border-t-azul" aria-hidden="true" />
            <p className="text-[1.05rem] font-semibold text-tinta">Guardando tu marcación…</p>
          </div>
        )}

        {/* ---------- 4. Listo ---------- */}
        {estado.paso === "listo" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            <span
              className="flex h-24 w-24 items-center justify-center rounded-full bg-exito text-[3rem] text-white"
              aria-hidden="true"
            >
              ✓
            </span>
            <div>
              <p className="text-[1.5rem] font-semibold tracking-titular text-tinta">¡Listo, {estado.resultado.nombre}!</p>
              <p className="mt-1 text-[1.05rem] text-tinta-media">
                {ETIQUETA_TIPO[estado.resultado.tipo]} registrada a las{" "}
                <strong className="cifra text-tinta">{estado.resultado.hora}</strong>
              </p>
            </div>
            {estado.resultado.tardanzaMin !== null && estado.resultado.tardanzaMin > 0 && (
              <p className="rounded-lg bg-aviso-luz px-4 py-2 text-[0.92rem] font-semibold text-aviso">
                Llegaste {estado.resultado.tardanzaMin} min después de tu hora de entrada.
              </p>
            )}
            {!estado.resultado.verificada && (
              <p className="rounded-lg bg-aviso-luz px-4 py-2 text-[0.85rem] text-aviso">
                La cámara no llegó a ver tu cara: el dueño va a revisar tu foto.
              </p>
            )}
            <button type="button" onClick={reiniciar} className={clasesBoton("principal", "md")}>
              Listo
            </button>
          </div>
        )}

        {estado.paso === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            <span
              className="flex h-20 w-20 items-center justify-center rounded-full bg-peligro text-[2.5rem] text-white"
              aria-hidden="true"
            >
              !
            </span>
            <p className="text-[1.05rem] font-semibold text-tinta">No se pudo marcar</p>
            <p className="rounded-lg bg-peligro-luz px-4 py-2 text-[0.9rem] text-peligro">{estado.mensaje}</p>
            <button type="button" onClick={reiniciar} className={clasesBoton("principal", "md")}>
              Volver a empezar
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
