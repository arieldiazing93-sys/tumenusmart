"use client";

import { useEffect, useRef, useState } from "react";
import type { PasoSeguimiento } from "@/lib/seguimiento-pedido";

// Colores de cada paso cumplido: violeta para "salió del local" y verde para
// "entregado" son los mismos tokens que ya tienen ese significado en el resto
// del sistema (nunca decoración suelta). El resto usa el naranja de siempre.
function colorDelPaso(estado: string): string {
  if (estado === "entregado") return "bg-exito text-white";
  if (estado === "en_despacho") return "bg-violeta text-white";
  return "bg-brand text-white";
}

const CONFETI = [
  { left: 6, color: "bg-brand", delay: 0 },
  { left: 16, color: "bg-exito", delay: 0.05 },
  { left: 26, color: "bg-violeta", delay: 0.1 },
  { left: 36, color: "bg-azul", delay: 0.02 },
  { left: 46, color: "bg-brand", delay: 0.15 },
  { left: 56, color: "bg-exito", delay: 0.08 },
  { left: 66, color: "bg-violeta", delay: 0.12 },
  { left: 76, color: "bg-azul", delay: 0.03 },
  { left: 86, color: "bg-brand", delay: 0.18 },
  { left: 94, color: "bg-exito", delay: 0.06 },
];

/**
 * El seguimiento de 5 pasos del pedido.
 *
 * Es un componente cliente aparte porque necesita comparar el paso anterior
 * contra el que llega en cada refresco automático (cada 25s) para saber si
 * ALGO recién cambió — mismo truco que usa CartBar con el total: guardar el
 * valor previo en un ref y animar solo cuando de verdad se movió, no en cada
 * repintado.
 */
export function SeguimientoTracker({
  pasos,
  actual,
  finalizado,
}: {
  pasos: PasoSeguimiento[];
  actual: number;
  finalizado: boolean;
}) {
  const [pasoRecienCumplido, setPasoRecienCumplido] = useState<number | null>(null);
  const [celebrando, setCelebrando] = useState(false);
  const actualAnterior = useRef(actual);
  const finalizadoAnterior = useRef(finalizado);

  useEffect(() => {
    if (actual !== actualAnterior.current) {
      actualAnterior.current = actual;
      setPasoRecienCumplido(actual);
      const t = window.setTimeout(() => setPasoRecienCumplido(null), 420);
      return () => window.clearTimeout(t);
    }
  }, [actual]);

  useEffect(() => {
    if (finalizado && !finalizadoAnterior.current) {
      finalizadoAnterior.current = finalizado;
      setCelebrando(true);
      const t = window.setTimeout(() => setCelebrando(false), 1400);
      return () => window.clearTimeout(t);
    }
    finalizadoAnterior.current = finalizado;
  }, [finalizado]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-linea bg-white p-5">
      {celebrando && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-20 overflow-hidden"
        >
          {CONFETI.map((c, i) => (
            <span
              key={i}
              className={`absolute top-0 h-2 w-2 rounded-sm ${c.color} animate-[confetiCae_1.1s_ease-out_both]`}
              style={{ left: `${c.left}%`, animationDelay: `${c.delay}s` }}
            />
          ))}
        </div>
      )}

      <p className="mb-4 text-[0.85rem] font-semibold text-tinta-media">Estado de tu pedido</p>
      <ol className="flex flex-col gap-1">
        {pasos.map((paso, i) => {
          const cumplido = actual >= 0 && i <= actual;
          const esActual = i === actual;
          return (
            <li key={paso.estado} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm transition-colors duration-300 ${
                    cumplido ? colorDelPaso(paso.estado) : "bg-papel-hundido text-tinta-suave"
                  } ${pasoRecienCumplido === i ? "animate-[entradaExito_0.4s_ease]" : ""}`}
                >
                  {cumplido ? paso.emoji : "•"}
                </div>
                {i < pasos.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 transition-colors duration-300 ${
                      actual > i ? "bg-brand" : "bg-linea"
                    }`}
                    style={{ minHeight: "18px" }}
                  />
                )}
              </div>
              <div className={`pb-4 ${i === pasos.length - 1 ? "pb-0" : ""}`}>
                <p
                  className={`text-[0.88rem] font-medium ${
                    esActual ? "text-brand-texto" : cumplido ? "text-tinta" : "text-tinta-suave"
                  }`}
                >
                  {paso.titulo}
                  {esActual && " ←"}
                </p>
                {esActual && <p className="text-[0.78rem] text-tinta-suave">{paso.detalle}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {!finalizado && (
        <p className="mt-3 border-t border-linea-fina pt-3 text-center text-[0.74rem] text-tinta-suave">
          Esta pantalla se actualiza sola — podés dejarla abierta.
        </p>
      )}
    </div>
  );
}
