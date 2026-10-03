"use client";

import { useEffect, useRef, useState } from "react";
import { BotonEnlace, Pastilla, Tarjeta } from "@/components/ui";
import { conectarQz, imprimirTexto } from "@/lib/qz-tray";

type Trabajo = { id: string; titulo: string; contenido: string; impresora: string | null };
type RespuestaReclamar =
  | { ok: true; estacion: string; trabajos: Trabajo[]; sinImpresoras?: boolean }
  | { ok: false; motivo: string };

type Registro = { hora: string; texto: string; salio: boolean };

/** Cada cuántos milisegundos pregunta si hay comandas nuevas. */
const INTERVALO_MS = 4000;
const REGISTROS_VISIBLES = 12;

function horaAhora(): string {
  return new Date().toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/**
 * El "motor" de la impresión automática: corre en la computadora de la caja (la que tiene QZ Tray y las impresoras
 * instaladas) y tiene que quedar abierto durante el servicio. Cada pocos segundos le pregunta al servidor si hay comandas
 * de las áreas que ESTA estación tiene asignadas a una impresora, las imprime en texto crudo con QZ Tray y le cuenta cómo
 * le fue. Si QZ no está conectado no pregunta nada: así el mozo ve "nadie está imprimiendo" en vez de creer que sí.
 */
export function AgenteImpresion({
  estacion,
  asignaciones,
}: {
  estacion: string | null;
  asignaciones: { area: string; impresora: string }[];
}) {
  const [qz, setQz] = useState<"conectando" | "ok" | "error">("conectando");
  const [fallo, setFallo] = useState<string | null>(null);
  const [registro, setRegistro] = useState<Registro[]>([]);
  const [impresas, setImpresas] = useState(0);
  const funcionando = useRef(true);

  useEffect(() => {
    funcionando.current = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let pantalla: { release: () => Promise<void> } | null = null;

    function anotar(texto: string, salio: boolean) {
      setRegistro((actual) => [{ hora: horaAhora(), texto, salio }, ...actual].slice(0, REGISTROS_VISIBLES));
    }

    async function marcar(id: string, salio: boolean, error?: string) {
      try {
        await fetch("/admin/api/impresion/marcar", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ok: salio, error }),
        });
      } catch {
        // Si no se pudo avisar, el servidor lo da por colgado a los 60 segundos y lo vuelve a poner en la fila.
      }
    }

    async function ciclo() {
      try {
        // Sin QZ no se puede imprimir: no se pregunta nada (así no se reclama lo que no se va a poder imprimir).
        try {
          await conectarQz();
          setQz("ok");
        } catch {
          setQz("error");
          return;
        }

        const r = await fetch("/admin/api/impresion/reclamar", { method: "POST", credentials: "include" });
        if (r.status === 401 || r.status === 403) {
          setFallo("Se cerró la sesión o no tenés permiso. Volvé a entrar al panel.");
          funcionando.current = false;
          return;
        }
        if (!r.ok) {
          setFallo("El servidor no respondió bien. Se vuelve a intentar solo.");
          return;
        }
        setFallo(null);
        const datos = (await r.json()) as RespuestaReclamar;
        if (!datos.ok) return;

        for (const t of datos.trabajos) {
          if (!t.impresora) {
            await marcar(t.id, false, "Esta estación no tiene impresora asignada a esa área.");
            anotar(`${t.titulo}: sin impresora asignada`, false);
            continue;
          }
          try {
            await imprimirTexto(t.impresora, t.contenido);
            await marcar(t.id, true);
            setImpresas((n) => n + 1);
            anotar(`${t.titulo} → ${t.impresora}`, true);
          } catch (e) {
            await marcar(t.id, false, e instanceof Error ? e.message : String(e));
            anotar(`${t.titulo}: no salió (${e instanceof Error ? e.message : String(e)})`, false);
          }
        }
      } catch {
        setFallo("Sin conexión con el servidor. Se vuelve a intentar solo.");
      } finally {
        if (funcionando.current) temporizador = setTimeout(ciclo, INTERVALO_MS);
      }
    }

    // Que la pantalla no se apague mientras está imprimiendo (donde el navegador lo permita).
    async function mantenerPantalla() {
      try {
        const nav = navigator as unknown as {
          wakeLock?: { request: (tipo: "screen") => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock) pantalla = await nav.wakeLock.request("screen");
      } catch {
        // No es imprescindible.
      }
    }
    void mantenerPantalla();

    void ciclo();
    return () => {
      funcionando.current = false;
      if (temporizador) clearTimeout(temporizador);
      void pantalla?.release();
    };
  }, []);

  const sinEstacion = estacion === null;
  const sinImpresoras = asignaciones.length === 0;
  const todoListo = qz === "ok" && !sinEstacion && !sinImpresoras && !fallo;

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className={`flex flex-col gap-3 !border-2 ${todoListo ? "!border-exito/60" : "!border-amarillo"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[1.05rem] font-semibold tracking-titular text-tinta">
            {todoListo ? "Imprimiendo las comandas" : "Falta algo para imprimir"}
          </h2>
          <Pastilla color={todoListo ? "exito" : "amarillo"} punto>
            {todoListo ? "Activo" : "No está imprimiendo"}
          </Pastilla>
        </div>

        <ul className="flex flex-col gap-1.5 text-[0.88rem]">
          <li className="flex items-center gap-2">
            <span aria-hidden="true">{qz === "ok" ? "✅" : qz === "conectando" ? "⏳" : "❌"}</span>
            <span className="text-tinta">
              {qz === "ok"
                ? "QZ Tray conectado"
                : qz === "conectando"
                  ? "Conectando con QZ Tray…"
                  : "No se conecta con QZ Tray: abrilo en esta computadora."}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true">{sinEstacion ? "❌" : "✅"}</span>
            <span className="text-tinta">
              {sinEstacion
                ? "Esta computadora no está vinculada a una estación."
                : `Estación vinculada: ${estacion}`}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true">{sinImpresoras ? "❌" : "✅"}</span>
            <span className="text-tinta">
              {sinImpresoras
                ? "Esta estación no tiene impresoras asignadas a ninguna área: no va a imprimir nada."
                : `${asignaciones.length} ${asignaciones.length === 1 ? "área con impresora" : "áreas con impresora"}`}
            </span>
          </li>
        </ul>

        {(sinEstacion || sinImpresoras) && (
          <div>
            <BotonEnlace href="/admin/pos/estaciones" tono="navegar" tam="md">
              Ir a Estaciones
            </BotonEnlace>
          </div>
        )}
        {fallo && <p className="text-[0.84rem] font-medium text-peligro">{fallo}</p>}

        {asignaciones.length > 0 && (
          <div className="border-t border-linea pt-2.5">
            <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Qué sale en cada impresora
            </p>
            <ul className="flex flex-col gap-0.5 text-[0.84rem] text-tinta-media">
              {asignaciones.map((a) => (
                <li key={a.area}>
                  <strong className="font-semibold text-tinta">{a.area}</strong> → {a.impresora}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Tarjeta>

      <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.8rem] leading-snug text-tinta-media">
        Dejá esta pantalla <strong>abierta y a la vista</strong> durante el servicio: si la minimizás o cambiás de pestaña, el
        navegador la puede frenar y las comandas demoran. Hoy imprimió <strong>{impresas}</strong>{" "}
        {impresas === 1 ? "comanda" : "comandas"} desde que se abrió.
      </p>

      {registro.length > 0 && (
        <section className="rounded-xl border border-linea bg-superficie p-3.5">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Últimos movimientos</p>
          <ul className="flex flex-col gap-1">
            {registro.map((r, i) => (
              <li key={`${r.hora}-${i}`} className={`text-[0.82rem] ${r.salio ? "text-tinta" : "text-peligro"}`}>
                <span className="cifra mr-2 text-tinta-suave">{r.hora}</span>
                {r.salio ? "🖨 " : "⚠ "}
                {r.texto}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
