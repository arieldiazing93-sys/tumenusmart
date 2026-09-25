"use client";

import { useRef, useState } from "react";
import { MensajeError, clasesBoton } from "@/components/ui";
import {
  comprimirImagen,
  pesoLegible,
  PARA_LOGO,
  type OpcionesCompresion,
  type ResultadoCompresion,
} from "@/lib/comprimir-imagen";
import { subirImagenPagina } from "./actions";

/**
 * Cuánto se achica cada imagen en el celular antes de subirla. Es el mismo
 * compresor que usan las fotos de los productos (se achica el lado más largo y
 * se guarda en WebP), con medidas propias: en la página de reservas las fotos se
 * ven grandes, a lo ancho de la pantalla, así que se conserva más resolución que
 * en una miniatura de la carta. 1400 píxeles alcanza para verse nítida en un
 * celular de pantalla de alta densidad.
 */
export const PARA_PERFIL: OpcionesCompresion = PARA_LOGO;
export const PARA_BANNER: OpcionesCompresion = { ladoMaximo: 1400, calidad: 0.8 };
export const PARA_GALERIA: OpcionesCompresion = { ladoMaximo: 1400, calidad: 0.82 };

/**
 * Lo más que puede pesar una imagen para subirse: las acciones del servidor
 * aceptan hasta 1 MB por envío, y hay que dejar aire para el resto del mensaje.
 */
const LIMITE_BYTES = 900 * 1024;

/**
 * Achica la imagen con las medidas pedidas. Casi siempre alcanza a la primera; si
 * una foto muy detallada todavía pesa más de lo que admite el servidor, baja la
 * calidad de a poco (y en el último intento también el tamaño) hasta que entre,
 * en vez de fallar al subirla.
 */
async function achicar(original: File, opciones: OpcionesCompresion): Promise<ResultadoCompresion> {
  const intentos: OpcionesCompresion[] = [
    opciones,
    { ...opciones, calidad: Math.max(0.5, opciones.calidad - 0.08) },
    { ...opciones, calidad: Math.max(0.5, opciones.calidad - 0.16) },
    { ladoMaximo: Math.round(opciones.ladoMaximo * 0.8), calidad: Math.max(0.5, opciones.calidad - 0.2) },
  ];
  let resultado = await comprimirImagen(original, intentos[0]);
  for (const intento of intentos.slice(1)) {
    if (resultado.archivo.size <= LIMITE_BYTES) break;
    resultado = await comprimirImagen(original, intento);
  }
  return resultado;
}

/**
 * Un botón "Subir foto": abre el selector de archivos, achica la imagen, la
 * sube y avisa la dirección resultante. Muestra cuánto se achicó, igual que la
 * foto de un producto. No guarda nada en la página: eso lo hace el editor al
 * apretar "Guardar cambios".
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
  // Cuánto se achicó la foto: "3,2 MB → 210 KB". Sin decirlo, no hay forma de saber que pasó.
  const [ahorro, setAhorro] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    setError(null);
    setAhorro(null);
    setSubiendo(true);
    try {
      const comprimida = await achicar(elegido, opciones);
      if (comprimida.archivo.size > LIMITE_BYTES) {
        setError("La foto sigue pesando demasiado. Probá con otra, o con una de menor resolución.");
        return;
      }
      const datos = new FormData();
      datos.set("archivo", comprimida.archivo);
      const resultado = await subirImagenPagina(datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      if (comprimida.comprimida) {
        setAhorro(`${pesoLegible(comprimida.bytesAntes)} → ${pesoLegible(comprimida.bytesDespues)}`);
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
      {ahorro && !error && (
        <p className="text-[0.78rem] text-exito">
          Foto optimizada: {ahorro}. Se ve igual y tu página carga mucho más rápido.
        </p>
      )}
    </div>
  );
}
