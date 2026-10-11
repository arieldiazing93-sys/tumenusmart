"use client";

import { useRef, useState } from "react";
import { subirFotoProducto } from "./actions";
import { comprimirImagen, pesoLegible, PARA_PRODUCTO } from "@/lib/comprimir-imagen";
import { estiloDeFoco, leerEncuadre } from "@/lib/foco-imagen";
import { EncuadreImagen } from "./EncuadreImagen";

export function ImagenProductoField({
  initialUrl,
  initialFocoX = null,
  initialFocoY = null,
  conEncuadre = true,
  etiqueta = "Foto del producto",
  ayuda,
}: {
  initialUrl: string | null;
  /** Qué parte de la foto se ve cuando la carta la recorta (0 a 100; 50 = centro). Sin valor, como siempre. */
  initialFocoX?: number | null;
  initialFocoY?: number | null;
  /** Si se ofrece elegir qué parte de la foto se ve. Los servicios no lo usan: su foto se muestra cuadrada y por arriba. */
  conEncuadre?: boolean;
  etiqueta?: string;
  /** Una línea de ayuda debajo del campo, si hace falta explicar para qué sirve acá. */
  ayuda?: string;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  // El encuadre elegido (null = no se tocó: la carta la muestra como siempre). Una foto nueva arranca sin encuadre.
  const [foco, setFoco] = useState<{ x: number; y: number } | null>(() => {
    const e = leerEncuadre(initialFocoX, initialFocoY);
    return e.x !== null && e.y !== null ? { x: e.x, y: e.y } : null;
  });
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
      setFoco(null);

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
      <label className="mb-1 block text-sm font-semibold text-tinta">{etiqueta}</label>
      {ayuda && <p className="mb-1.5 text-xs leading-snug text-tinta-media">{ayuda}</p>}

      {/* La miniatura y los botones, y al lado (o debajo, si no entra) la vista previa para encuadrar. */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-lg border border-linea bg-papel-suave">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={etiqueta}
              className="h-full w-full object-cover"
              style={estiloDeFoco(foco?.x, foco?.y)}
            />
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
              onClick={() => {
                setUrl("");
                setFoco(null);
              }}
              className="text-left text-xs text-peligro hover:underline"
            >
              Quitar foto
            </button>
          )}
        </div>
      </div>

      {/* Con foto: la vista previa para elegir qué parte se ve en la carta (se arrastra con el mouse o con el dedo). */}
      {url && conEncuadre && (
        <div className="w-full max-w-[16rem]">
          <EncuadreImagen
            url={url}
            x={foco?.x ?? 50}
            y={foco?.y ?? 50}
            onCambio={(x, y) => setFoco({ x, y })}
          />
          {foco && (foco.x !== 50 || foco.y !== 50) && (
            <button
              type="button"
              onClick={() => setFoco({ x: 50, y: 50 })}
              className="mt-1 rounded-lg border border-azul/35 bg-azul-luz px-2.5 py-1 text-xs font-semibold text-azul-oscuro hover:border-azul hover:bg-azul hover:text-white"
            >
              Centrar de nuevo
            </button>
          )}
        </div>
      )}
      </div>

      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      {ahorro && !error && (
        <p className="mt-1 text-xs text-exito">
          Foto optimizada: {ahorro}. Se ve igual y tu carta carga mucho más rápido.
        </p>
      )}

      <input type="hidden" name="imagenUrl" value={url} />
      {conEncuadre && (
        <>
          <input type="hidden" name="imagenFocoX" value={url && foco ? foco.x : ""} />
          <input type="hidden" name="imagenFocoY" value={url && foco ? foco.y : ""} />
        </>
      )}
    </div>
  );
}
