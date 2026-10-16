"use client";

import { useRef, useState } from "react";
import { Aviso, Entrada, clasesBoton } from "@/components/ui";
import { analizarRafaga, type AnalisisDeRafaga } from "@/lib/lector-codigo";
import { barrasDeCodigo, esGs1Valido } from "@/lib/codigo-barras";

/**
 * «Probar lector»: un cuadro para comprobar que el lector de códigos de barras anda y está bien configurado, ANTES de cargar productos. Se
 * escanea cualquier cosa (o la etiqueta de prueba) y dice qué llegó, qué tan rápido y cómo terminó. No guarda nada.
 */
export function ProbarLector() {
  const teclas = useRef<{ clave: string; t: number }[]>([]);
  const [analisis, setAnalisis] = useState<AnalisisDeRafaga | null>(null);
  const [texto, setTexto] = useState("");

  const barras = analisis && analisis.veredicto === "lector" ? barrasDeCodigo(analisis.texto) : null;
  const esNumerico = !!analisis && /^\d+$/.test(analisis.texto);

  return (
    <Aviso titulo="Probar el lector" color="azul">
      <p>
        Hacé clic en el campo y escaneá cualquier producto o la etiqueta de prueba. Acá no se guarda nada: solo se ve qué entregó el lector.
      </p>
      <div className="campos-grises mt-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[14rem] flex-1">
          <Entrada
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              const ahora = performance.now();
              const ultima = teclas.current[teclas.current.length - 1];
              // Una lectura nueva: si pasó más de un segundo desde la última tecla, se empieza de cero.
              if (ultima && ahora - ultima.t > 1000) teclas.current = [];
              teclas.current.push({ clave: e.key, t: ahora });
              if (e.key === "Enter") {
                e.preventDefault();
                setAnalisis(analizarRafaga(teclas.current));
                teclas.current = [];
                setTexto("");
              }
            }}
            autoComplete="off"
            placeholder="Escaneá acá…"
            aria-label="Probar el lector de códigos de barras"
          />
        </div>
        <a href="/admin/codigos-barras/etiquetas?prueba=1" className={clasesBoton("navegar", "md")}>
          🏷 Etiqueta de prueba
        </a>
      </div>

      {analisis && (
        <div
          role="status"
          className={`mt-3 rounded-lg border p-3 text-[0.85rem] ${
            analisis.veredicto === "lector" ? "border-exito/30 bg-exito-luz text-tinta" : "border-aviso/30 bg-aviso-luz text-tinta"
          }`}
        >
          <p className="font-semibold">{analisis.veredicto === "lector" ? "✓ El lector anda bien" : "⚠ Revisá esto"}</p>
          <p className="mt-0.5">{analisis.mensaje}</p>
          {analisis.texto && (
            <p className="mt-1.5">
              Llegó: <strong className="cifra text-[0.95rem]">{analisis.texto}</strong>
              {esNumerico && [8, 12, 13].includes(analisis.largo) && (
                <span className={esGs1Valido(analisis.texto) ? "text-exito" : "text-peligro"}>
                  {esGs1Valido(analisis.texto)
                    ? " · dígito verificador correcto"
                    : " · el dígito verificador NO coincide (el lector puede estar salteando números o es otro tipo de código)"}
                </span>
              )}
              {analisis.veredicto === "lector" && !barras && " · no es un EAN/UPC: se escanea, pero no se imprime en etiquetas."}
            </p>
          )}
        </div>
      )}
    </Aviso>
  );
}
