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
      const subida = await subirFotoProducto(formData);
      if (!subida.ok) {
        setError(subida.error);
        return;
      }
      setUrl(subida.url);

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
      <label className="mb-1 block text-sm font-medium text-tinta-media">
        Foto del producto
      </label>

      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-lg border border-linea bg-papel-suave">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Foto del producto" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-tinta-suave">Sin foto</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="cursor-pointer rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta-media hover:bg-papel-suave">
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
              className="text-left text-xs text-peligro hover:underline"
            >
              Quitar foto
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      {ahorro && !error && (
        <p className="mt-1 text-xs text-exito">
          Foto optimizada: {ahorro}. Se ve igual y tu carta carga mucho más rápido.
        </p>
      )}

      <input type="hidden" name="imagenUrl" value={url} />
    </div>
  );
}
