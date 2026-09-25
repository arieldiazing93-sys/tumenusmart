"use client";

import { useRef, useState } from "react";
import { MensajeError, clasesBoton } from "@/components/ui";
import { comprimirImagen, PARA_LOGO, type OpcionesCompresion } from "@/lib/comprimir-imagen";
import { subirImagenPagina } from "./actions";

/** Cuánto se achica cada imagen en el celular antes de subirla. */
export const PARA_PERFIL: OpcionesCompresion = PARA_LOGO;
export const PARA_BANNER: OpcionesCompresion = { ladoMaximo: 1200, calidad: 0.8 };
export const PARA_GALERIA: OpcionesCompresion = { ladoMaximo: 1000, calidad: 0.8 };

/**
 * Un botón "Subir foto": abre el selector de archivos, achica la imagen, la
 * sube y avisa la dirección resultante. No guarda nada en la página: eso lo hace
 * el editor al apretar "Guardar cambios".
 */
export function BotonSubirImagen({
  texto,
  opciones,
  onSubida,
  deshabilitado = false,
}: {
  texto: string;
  opciones: OpcionesCompresion;
  onSubida: (url: string) => void;
  deshabilitado?: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    setError(null);
    setSubiendo(true);
    try {
      const { archivo } = await comprimirImagen(elegido, opciones);
      const datos = new FormData();
      datos.set("archivo", archivo);
      const resultado = await subirImagenPagina(datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      onSubida(resultado.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <label
        className={`${clasesBoton("suave", "md")} cursor-pointer ${
          deshabilitado || subiendo ? "pointer-events-none opacity-45" : ""
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          width={16}
          height={16}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="flex-none"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
        {subiendo ? "Subiendo…" : texto}
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          onChange={alElegir}
          disabled={deshabilitado || subiendo}
          className="hidden"
        />
      </label>
      {error && <MensajeError>{error}</MensajeError>}
    </div>
  );
}
