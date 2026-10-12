"use client";

import { useRef, useState } from "react";
import { subirFotoLogo, quitarLogoStore } from "./actions";
import { comprimirImagen, pesoLegible, PARA_LOGO } from "@/lib/comprimir-imagen";
import { clasesBoton } from "@/components/ui";

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
      const subida = await subirFotoLogo(formData);
      if (!subida.ok) {
        setError(subida.error);
        return;
      }
      setUrl(subida.url);
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
        Es el cuadrito que se ve arriba de tu carta, sobre la portada, y en el encabezado de tus reportes.
      </p>

      <div className="flex items-center gap-3">
        {/* Cuadrado con las esquinas redondeadas: así se ve en la carta. */}
        <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-2xl border border-linea bg-papel-suave">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Logo del negocio" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-tinta-suave">Sin logo</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className={`${clasesBoton(url ? "navegar" : "nuevo", "md")} cursor-pointer ${subiendo ? "pointer-events-none opacity-45" : ""}`}>
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
            <button type="button" onClick={quitar} className={clasesBoton("peligro", "md")}>
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

      {/* El pie: el tamaño con el que mejor se ve (el mismo estilo que el de la portada). */}
      <div className="mt-3 rounded-lg bg-azul-luz px-3 py-2.5 text-[0.78rem] leading-snug text-azul-oscuro">
        <p className="font-semibold">Tamaño recomendado: 500 × 500 píxeles (cuadrado)</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Formato cuadrado, en JPG, PNG o WEBP. Se ve chico (unos 96 píxeles), así que conviene un dibujo simple y con letras grandes.</li>
          <li>Dejá un poco de aire en los bordes: las esquinas se redondean. Si el fondo es transparente, se rellena de blanco.</li>
          <li>Se achica y se optimiza sola antes de subirse; podés mandar la foto tal como salió de la cámara.</li>
        </ul>
      </div>
    </div>
  );
}
