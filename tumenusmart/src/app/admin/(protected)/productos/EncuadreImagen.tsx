"use client";

import { useRef, useState } from "react";

function acotar(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * La vista previa de una foto con la que se elige qué parte se ve en la carta: se arrastra la foto con el mouse o con el dedo
 * (como al subir la foto de perfil en Instagram) y se ve al instante cómo queda.
 *
 * El marco tiene la proporción de la foto en la carta (la tarjeta, de unos 8:5, o el cuadrado de la lista); en la lista, el carrusel y la ficha la foto se recorta
 * distinto, pero con el mismo punto: lo que el dueño deja a la vista acá es lo que se prioriza en todos lados. No toca la imagen:
 * solo guarda el punto (x, y de 0 a 100; 50 = centro) que la carta usa como `object-position`.
 *
 * Arrastrar la foto hacia la derecha deja ver más de su parte izquierda, como al mover una foto dentro de un marco. También
 * se puede con el teclado (las flechas, con el marco enfocado). Si la foto entra justa en un eje, ese eje no se mueve.
 */
export function EncuadreImagen({
  url,
  x,
  y,
  onCambio,
  cuadrada = false,
}: {
  url: string;
  x: number;
  y: number;
  onCambio: (x: number, y: number) => void;
  /** El marco es cuadrado (la carta en «lista») en vez de ancho (la carta en «tarjetas»). */
  cuadrada?: boolean;
}) {
  const marco = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ ancho: number; alto: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const agarre = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  /** Cuántos píxeles de la foto quedan fuera del marco en cada eje (la foto cubre el marco, como en la carta). */
  function sobrante(): { x: number; y: number } {
    const el = marco.current;
    if (!el || !natural || natural.ancho === 0 || natural.alto === 0) return { x: 0, y: 0 };
    const escala = Math.max(el.clientWidth / natural.ancho, el.clientHeight / natural.alto);
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
          style={{ objectPosition: `${x}% ${y}%` }}
        />
        {sePuedeMover && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-tinta/70 px-3 py-1 text-[0.72rem] font-semibold text-white"
          >
            ✥ Arrastrá la foto
          </span>
        )}
      </div>
      <p className="mt-1 text-[0.76rem] leading-snug text-tinta-media">
        {sePuedeMover
          ? `Así se ve en tu carta (${cuadrada ? "en lista, cuadrada" : "en tarjetas, ancha"}). Movela con el mouse o con el dedo hasta que se vea lo importante.`
          : "Esta foto entra justa en el marco: no hay nada para mover."}
      </p>
    </div>
  );
}
