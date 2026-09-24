"use client";

import { useEffect, useRef } from "react";

/**
 * Deja el calendario corrido hasta la hora que interesa (la de ahora, o el
 * primer turno del día) en vez de arrancar siempre desde la mañana. Va adentro
 * del contenedor que scrollea, marcado con `data-scroll-agenda`.
 */
export function DesplazarAlIniciar({ rem }: { rem: number }) {
  const marca = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const contenedor = marca.current?.closest("[data-scroll-agenda]");
    if (!(contenedor instanceof HTMLElement)) return;
    const pxPorRem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    contenedor.scrollTop = rem * pxPorRem;
  }, [rem]);

  return <span ref={marca} hidden />;
}
