"use client";

import { useRef, useState } from "react";
import { subirFotoPortada, quitarPortadaStore } from "./actions";
import {
  comprimirImagen,
  pesoLegible,
  PARA_PORTADA,
  type OpcionesCompresion,
  type ResultadoCompresion,
} from "@/lib/comprimir-imagen";
import { clasesBoton } from "@/components/ui";

/**
 * Lo más que puede pesar la portada para subirse: las acciones del servidor aceptan hasta 1 MB por envío y hay que dejar
 * aire para el resto del mensaje.
 */
const LIMITE_BYTES = 900 * 1024;

/**
 * Achica la portada con las medidas de siempre. Casi nunca hace falta más: si una foto muy detallada todavía pesa de más,
 * baja la calidad de a poco (y al final el tamaño) hasta que entre, en vez de fallar al subirla.
 */
async function achicar(original: File): Promise<ResultadoCompresion> {
  const base = PARA_PORTADA;
  const intentos: OpcionesCompresion[] = [
    base,
    { ...base, calidad: Math.max(0.5, base.calidad - 0.1) },
    { ...base, calidad: Math.max(0.5, base.calidad - 0.2) },
    { ladoMaximo: Math.round(base.ladoMaximo * 0.8), calidad: Math.max(0.5, base.calidad - 0.25) },
  ];
  let resultado = await comprimirImagen(original, intentos[0]);
  for (const intento of intentos.slice(1)) {
    if (resultado.archivo.size <= LIMITE_BYTES) break;
    resultado = await comprimirImagen(original, intento);
  }
  return resultado;
}

/**
 * La foto de portada del menú digital: la franja ancha de arriba de la carta.
 *
 * Se guarda en el momento de subirla (como el logo), sin esperar al "Guardar" del formulario grande. Abajo dice el
 * tamaño que tiene que tener para verse bien: en el celular la franja es casi una tira cuadrada y en una notebook es
 * mucho más ancha, así que la foto se recorta distinto en cada pantalla y conviene saberlo antes de elegirla.
 */
export function PortadaField({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  // Cuánto se achicó la foto: sin decirlo, el dueño no sabe que pasó y sospecha que subió el archivo pesado tal cual.
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
      const resultado = await achicar(archivo);
      if (resultado.archivo.size > LIMITE_BYTES) {
        setError("La foto sigue pesando demasiado. Probá con otra, o con una de menor resolución.");
        return;
      }
      if (resultado.bytesDespues < resultado.bytesAntes) {
        setAhorro(`${pesoLegible(resultado.bytesAntes)} → ${pesoLegible(resultado.bytesDespues)}`);
      }

      const formData = new FormData();
      formData.set("archivo", resultado.archivo);
      const subida = await subirFotoPortada(formData);
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
    setGuardado(false);
    setAhorro(null);
    try {
      await quitarPortadaStore();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar la portada");
    }
  }

  return (
    <div>
      <label className="mb-1 block text-[0.82rem] font-semibold text-tinta">Portada del menú digital</label>
      <p className="mb-2 text-[0.78rem] text-tinta-suave">
        Es la foto ancha que se ve arriba de tu carta, detrás del logo. Sin foto, la portada es del color de tu marca.
      </p>

      {/* La misma proporción que tiene la recomendada: lo que se ve acá es lo que se ve arriba de la carta. */}
      <div className="relative aspect-[16/5] w-full max-w-xl overflow-hidden rounded-xl border border-linea bg-brand">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Portada del menú digital" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[0.82rem] font-medium text-white/85">
            Sin portada
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label className={`${clasesBoton(url ? "navegar" : "nuevo", "md")} cursor-pointer ${subiendo ? "pointer-events-none opacity-45" : ""}`}>
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
          <button type="button" onClick={quitar} className={clasesBoton("peligro", "md")}>
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

      {/* El pie: el tamaño con el que mejor se ve. */}
      <div className="mt-3 rounded-lg bg-azul-luz px-3 py-2.5 text-[0.78rem] leading-snug text-azul-oscuro">
        <p className="font-semibold">Tamaño recomendado: 1600 × 500 píxeles</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>Formato horizontal (más ancha que alta), en JPG, PNG o WEBP.</li>
          <li>
            Poné lo importante en el centro: en el celular se recortan un poco los costados, y en notebook o monitor un
            poco arriba y abajo. No pegues textos ni el logo a los bordes.
          </li>
          <li>Se achica y se optimiza sola antes de subirse; podés mandar la foto tal como salió de la cámara.</li>
        </ul>
      </div>
    </div>
  );
}
