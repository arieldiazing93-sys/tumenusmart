"use client";

import { BotonWhatsappCTA } from "@/components/BotonWhatsappCTA";
import { marcarReservaEnviada } from "./actions";

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
  return (
    <BotonWhatsappCTA
      link={link}
      yaEnviado={yaEnviado}
      onEnviar={() => {
        marcarReservaEnviada(slug, reservationId).catch(() => {
          // Silencioso: si falla el registro, el cliente igual llega a WhatsApp.
        });
      }}
    />
  );
}
