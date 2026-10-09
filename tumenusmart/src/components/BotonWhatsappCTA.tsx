"use client";

import { useState } from "react";
import { IconoWhatsapp } from "./iconos";

/**
 * Abre WhatsApp y avisa que el cliente ya mandó el mensaje.
 *
 * `onEnviar` es quien registra ese envío en el pedido o en la reserva —
 * fire and forget en ambos casos: si falla, el cliente igual llega a
 * WhatsApp, nunca se le traba la salida por un problema nuestro.
 */
export function BotonWhatsappCTA({
  link,
  yaEnviado,
  onEnviar,
  llamar = false,
}: {
  link: string;
  yaEnviado: boolean;
  onEnviar: () => void;
  /**
   * El botón salta tres veces cada tanto mientras no se lo toca, para llamar la atención (el envío es un paso que se olvida
   * y sin él el local no se entera). Es el mismo salto de la pantalla final de reservas de turnos.
   */
  llamar?: boolean;
}) {
  const [enviado, setEnviado] = useState(yaEnviado);

  function registrar() {
    setEnviado(true);
    onEnviar();
  }

  const boton = (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={registrar}
      className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-6 text-[1rem] font-semibold shadow-alta transition-[background-color,opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] ${
        enviado ? "bg-tinta-suave text-papel" : "bg-[#25D366] text-white"
      }`}
    >
      <IconoWhatsapp />
      {enviado ? "Volver a abrir WhatsApp" : "Enviar por WhatsApp"}
      <span aria-hidden="true">→</span>
    </a>
  );

  // El que salta es este contenedor y no el botón: así el botón conserva su propio efecto al apretarlo. Deja de saltar
  // apenas se lo toca.
  return llamar && !enviado ? <div className="w-full animate-llamar">{boton}</div> : boton;
}
