"use client";

import { useRef, useState } from "react";
import { estiloDeFoco, ZOOM_MAXIMO, ZOOM_MINIMO } from "@/lib/foco-imagen";

function acotar(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * La vista previa de una foto con la que se elige qué parte se ve en la carta: se arrastra la foto con el mouse o con el dedo
 * (como al subir la foto de perfil en Instagram) y se ve al instante cómo queda. Con el control «Acercar» la foto se agranda y
 * hay lugar para subirla o bajarla aunque entre justa en el marco.
 *
 * El marco tiene la forma de la foto en la carta (la tarjeta, de unos 8:5, o el cuadrado de la lista); en el carrusel y en la ficha
 * la foto se recorta distinto, pero con el mismo punto y el mismo acercamiento: lo que el dueño deja a la vista acá es lo que se
 * prioriza en todos lados. No toca la imagen: solo guarda el punto (x, y de 0 a 100; 50 = centro) y el acercamiento (100 a 300).
 *
 * Arrastrar la foto hacia la derecha deja ver más de su parte izquierda, como al mover una foto dentro de un marco. También
 * se puede con el teclado (las flechas, con el marco enfocado).
 */
export function EncuadreImagen({
  url,
  x,
  y,
  zoom,
  onCambio,
  onZoom,
  cuadrada = false,
}: {
  url: string;
  x: number;
  y: number;
  /** De 100 (sin acercar) a 300. */
  zoom: number;
  onCambio: (x: number, y: number) => void;
  onZoom: (zoom: number) => void;
  /** El marco es cuadrado (la carta en «lista») en vez de ancho (la carta en «tarjetas»). */
  cuadrada?: boolean;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ ancho: number; alto: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const agarre = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  /** Cuántos píxeles de la foto (ya acercada) quedan fuera del marco en cada eje: la foto cubre el marco, como en la carta. */
  function sobrante(): { x: number; y: number } {
    const el = marco.current;
    if (!el || !natural || natural.ancho === 0 || natural.alto === 0) return { x: 0, y: 0 };
    const escala = Math.max(el.clientWidth / natural.ancho, el.clientHeight / natural.alto) * (zoom / 100);
    return {
      x: Math.max(0, natural.ancho * escala - el.clientWidth),
      y: Math.max(0, natural.alto * escala - el.clientHeight),
    };
  }

  const margen = sobrante();
  const sePuedeMover = margen.x > 0.5 || margen.y > 0.5;

  function alBajar(e: React.PointerEvent<HTMLDivElement>) {
    try {
      // Con el puntero "agarrado", el arrastre sigue aunque el dedo o el mouse se salgan del marco.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Algunos navegadores no lo permiten en ciertos punteros: el arrastre sigue funcionando dentro del marco.
    }
    agarre.current = { px: e.clientX, py: e.clientY, x, y };
    setArrastrando(true);
  }

  function alMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = agarre.current;
    if (!a) return;
    const s = sobrante();
    const nx = s.x > 0.5 ? acotar(a.x - ((e.clientX - a.px) / s.x) * 100) : a.x;
    const ny = s.y > 0.5 ? acotar(a.y - ((e.clientY - a.py) / s.y) * 100) : a.y;
    onCambio(nx, ny);
  }

  function alSoltar() {
    agarre.current = null;
    setArrastrando(false);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLDivElement>) {
    const paso = e.shiftKey ? 10 : 3;
    // La flecha mueve la foto en ese sentido, igual que el arrastre.
    const cambios: Record<string, [number, number]> = {
      ArrowLeft: [-paso, 0],
      ArrowRight: [paso, 0],
      ArrowUp: [0, -paso],
      ArrowDown: [0, paso],
    };
    const c = cambios[e.key];
    if (!c) return;
    e.preventDefault();
    const s = sobrante();
    onCambio(s.x > 0.5 ? acotar(x - c[0]) : x, s.y > 0.5 ? acotar(y - c[1]) : y);
  }

  function cambiarZoom(nuevo: number) {
    onZoom(Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, Math.round(nuevo))));
  }

  return (
    <div>
      <div
        ref={marco}
        role="group"
        tabIndex={0}
        aria-label="Encuadre de la foto: arrastrala para elegir qué parte se ve en la carta"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
        onKeyDown={alTeclear}
        className={`relative ${cuadrada ? "aspect-square" : "aspect-[8/5]"} w-full touch-none select-none overflow-hidden rounded-xl border-2 border-azul/50 bg-papel-hundido focus:outline-none focus-visible:ring-2 focus-visible:ring-azul/40 ${
          sePuedeMover ? (arrastrando ? "cursor-grabbing" : "cursor-grab") : ""
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) => setNatural({ ancho: e.currentTarget.naturalWidth, alto: e.currentTarget.naturalHeight })}
          className="h-full w-full object-cover"
          style={estiloDeFoco(x, y, zoom)}
        />
        {sePuedeMover && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-tinta/70 px-3 py-1 text-[0.72rem] font-semibold text-white"
          >
            ✥ Arrastrá la foto
          </span>
        )}
      </div>

      {/* Acercar: sin esto, una foto que entra justa en el marco no tiene de dónde moverse. */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label="Alejar la foto"
          disabled={zoom <= ZOOM_MINIMO}
          onClick={() => cambiarZoom(zoom - 10)}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-azul/35 bg-azul-luz text-lg font-semibold leading-none text-azul-oscuro hover:border-azul hover:bg-azul hover:text-white disabled:pointer-events-none disabled:opacity-40"
        >
          −
        </button>
        <input
          type="range"
          aria-label="Acercar la foto"
          min={ZOOM_MINIMO}
          max={ZOOM_MAXIMO}
          step={5}
          value={zoom}
          onChange={(e) => cambiarZoom(Number(e.target.value))}
          className="min-w-0 flex-1 accent-azul"
        />
        <button
          type="button"
          aria-label="Acercar la foto"
          disabled={zoom >= ZOOM_MAXIMO}
          onClick={() => cambiarZoom(zoom + 10)}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-azul/35 bg-azul-luz text-lg font-semibold leading-none text-azul-oscuro hover:border-azul hover:bg-azul hover:text-white disabled:pointer-events-none disabled:opacity-40"
        >
          +
        </button>
      </div>

      <p className="mt-1 text-[0.76rem] leading-snug text-tinta-media">
        {sePuedeMover
          ? `Así se ve en tu carta (${cuadrada ? "en lista, cuadrada" : "en tarjetas, ancha"}). Movela con el mouse o con el dedo hasta que se vea lo importante.`
          : "Esta foto entra justa en el marco. Acercala con el control de abajo (+) y después subila o bajala para dejar a la vista lo importante."}
      </p>
    </div>
  );
}
