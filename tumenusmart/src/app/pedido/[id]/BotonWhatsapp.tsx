"use client";

import { useState } from "react";
import { marcarEnviadoWhatsapp } from "./actions";

/**
 * Abre WhatsApp y, en paralelo, deja registrado que el cliente sí mandó el
 * mensaje. El registro es "fire and forget": si falla, el cliente igual va
 * a WhatsApp — nunca se le traba el envío por un problema nuestro.
 */
export function BotonWhatsapp({
  orderId,
  link,
  yaEnviado,
}: {
  orderId: string;
  link: string;
  yaEnviado: boolean;
}) {
  const [enviado, setEnviado] = useState(yaEnviado);

  function registrar() {
    setEnviado(true);
    marcarEnviadoWhatsapp(orderId).catch(() => {
      // Silencioso a propósito: no vale la pena molestar al cliente.
    });
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={registrar}
      className={`inline-flex items-center gap-2 rounded-lg px-6 py-3 font-medium text-white hover:opacity-90 ${
        enviado ? "bg-neutral-500" : "bg-[#25D366]"
      }`}
    >
      {enviado ? "Volver a abrir WhatsApp" : "Enviar por WhatsApp"}
    </a>
  );
}
