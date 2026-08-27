"use client";

import { useEffect, useRef, useTransition } from "react";
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
  const refSubir = useRef<HTMLButtonElement>(null);
  const refBajar = useRef<HTMLButtonElement>(null);
  const ultimaDireccion = useRef<Direccion | null>(null);

  /**
   * Devolver el foco al botón después de mover.
   *
   * Cuando la fila llega al extremo, el botón que se acaba de apretar queda
   * deshabilitado — y un elemento deshabilitado no puede tener el foco, así
   * que el navegador lo suelta al <body>. Quien ordena su carta con el teclado
   * pierde el lugar y tiene que volver a tabular desde el principio.
   *
   * Se devuelve el foco al mismo botón; si quedó apagado, al de al lado.
   *
   * OJO con lo que esto NO arregla: llegué acá creyendo que esta pérdida de
   * foco era la que hacía saltar la barra de desplazamiento. Medido en
   * Chromium (pruebas/foco-al-mover.mjs), el scroll no se mueve ni un píxel,
   * ni antes ni después. Eran dos cosas distintas y solo una era esta.
   */
  useEffect(() => {
    if (pendiente || !ultimaDireccion.current) return;

    const preferido = ultimaDireccion.current === "arriba" ? refSubir : refBajar;
    const alternativo = ultimaDireccion.current === "arriba" ? refBajar : refSubir;
    ultimaDireccion.current = null;

    const destino = preferido.current?.disabled ? alternativo.current : preferido.current;
    // preventScroll: el foco vuelve al botón sin arrastrar la página con él.
    destino?.focus({ preventScroll: true });
  }, [pendiente, esPrimero, esUltimo]);

  function mover(direccion: Direccion) {
    // Mientras se guarda no se acepta otro clic, pero NO se deshabilita el
    // botón: deshabilitarlo le sacaría el foco al que lo está usando.
    if (pendiente) return;
    ultimaDireccion.current = direccion;
    iniciar(() => {
      void accion(id, direccion);
    });
  }

  // Con un solo elemento no hay nada que ordenar.
  if (esPrimero && esUltimo) return null;

  const base =
    "flex h-7 w-7 items-center justify-center rounded border border-linea bg-white text-tinta-media transition-colors hover:border-azul hover:text-azul disabled:cursor-default disabled:border-linea-fina disabled:text-linea disabled:hover:border-linea-fina disabled:hover:text-linea";

  return (
    <div className="flex flex-none items-center gap-1" aria-busy={pendiente}>
      <button
        ref={refSubir}
        type="button"
        aria-label={`Subir ${etiqueta}`}
        disabled={esPrimero}
        onClick={() => mover("arriba")}
        className={`${base} ${pendiente ? "opacity-60" : ""}`}
      >
        <span aria-hidden="true" className="text-[0.7rem] leading-none">▲</span>
      </button>
      <button
        ref={refBajar}
        type="button"
        aria-label={`Bajar ${etiqueta}`}
        disabled={esUltimo}
        onClick={() => mover("abajo")}
        className={`${base} ${pendiente ? "opacity-60" : ""}`}
      >
        <span aria-hidden="true" className="text-[0.7rem] leading-none">▼</span>
      </button>
    </div>
  );
}
