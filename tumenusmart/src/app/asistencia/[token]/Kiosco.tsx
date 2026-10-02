"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarPersonal } from "@/app/admin/(protected)/agenda/AvatarPersonal";
import { VerificadorPersona, type ResultadoVerificacion } from "@/components/VerificadorPersona";
import { clasesBoton } from "@/components/ui";
import { ETIQUETA_TIPO, type MarcaReciente, type TipoMarcacion } from "@/lib/asistencia";
import { registrarMarcacion, verificarPin, type ResultadoMarcacion } from "./actions";

/** Cuántos gestos se le piden a quien marca para comprobar que es una persona de verdad. */
const GESTOS_POR_MARCACION = 2;

export type ColaboradorKiosco = {
  id: string;
  nombre: string;
  apellido: string | null;
  cargo: string | null;
  fotoUrl: string | null;
};

type Exito = Extract<ResultadoMarcacion, { ok: true }>;

type Paso =
  | { paso: "elegir" }
  | { paso: "pin"; id: string }
  | { paso: "tipo"; id: string; pin: string; nombre: string; permitidas: TipoMarcacion[]; recientes: MarcaReciente[] }
  | { paso: "camara"; id: string; pin: string; nombre: string; tipo: TipoMarcacion }
  | { paso: "guardando"; nombre: string; tipo: TipoMarcacion }
  | { paso: "listo"; resultado: Exito }
  | { paso: "error"; mensaje: string };

/** Cuánto se espera sin que nadie toque nada antes de volver a la lista (para no dejar un PIN a medio escribir a la vista). */
const INACTIVIDAD_MS: Partial<Record<Paso["paso"], number>> = {
  pin: 60_000,
  tipo: 60_000,
  camara: 90_000,
  error: 15_000,
  listo: 6_000,
};

const TONO_TIPO: Record<TipoMarcacion, "exito" | "suave" | "navegar" | "peligro"> = {
  entrada: "exito",
  salida_almuerzo: "suave",
  vuelta_almuerzo: "navegar",
  salida: "peligro",
};

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function nombreCompleto(c: { nombre: string; apellido: string | null }): string {
  return [c.nombre, c.apellido].filter(Boolean).join(" ");
}

function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * El celular fijo del Registro de asistencia, en la pared del local: la persona toca su nombre, pone su PIN,
 * elige qué marca (entrada, salida a almorzar, vuelta, salida), mira a la cámara y hace uno o dos gestos al
 * azar. La foto queda guardada con la marcación. Sin usuario ni contraseña: la llave está en la dirección.
 */
