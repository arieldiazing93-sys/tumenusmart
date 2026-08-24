"use client";

import { useState } from "react";
import { marcarReservaEnviada } from "./actions";

/**
 * Abre WhatsApp y deja registrado el envío. Ese registro es lo que hace
 * que la reserva aparezca en el calendario del local, así que se dispara
 * apenas el cliente hace clic — sin bloquearle la salida a WhatsApp.
 */
export function BotonWhatsappReserva({
  slug,
  reservationId,
  link,
  yaEnviado,
}: {
  slug: string;
  reservationId: string;
  link: string;
  yaEnviado: boolean;
}) {
  const [enviado, setEnviado] = useState(yaEnviado);

  function registrar() {
    setEnviado(true);
    marcarReservaEnviada(slug, reservationId).catch(() => {
      // Silencioso: si falla el registro, el cliente igual llega a WhatsApp.
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
