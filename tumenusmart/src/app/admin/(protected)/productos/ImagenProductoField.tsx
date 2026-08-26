"use client";

import { useRef, useState } from "react";
import { subirFotoProducto } from "./actions";
import { comprimirImagen, pesoLegible, PARA_PRODUCTO } from "@/lib/comprimir-imagen";

export function ImagenProductoField({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ahorro, setAhorro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);
    setAhorro(null);
    setSubiendo(true);
    try {
      // Se achica ANTES de subir: le ahorra datos móviles a quien la carga y
      // deja guardado un archivo liviano para siempre. En la carta la foto se
      // muestra a 96 píxeles, así que subir el original de la cámara es
      // descargar varios megas para pintar una miniatura.
      const resultado = await comprimirImagen(archivo, PARA_PRODUCTO);

      const formData = new FormData();
      formData.set("archivo", resultado.archivo);
      const { url: nuevaUrl } = await subirFotoProducto(formData);
      setUrl(nuevaUrl);

      if (resultado.comprimida) {
        setAhorro(
          `${pesoLegible(resultado.bytesAntes)} → ${pesoLegible(resultado.bytesDespues)}`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        Foto del producto
      </label>

      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-lg border border-neutral-300 bg-neutral-50">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Foto del producto" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-neutral-400">Sin foto</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            {subiendo ? "Subiendo..." : url ? "Cambiar foto" : "Subir foto"}
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
              onClick={() => setUrl("")}
              className="text-left text-xs text-red-500 hover:underline"
            >
              Quitar foto
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {ahorro && !error && (
        <p className="mt-1 text-xs text-green-700">
          Foto optimizada: {ahorro}. Se ve igual y tu carta carga mucho más rápido.
        </p>
      )}

      <input type="hidden" name="imagenUrl" value={url} />
    </div>
  );
}