export function Kiosco({
  token,
  nombreNegocio,
  colaboradores,
}: {
  token: string;
  nombreNegocio: string;
  colaboradores: ColaboradorKiosco[];
}) {
  const [estado, setEstado] = useState<Paso>({ paso: "elegir" });
  const [pin, setPin] = useState("");
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [reloj, setReloj] = useState("");

  const reiniciar = useCallback(() => {
    setEstado({ paso: "elegir" });
    setPin("");
    setErrorPin(null);
    setVerificando(false);
    setBusqueda("");
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
        const wakeLock = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } })
          .wakeLock;
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

  // Si nadie toca nada, vuelve a la lista.
  useEffect(() => {
    const ms = INACTIVIDAD_MS[estado.paso];
    if (!ms) return;
    const id = setTimeout(reiniciar, ms);
    return () => clearTimeout(id);
  }, [estado, pin, reiniciar]);

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return colaboradores;
    return colaboradores.filter((c) => sinTildes(nombreCompleto(c)).includes(q));
  }, [colaboradores, busqueda]);

  function elegir(id: string) {
    setPin("");
    setErrorPin(null);
    setEstado({ paso: "pin", id });
  }

  function tocarTecla(digito: string) {
    if (verificando) return;
    setErrorPin(null);
    setPin((p) => (p.length >= 6 ? p : p + digito));
  }

  async function enviarPin() {
    if (estado.paso !== "pin" || pin.length < 4 || verificando) return;
    setVerificando(true);
    setErrorPin(null);
    try {
      const r = await verificarPin(token, estado.id, pin);
      if (!r.ok) {
        setErrorPin(r.error);
        setPin("");
        return;
      }
      setEstado({ paso: "tipo", id: estado.id, pin, nombre: r.nombre, permitidas: r.permitidas, recientes: r.recientes });
    } catch {
      setErrorPin("No se pudo conectar. Revisá el internet y probá de nuevo.");
    } finally {
      setVerificando(false);
    }
  }

  async function alVerificar(r: ResultadoVerificacion) {
    if (estado.paso !== "camara") return;
    const { id, pin: pinElegido, nombre, tipo } = estado;
    setEstado({ paso: "guardando", nombre, tipo });

    const datos = new FormData();
    datos.set("token", token);
    datos.set("colaboradorId", id);
    datos.set("pin", pinElegido);
    datos.set("tipo", tipo);
    datos.set("gestos", JSON.stringify(r.gestos));
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
        {/* ---------- 1. ¿Quién sos? ---------- */}
        {estado.paso === "elegir" && (
          <>
            <h1 className="text-center text-[1.25rem] font-semibold tracking-titular text-tinta">¿Quién sos?</h1>
            {colaboradores.length === 0 ? (
              <p className="rounded-xl border border-dashed border-linea bg-papel-suave px-4 py-10 text-center text-[0.9rem] text-tinta-media">
                Todavía no hay personas cargadas. El dueño las agrega desde el panel, en Registro de asistencia →
                Colaboradores.
              </p>
            ) : (
              <>
                {colaboradores.length > 9 && (
                  <input
                    type="search"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar tu nombre"
                    aria-label="Buscar tu nombre"
                    className="h-12 w-full rounded-xl border border-linea bg-superficie px-4 text-[1rem] text-tinta outline-none focus:border-azul"
                  />
                )}
                <ul className="grid grid-cols-2 gap-3">
                  {visibles.map((c, i) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => elegir(c.id)}
                        className="flex h-full w-full flex-col items-center gap-2 rounded-2xl border-2 border-azul/50 bg-superficie p-3 text-center transition-colors active:bg-azul-luz"
                      >
                        <AvatarPersonal
                          nombre={nombreCompleto(c)}
                          fotoUrl={c.fotoUrl}
                          indice={i}
                          className="h-20 w-20 text-[1.4rem]"
                        />
                        <span className="text-[0.95rem] font-semibold leading-tight text-tinta">{nombreCompleto(c)}</span>
                        {c.cargo && <span className="text-[0.76rem] text-tinta-suave">{c.cargo}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
                {visibles.length === 0 && (
                  <p className="text-center text-[0.9rem] text-tinta-media">Nadie coincide con esa búsqueda.</p>
                )}
              </>
            )}
          </>
        )}

        {/* ---------- 2. El PIN ---------- */}
        {estado.paso === "pin" &&
          (() => {
            const persona = colaboradores.find((c) => c.id === estado.id);
            return (
              <>
                <div className="flex flex-col items-center gap-2">
                  <AvatarPersonal
                    nombre={persona ? nombreCompleto(persona) : "?"}
                    fotoUrl={persona?.fotoUrl}
                    className="h-20 w-20 text-[1.4rem]"
                  />
                  <p className="text-[1.15rem] font-semibold text-tinta">{persona ? nombreCompleto(persona) : ""}</p>
                  <p className="text-[0.88rem] text-tinta-media">Poné tu PIN</p>
                </div>

                <div className="flex justify-center gap-2.5" aria-label={`${pin.length} números puestos`}>
                  {Array.from({ length: 6 }, (_, n) => (
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
                  Volver
                </button>
              </>
            );
          })()}

        {/* ---------- 3. ¿Qué marcás? ---------- */}
        {estado.paso === "tipo" && (
          <>
            <div className="text-center">
              <p className="text-[1.25rem] font-semibold tracking-titular text-tinta">Hola, {estado.nombre}</p>
              <p className="mt-0.5 text-[0.88rem] text-tinta-media">¿Qué querés marcar?</p>
            </div>

            <div className="flex flex-col gap-3">
              {estado.permitidas.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEstado({ paso: "camara", id: estado.id, pin: estado.pin, nombre: estado.nombre, tipo: t })}
                  className={`${clasesBoton(TONO_TIPO[t], "md")} w-full justify-center`}
                  style={{ minHeight: "4rem", fontSize: "1.15rem" }}
                >
                  {ETIQUETA_TIPO[t]}
                </button>
              ))}
            </div>

            {estado.recientes.length > 0 && (
              <div className="rounded-xl border border-linea bg-superficie p-3">
                <p className="mb-1.5 text-[0.76rem] font-semibold uppercase tracking-wide text-tinta-suave">
                  Lo que marcaste en este turno
                </p>
                <ul className="flex flex-col gap-1 text-[0.9rem] text-tinta">
                  {estado.recientes.map((r, n) => (
                    <li key={`${r.tipo}-${n}`} className="flex justify-between gap-3">
                      <span>{ETIQUETA_TIPO[r.tipo]}</span>
                      <span className="cifra font-semibold">{r.hora}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button type="button" onClick={reiniciar} className={`${clasesBoton("peligro", "md")} self-center`}>
              Cancelar
            </button>
          </>
        )}

        {/* ---------- 4. La cámara ---------- */}
        {estado.paso === "camara" && (
          <>
            <p className="text-center text-[1.05rem] font-semibold text-tinta">
              {estado.nombre}: {ETIQUETA_TIPO[estado.tipo].toLowerCase()}
            </p>
            <VerificadorPersona gestos={GESTOS_POR_MARCACION} onResultado={alVerificar} onCancelar={reiniciar} />
          </>
        )}

        {estado.paso === "guardando" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-linea border-t-azul" aria-hidden="true" />
            <p className="text-[1.05rem] font-semibold text-tinta">Guardando tu marcación…</p>
          </div>
        )}

        {/* ---------- 5. Listo ---------- */}
        {estado.paso === "listo" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            <span className="flex h-24 w-24 items-center justify-center rounded-full bg-exito text-[3rem] text-white" aria-hidden="true">
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
                Se marcó sin la prueba de persona real: el dueño va a revisar tu foto.
              </p>
            )}
            <button type="button" onClick={reiniciar} className={clasesBoton("principal", "md")}>
              Listo
            </button>
          </div>
        )}

        {estado.paso === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-peligro text-[2.5rem] text-white" aria-hidden="true">
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
