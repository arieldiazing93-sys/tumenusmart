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
}: {
  link: string;
  yaEnviado: boolean;
  onEnviar: () => void;
}) {
  const [enviado, setEnviado] = useState(yaEnviado);

  function registrar() {
    setEnviado(true);
    onEnviar();
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={registrar}
      className={`inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-[0.95rem] font-semibold shadow-media transition-[background-color,opacity] duration-150 hover:opacity-90 ${
        enviado ? "bg-tinta-suave text-papel" : "bg-[#25D366] text-white"
      }`}
    >
      <IconoWhatsapp />
      {enviado ? "Volver a abrir WhatsApp" : "Enviar por WhatsApp"}
      <span aria-hidden="true">→</span>
    </a>
  );
}
