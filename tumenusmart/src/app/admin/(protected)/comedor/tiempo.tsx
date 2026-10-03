"use client";

import { useEffect, useState } from "react";
import { ZONA_NEGOCIO } from "@/lib/timezone";

/**
 * Las horas y los "hace cuánto" dependen del reloj de quien mira: si se escribieran ya en el servidor, el texto del
 * navegador podría no coincidir con el que llegó armado (el minuto cambió en el medio) y React protestaría al hidratar. Por
 * eso acá se dibujan recién cuando la pantalla ya está en el navegador (primero aparecen vacías, un instante).
 */

/** "hace 5 min", "hace 1 h 20 min". */
function haceCuanto(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

/** "hace 5 min", que se va actualizando solo. */
export function Hace({ iso }: { iso: string }) {
  const [texto, setTexto] = useState("");
  useEffect(() => {
    const actualizar = () => setTexto(haceCuanto(iso));
    actualizar();
    const reloj = setInterval(actualizar, 30000);
    return () => clearInterval(reloj);
  }, [iso]);
  return <>{texto}</>;
}

/** "12:45", en la hora del negocio. */
export function HoraDe({ iso }: { iso: string }) {
  const [texto, setTexto] = useState("");
  useEffect(() => {
    setTexto(
      new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_NEGOCIO })
    );
  }, [iso]);
  return <>{texto}</>;
}
