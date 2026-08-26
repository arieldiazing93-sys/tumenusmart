"use client";

import { useTransition } from "react";
import type { Direccion } from "@/lib/ordenar";

/**
 * Las flechitas para subir y bajar un elemento de la lista.
 *
 * Son flechas y no "arrastrar y soltar" por una razón práctica: el dueño del
 * restaurante ordena su carta desde el celular, y arrastrar en una pantalla
 * táctil que además hace scroll es incómodo y falla seguido. Dos botones no
 * fallan nunca.
 *
 * El primero de la lista tiene la flecha de subir apagada, y el último la de
 * bajar. Apagadas y visibles, no escondidas: si desaparecieran, los botones
 * de cada fila quedarían en distinta posición y el dedo erraría.
 */
export function BotonesMover({
  id,
  accion,
  esPrimero,
  esUltimo,
  etiqueta,
}: {
  id: string;
  /**
   * La acción del servidor que mueve el elemento.
   *
   * Se recibe la acción entera y no una función ya armada con el id adentro,
   * porque Next NO deja pasar una función cualquiera desde un componente de
   * servidor a uno de cliente — solo deja pasar una Server Action. Y la página
   * de productos es de servidor.
   */
  accion: (id: string, direccion: Direccion) => Promise<void>;
  esPrimero: boolean;
  esUltimo: boolean;
  /** Para el lector de pantalla: "Subir Empanadas". */
  etiqueta: string;
}) {
  const [pendiente, iniciar] = useTransition();

  // Con un solo elemento no hay nada que ordenar.
  if (esPrimero && esUltimo) return null;

  const base =
    "flex h-7 w-7 items-center justify-center rounded border border-linea bg-white text-tinta-media transition-colors hover:border-azul hover:text-azul disabled:cursor-default disabled:border-linea-fina disabled:text-linea disabled:hover:border-linea-fina disabled:hover:text-linea";

  return (
    <div className="flex flex-none items-center gap-1">
      <button
        type="button"
        aria-label={`Subir ${etiqueta}`}
        disabled={esPrimero || pendiente}
        onClick={() => iniciar(() => { void accion(id, "arriba"); })}
        className={base}
      >
        <span aria-hidden="true" className="text-[0.7rem] leading-none">▲</span>
      </button>
      <button
        type="button"
        aria-label={`Bajar ${etiqueta}`}
        disabled={esUltimo || pendiente}
        onClick={() => iniciar(() => { void accion(id, "abajo"); })}
        className={base}
      >
        <span aria-hidden="true" className="text-[0.7rem] leading-none">▼</span>
      </button>
    </div>
  );
}
