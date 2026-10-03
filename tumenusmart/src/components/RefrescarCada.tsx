"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a pedir los datos de la pantalla cada tantos segundos (no se ve nada: solo actualiza lo que muestra). Se pone
 * dentro de una pantalla que tiene que mostrar lo último sin que nadie recargue, como las mesas abiertas del comedor.
 * Se pausa mientras la pestaña está oculta.
 */
export function RefrescarCada({ segundos }: { segundos: number }) {
  const router = useRouter();

  useEffect(() => {
    const reloj = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(reloj);
  }, [router, segundos]);

  return null;
}
