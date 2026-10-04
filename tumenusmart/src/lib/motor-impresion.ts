"use client";

/**
 * El "motor" de la impresión automática de comandas. Corre en el navegador de la computadora de la caja (la que tiene QZ
 * Tray y las impresoras instaladas): cada pocos segundos le pregunta al servidor si hay comandas de las áreas que ESTA
 * estación tiene asignadas a una impresora, las imprime en texto crudo con QZ Tray y le cuenta cómo le fue. Si QZ no está
 * conectado no pregunta nada: así el mozo ve "nadie está imprimiendo" en vez de creer que sí.
 *
 * Vive en este módulo (y no dentro de una pantalla) a propósito: el layout del panel lo mantiene andando mientras el
 * operador usa cualquier otra sección —Punto de venta, Pedidos…—, y la pantalla "Impresión automática" solo muestra su
 * estado. Hay un único motor aunque lo usen las dos cosas a la vez (se cuenta cuántos lo están usando).
 */

import { useEffect, useSyncExternalStore } from "react";
import { conectarQz, imprimirTexto } from "./qz-tray";

type Trabajo = { id: string; titulo: string; contenido: string; impresora: string | null; /** 0 = no se imprime; 2 = sale dos veces. */ copias: number };
type RespuestaReclamar =
  | { ok: true; estacion: string; trabajos: Trabajo[]; sinImpresoras?: boolean }
  | { ok: false; motivo: string };

export type RegistroMotor = { hora: string; texto: string; salio: boolean };

export type EstadoMotor = {
  qz: "conectando" | "ok" | "error";
  fallo: string | null;
  registro: RegistroMotor[];
  impresas: number;
  /** Cuándo (reloj de este navegador) el servidor contestó por última vez a la consulta de comandas; null si todavía no. */
  ultimaConsultaEn: number | null;
  /** La comanda que se está mandando a la impresora ahora y desde cuándo: si pasa mucho rato, algo la trabó. */
  imprimiendoAhora: { titulo: string; desde: number } | null;
  /**
   * Para probar sin impresora: las comandas se marcan como impresas pero NO se mandan a ninguna impresora (ni hace falta QZ
   * Tray). Se guarda en este navegador, así que vale solo para esta computadora.
   */
  modoPrueba: boolean;
};

const CLAVE_MODO_PRUEBA = "impresion_modo_prueba";

function leerModoPrueba(): boolean {
  try {
    return localStorage.getItem(CLAVE_MODO_PRUEBA) === "1";
  } catch {
    return false;
  }
}

/** Prende o apaga el modo prueba en esta computadora. */
export function cambiarModoPrueba(activo: boolean) {
  try {
    if (activo) localStorage.setItem(CLAVE_MODO_PRUEBA, "1");
    else localStorage.removeItem(CLAVE_MODO_PRUEBA);
  } catch {
    // Sin almacenamiento del navegador solo vale hasta que se recargue la página.
  }
  cambiar({ modoPrueba: activo, qz: activo ? "ok" : "conectando" });
}

/** Cada cuántos milisegundos pregunta si hay comandas nuevas. */
const INTERVALO_MS = 4000;
const REGISTROS_VISIBLES = 12;

const ESTADO_INICIAL: EstadoMotor = {
  qz: "conectando",
  fallo: null,
  registro: [],
  impresas: 0,
  ultimaConsultaEn: null,
  imprimiendoAhora: null,
  modoPrueba: false,
};

let estado: EstadoMotor = ESTADO_INICIAL;
const oyentes = new Set<() => void>();

function cambiar(parche: Partial<EstadoMotor>) {
  estado = { ...estado, ...parche };
  oyentes.forEach((o) => o());
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

function horaAhora(): string {
  return new Date().toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function anotar(texto: string, salio: boolean) {
  cambiar({ registro: [{ hora: horaAhora(), texto, salio }, ...estado.registro].slice(0, REGISTROS_VISIBLES) });
}

async function marcar(id: string, salio: boolean, error?: string, omitido = false) {
  try {
    await conLimite(
      fetch("/admin/api/impresion/marcar", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ok: salio, error, omitido }),
      }),
      15_000
    );
  } catch {
    // Si no se pudo avisar, el servidor lo da por colgado a los 60 segundos y lo vuelve a poner en la fila.
  }
}

// ------------------------------------------------------------------------------------------------ el ciclo

let enCiclo = false;
/** Cuántos ciclos se iniciaron: un ciclo dado por perdido no puede liberar el "en curso" de uno más nuevo. */
let generacion = 0;
/** Última señal de vida del ciclo en curso (empezó, o terminó un paso). */
let ultimaActividad = Date.now();
/** Un ciclo sin señales de vida por tanto tiempo está colgado: se lo da por perdido y se empieza de nuevo. */
const MS_CICLO_COLGADO = 90_000;

/**
 * Espera a una promesa, pero no para siempre: si QZ Tray o la red se quedan colgados, el ciclo seguiría "en curso" para
 * siempre y no volvería a consultar ni a avisar que está vivo. Pasado el límite se la da por fallada (la promesa original
 * sigue su camino, pero su resultado ya no le importa a nadie).
 */
