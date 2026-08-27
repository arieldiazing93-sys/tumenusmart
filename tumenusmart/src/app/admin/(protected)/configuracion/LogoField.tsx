"use client";

import { useRef, useState } from "react";
import { subirFotoLogo, quitarLogoStore } from "./actions";
import { comprimirImagen, pesoLegible, PARA_LOGO } from "@/lib/comprimir-imagen";

export function LogoField({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  // Cuánto se achicó la imagen. El logo YA se comprimía, pero en silencio: sin
  // decirlo, el dueño no tiene forma de saber que pasó y sospecha que subió el
  // archivo pesado tal cual.
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
      // El logo se muestra chico en la carta y en los tickets: no hace falta
      // guardar el original.
      const resultado = await comprimirImagen(archivo, PARA_LOGO);
      if (resultado.bytesDespues < resultado.bytesAntes) {
        setAhorro(
          `${pesoLegible(resultado.bytesAntes)} → ${pesoLegible(resultado.bytesDespues)}`
        );
      }

      const formData = new FormData();
      formData.set("archivo", resultado.archivo);
      const { url: nuevaUrl } = await subirFotoLogo(formData);
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
      await quitarLogoStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el logo");
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[0.82rem] font-semibold text-tinta">
        Logo del negocio
      </label>
      <p className="mb-2 text-[0.78rem] text-tinta-suave">
        Se achica y se optimiza solo en tu celular antes de subirse. Podés mandar la foto
        tal como salió de la cámara.
      </p>

      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-full border border-linea bg-papel-suave">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Logo del negocio" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-tinta-suave">Sin logo</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="cursor-pointer rounded-lg border border-linea px-3 py-1.5 text-sm font-medium text-tinta-media hover:bg-papel-suave">
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
              onClick={quitar}
              className="text-left text-xs text-peligro hover:underline"
            >
              Quitar logo
            </button>
          )}
        </div>
      </div>

      {guardado && (
        <p className="mt-1.5 text-[0.78rem] text-exito">
          Logo guardado
          {ahorro ? ` — optimizado: ${ahorro}` : ""}
        </p>
      )}
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}

      <input type="hidden" name="logoUrl" value={url} />
    </div>
  );
}
