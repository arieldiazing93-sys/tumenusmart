"use client";

import { useState } from "react";

/** El isotipo de WhatsApp, para que el botón se reconozca de un vistazo y no
 * dependa solo del color de fondo (que además cambia una vez enviado). */
function IconoWhatsapp() {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" width="20" height="20" aria-hidden="true" className="flex-none">
      <path d="M16.004 3C9.375 3 3.999 8.373 3.999 15c0 2.386.706 4.61 1.923 6.475L4 29l7.706-1.902A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.818c-1.98 0-3.827-.58-5.383-1.578l-.386-.24-4.573 1.128 1.155-4.457-.253-.397a9.77 9.77 0 0 1-1.53-5.274c0-5.421 4.41-9.83 9.97-9.83 5.56 0 9.97 4.409 9.97 9.83 0 5.421-4.41 9.818-9.97 9.818Zm5.47-7.35c-.3-.15-1.77-.873-2.045-.972-.274-.1-.474-.15-.673.15-.2.3-.773.972-.948 1.172-.174.2-.35.225-.648.075-.3-.15-1.266-.467-2.412-1.489-.892-.796-1.494-1.779-1.669-2.079-.174-.3-.019-.462.131-.611.135-.134.3-.35.449-.525.15-.174.2-.3.3-.5.1-.2.05-.375-.025-.525-.075-.15-.673-1.622-.922-2.222-.243-.583-.49-.504-.673-.513l-.573-.01c-.2 0-.524.075-.798.375-.274.3-1.048 1.024-1.048 2.497 0 1.473 1.073 2.897 1.223 3.097.15.2 2.112 3.225 5.116 4.523.715.309 1.273.494 1.708.632.717.228 1.37.196 1.886.119.575-.086 1.77-.723 2.02-1.422.25-.699.25-1.298.174-1.423-.075-.124-.274-.199-.573-.349Z" />
    </svg>
  );
}

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
      className={`inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-[0.95rem] font-semibold text-white shadow-media transition-[background-color,opacity] duration-150 hover:opacity-90 ${
        enviado ? "bg-tinta-suave" : "bg-[#25D366]"
      }`}
    >
      <IconoWhatsapp />
      {enviado ? "Volver a abrir WhatsApp" : "Enviar por WhatsApp"}
      <span aria-hidden="true">→</span>
    </a>
  );
}