function conLimite<T>(promesa: Promise<T>, milisegundos: number): Promise<T> {
  promesa.catch(() => {});
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error("Se agotó el tiempo de espera.")), milisegundos);
  });
  return Promise.race([promesa, limite]).finally(() => {
    if (reloj) clearTimeout(reloj);
  });
}

async function ciclo() {
  // Si el anterior todavía no terminó (una impresión lenta), no se encima otro.
  if (enCiclo) return;
  enCiclo = true;
  const miGeneracion = ++generacion;
  ultimaActividad = Date.now();
  try {
    // Sin QZ no se puede imprimir: no se pregunta nada (así no se reclama lo que no se va a poder imprimir).
    if (estado.modoPrueba) {
      // En modo prueba no se usa QZ Tray: se sigue consultando comandas igual, para que el celular del mozo vea que hay
      // una caja "imprimiendo" y se pueda probar todo el recorrido sin impresora.
      if (estado.qz !== "ok") cambiar({ qz: "ok" });
    } else {
      try {
        await conLimite(conectarQz(), 10_000);
        if (estado.qz !== "ok") cambiar({ qz: "ok" });
      } catch {
        if (estado.qz !== "error") cambiar({ qz: "error" });
        return;
      }
    }

    const r = await conLimite(fetch("/admin/api/impresion/reclamar", { method: "POST", credentials: "include" }), 20_000);
    if (r.status === 401 || r.status === 403) {
      cambiar({ fallo: "Se cerró la sesión o no tenés permiso. Volvé a entrar al panel." });
      detenerReloj();
      return;
    }
    if (!r.ok) {
      cambiar({ fallo: "El servidor no respondió bien. Se vuelve a intentar solo." });
      return;
    }
    cambiar({ fallo: null, ultimaConsultaEn: Date.now() });
    // También acotada: si la conexión se corta a mitad de la respuesta, esta espera no termina nunca por sí sola.
    const datos = (await conLimite(r.json(), 15_000)) as RespuestaReclamar;
    if (!datos.ok) return;

    for (const t of datos.trabajos) {
      ultimaActividad = Date.now();
      if (!t.impresora) {
        await marcar(t.id, false, "Esta estación no tiene impresora asignada a esa área.");
        anotar(`${t.titulo}: sin impresora asignada`, false);
        continue;
      }
      // 0 copias es una decisión del local (esta estación no imprime esto): se cierra sin imprimir y queda a la vista como tal.
      if (t.copias === 0) {
        await marcar(t.id, true, undefined, true);
        anotar(`${t.titulo}: 0 copias en esta estación, no se imprime`, true);
        continue;
      }
      if (estado.modoPrueba) {
        // Se da por impresa sin mandarla a ninguna impresora: el texto se puede ver en la lista con "Ver comanda".
        await marcar(t.id, true);
        anotar(`${t.titulo}: modo prueba, NO se imprimió en papel`, true);
        continue;
      }
      cambiar({ imprimiendoAhora: { titulo: t.titulo, desde: Date.now() } });
      try {
        // Una tras otra (las copias): 60 s alcanzan para la espera en la fila de QZ más el límite de 25 s de cada impresión.
        for (let copia = 0; copia < Math.max(1, t.copias); copia++) {
          ultimaActividad = Date.now();
          await conLimite(imprimirTexto(t.impresora, t.contenido), 60_000);
        }
        await marcar(t.id, true);
        cambiar({ impresas: estado.impresas + 1 });
        anotar(`${t.titulo} → ${t.impresora}`, true);
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        await marcar(t.id, false, motivo);
        anotar(`${t.titulo}: no salió (${motivo})`, false);
      } finally {
        cambiar({ imprimiendoAhora: null });
      }
    }
  } catch {
    cambiar({ fallo: "Sin conexión con el servidor. Se vuelve a intentar solo." });
  } finally {
    // Si este ciclo ya se dio por perdido, el "en curso" es de otro más nuevo: no se toca.
    if (miGeneracion === generacion) enCiclo = false;
  }
}

let enLatido = false;

/**
 * Mientras hay una impresión en curso el ciclo no consulta (no se encima otro), pero la estación tiene que seguir avisando que
 * está viva: si no, el mozo ve "nadie está imprimiendo" por una sola impresión lenta. Esto solo renueva el latido.
 */
async function latir() {
  if (enLatido || estado.qz !== "ok") return;
  enLatido = true;
  try {
    await fetch("/admin/api/impresion/latido", { method: "POST", credentials: "include" });
  } catch {
    // Si falla, el próximo tic lo vuelve a intentar.
  }
  enLatido = false;
}

/** Lo que se hace en cada tic del reloj: consultar comandas, o solo latir si todavía hay una impresión en curso. */
function alTic() {
  if (enCiclo && Date.now() - ultimaActividad > MS_CICLO_COLGADO) {
    // Algo lo colgó (una respuesta que nunca termina, un navegador que frenó la pestaña): se empieza de nuevo en vez de
    // quedar "avisando que está vivo" sin imprimir nada.
    enCiclo = false;
    cambiar({ imprimiendoAhora: null });
    anotar("La consulta anterior se colgó: se vuelve a empezar.", false);
  }
  if (enCiclo) void latir();
  else void ciclo();
}

