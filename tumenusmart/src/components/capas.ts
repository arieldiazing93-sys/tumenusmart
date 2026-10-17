import { useEffect, useRef } from "react";

/**
 * Las «capas» de la pantalla: paneles laterales, ventanas, cuadros y selectores que se abren ENCIMA de lo que hay.
 *
 * Dos cosas tienen que ser de a una para toda la pantalla, y por eso viven acá y no en cada ventana:
 *
 *  1. Escape. Con una ventana encima de otra (el cuadro de la contraseña sobre el panel de cobro, el selector de agregados sobre el
 *     panel de cargar productos), Escape cierra SOLO la de arriba, la que se ve. Antes cada ventana escuchaba Escape por su cuenta y
 *     las dos se cerraban: se perdía lo que se estaba cargando o cobrando.
 *  2. El bloqueo del scroll de la página de atrás. Se cuenta cuántas capas lo piden: el scroll se bloquea con la primera y se libera
 *     recién cuando se va la última. Antes cada ventana guardaba «cómo estaba» y lo restauraba al cerrarse: si dos se cerraban juntas
 *     la última dejaba la página trabada («hidden») hasta recargar.
 *
 * Cómo se usa, adentro de cualquier componente que dibuje una capa:
 *
 *     useCapa(onCerrar);                                   // Escape la cierra, si es la de arriba
 *     useCapa(() => { if (!pendiente) onCerrar(); });      // con una condición
 *     useCapa(onCerrar, { bloquearScroll: true });         // y la página de atrás no se mueve
 *     useCapa(() => setAbierto(false), { activa: abierto }); // un componente que siempre existe y solo a veces es una capa
 */

/** Cada capa abierta tiene un número: la de número más alto es la de arriba. */
let contador = 0;
const abiertas = new Set<number>();

let bloqueos = 0;
let overflowAnterior = "";

function bloquearScrollDeLaPagina() {
  if (bloqueos === 0) {
    overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  bloqueos++;
}

function liberarScrollDeLaPagina() {
  bloqueos = Math.max(0, bloqueos - 1);
  if (bloqueos === 0) document.body.style.overflow = overflowAnterior;
}

export function useCapa(
  alEscape?: () => void,
  opciones?: {
    /** false = por ahora no es una capa (no escucha Escape ni bloquea nada). Por defecto, true. */
    activa?: boolean;
    /** Que la página de atrás no se mueva mientras esta capa está abierta. Por defecto, no. */
    bloquearScroll?: boolean;
  }
) {
  const activa = opciones?.activa ?? true;
  const bloquearScroll = opciones?.bloquearScroll ?? false;

  // El número se toma al DIBUJAR (el componente de afuera se dibuja antes que el de adentro) y no al montar (donde el de adentro va
  // primero): así una capa abierta dentro de otra queda arriba, y una abierta más tarde también.
  const numero = useRef(0);
  if (activa && numero.current === 0) numero.current = ++contador;

  // Siempre se llama a la función más nueva, sin tener que rearmar el listener en cada vuelta de quien abrió la capa.
  const ultima = useRef(alEscape);
  useEffect(() => {
    ultima.current = alEscape;
  });

  useEffect(() => {
    if (!activa) return;
    const yo = numero.current;
    abiertas.add(yo);
    if (bloquearScroll) bloquearScrollDeLaPagina();

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !ultima.current) return;
      if (Math.max(...Array.from(abiertas)) !== yo) return;
      ultima.current();
    };
    window.addEventListener("keydown", alTeclear);

    return () => {
      window.removeEventListener("keydown", alTeclear);
      abiertas.delete(yo);
      if (bloquearScroll) liberarScrollDeLaPagina();
      // Si vuelve a abrirse, toma un número nuevo (más alto que el de lo que se abrió mientras tanto).
      numero.current = 0;
    };
  }, [activa, bloquearScroll]);
}
