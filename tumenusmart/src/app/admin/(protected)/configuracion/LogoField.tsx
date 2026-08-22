"use client";

import { useRef, useState } from "react";
import { subirFotoLogo } from "./actions";

export function LogoField({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    try {
      const formData = new FormData();
      formData.set("archivo", archivo);
      const { url: nuevaUrl } = await subirFotoLogo(formData);
      setUrl(nuevaUrl);
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
        Logo del negocio
      </label>

      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-full border border-neutral-300 bg-neutral-50">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Logo del negocio" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-neutral-400">Sin logo</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            {subiendo ? "Subiendo..." : url ? "Cambiar logo" : "Subir logo"}
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
              Quitar logo
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      <input type="hidden" name="logoUrl" value={url} />
    </div>
  );
}
