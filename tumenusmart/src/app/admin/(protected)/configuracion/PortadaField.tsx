"use client";

import { useRef, useState } from "react";
import { subirFotoPortada, quitarPortadaStore } from "./actions";
import { comprimirImagen, pesoLegible, PARA_PORTADA } from "@/lib/comprimir-imagen";

/**
 * La foto de fondo de la cabecera del menú público, opcional.
 *
 * Mismo mecanismo que el logo (comprimir en el celular, subir de una, sin
 * esperar al botón "Guardar" del formulario grande) — pero con vista previa
 * ancha en vez de circular, porque así se va a ver: de borde a borde arriba
 * del logo y el nombre.
 */
export function PortadaField({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [ahorro, setAhorro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    setGuardado(false);
    setAhorro(null);
    try {
      const resultado = await comprimirImagen(archivo, PARA_PORTADA);
      if (resultado.bytesDespues < resultado.bytesAntes) {
        setAhorro(
          `${pesoLegible(resultado.bytesAntes)} → ${pesoLegible(resultado.bytesDespues)}`
        );
      }

      const formData = new FormData();
      formData.set("archivo", resultado.archivo);
      const { url: nuevaUrl } = await subirFotoPortada(formData);
      setUrl(nuevaUrl);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function quitar() {
    setUrl("");
    setError(null);
    try {
      await quitarPortadaStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar la portada");
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[0.82rem] font-semibold text-tinta">
        Foto de portada (opcional)
      </label>
      <p className="mb-2 text-[0.78rem] text-tinta-suave">
        Se muestra de fondo, ancha, arriba del logo en tu carta pública. Sin ella, la
        cabecera queda como está ahora — no hace falta subir nada. Tamaño recomendado:{" "}
        <span className="font-medium text-tinta-media">1200 × 450 px</span> — si le vas a
        pedir una foto a un diseñador, pedísela con esa medida.
      </p>

      <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-xl border border-linea bg-papel-suave">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Portada del negocio" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-tinta-suave">Sin foto de portada</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta-media hover:bg-papel-suave">
          {subiendo ? "Subiendo..." : url ? "Cambiar portada" : "Subir portada"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleArchivo}
            disabled={subiendo}
            className="hidden"
          />
        </label>
        {url && (
          <button
            type="button"
            onClick={quitar}
            className="text-left text-xs text-peligro hover:underline"
          >
            Quitar portada
          </button>
        )}
      </div>

      {guardado && (
        <p className="mt-1.5 text-[0.78rem] text-exito">
          Portada guardada
          {ahorro ? ` — optimizada: ${ahorro}` : ""}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
    </div>
  );
}