// ------------------------------------------------------------------------------------------------ el reloj

let detenerReloj: () => void = () => {};

/**
 * Llama a `alTic` cada pocos segundos. Los temporizadores de una pestaña que no se está viendo los frena el navegador
 * (después de unos minutos, a uno por minuto), y justo ahí es cuando el operador está en otra pestaña o ventana. Los de un
 * Web Worker no se frenan, así que el reloj vive en uno; si el navegador no deja crearlo, se usa un temporizador común.
 */
function crearReloj(aCadaTic: () => void): () => void {
  let comun: ReturnType<typeof setInterval> | undefined;
  let worker: Worker | null = null;
  let url: string | null = null;
  let ultimoTic = Date.now();

  const tic = () => {
    ultimoTic = Date.now();
    aCadaTic();
  };

  function usarTemporizadorComun() {
    if (!comun) comun = setInterval(tic, INTERVALO_MS);
  }

  try {
    url = URL.createObjectURL(new Blob([`setInterval(function(){postMessage(1)},${INTERVALO_MS})`], { type: "text/javascript" }));
    worker = new Worker(url);
    worker.onmessage = tic;
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      usarTemporizadorComun();
    };
  } catch {
    usarTemporizadorComun();
  }

  // Respaldo: si el reloj del Worker dejó de avisar sin dar error (no se lo ve, pero pasa), este temporizador común, que
  // solo actúa cuando pasó demasiado sin un tic, lo reemplaza.
  const respaldo = setInterval(() => {
    if (Date.now() - ultimoTic > INTERVALO_MS * 3) tic();
  }, INTERVALO_MS);

  return () => {
    worker?.terminate();
    worker = null;
    if (url) URL.revokeObjectURL(url);
    if (comun) clearInterval(comun);
    comun = undefined;
    clearInterval(respaldo);
  };
}

// ------------------------------------------------------------------------------------------ pantalla encendida

type Candado = { release: () => Promise<void>; addEventListener: (tipo: "release", f: () => void) => void };
let candado: Candado | null = null;
let pidiendoCandado = false;

/** Que la pantalla no se apague mientras imprime (donde el navegador lo permita). No es imprescindible. */
async function pedirPantalla() {
  if (candado || pidiendoCandado) return;
  pidiendoCandado = true;
  try {
    const nav = navigator as unknown as { wakeLock?: { request: (tipo: "screen") => Promise<Candado> } };
    if (nav.wakeLock) {
      const nuevo = await nav.wakeLock.request("screen");
      // El navegador lo suelta solo cuando la pestaña queda oculta: así se vuelve a pedir al volver.
      nuevo.addEventListener("release", () => {
        if (candado === nuevo) candado = null;
      });
      candado = nuevo;
    }
  } catch {
    // Sin permiso o sin soporte: sigue imprimiendo igual.
  }
  pidiendoCandado = false;
}

function soltarPantalla() {
  const actual = candado;
  candado = null;
  if (actual) void actual.release().catch(() => {});
}

// ---------------------------------------------------------------------------------------------- quién lo usa

let usuarios = 0;
let usuariosDePantalla = 0;
let andando = false;

function alVolverALaPestana() {
  if (document.visibilityState !== "visible") return;
  if (usuariosDePantalla > 0) void pedirPantalla();
  // Si el navegador tuvo frenada la pestaña, se consulta ya, sin esperar al próximo tic del reloj.
  alTic();
}

function sincronizar() {
  if (usuarios > 0 && !andando) {
    andando = true;
    // La preferencia de esta computadora (recién acá, ya en el navegador: en el servidor no hay localStorage).
    if (leerModoPrueba() !== estado.modoPrueba) cambiar({ modoPrueba: leerModoPrueba() });
    detenerReloj = crearReloj(alTic);
    document.addEventListener("visibilitychange", alVolverALaPestana);
    void ciclo();
  } else if (usuarios === 0 && andando) {
    andando = false;
    detenerReloj();
    document.removeEventListener("visibilitychange", alVolverALaPestana);
    soltarPantalla();
  }
  if (andando) {
    if (usuariosDePantalla > 0) void pedirPantalla();
    else soltarPantalla();
  }
}

/**
 * Pone a andar el motor mientras el componente que lo llama esté en pantalla, y devuelve su estado. `mantenerPantalla` es
 * para la pantalla "Impresión automática": en las demás secciones no se le impide a la computadora apagar la pantalla.
 */
export function useMotorImpresion(opciones: { mantenerPantalla?: boolean } = {}): EstadoMotor {
  const mantenerPantalla = opciones.mantenerPantalla === true;
  useEffect(() => {
    usuarios += 1;
    if (mantenerPantalla) usuariosDePantalla += 1;
    sincronizar();
    return () => {
      usuarios -= 1;
      if (mantenerPantalla) usuariosDePantalla -= 1;
      sincronizar();
    };
  }, [mantenerPantalla]);

  return useSyncExternalStore(
    suscribir,
    () => estado,
    () => ESTADO_INICIAL
  );
}
