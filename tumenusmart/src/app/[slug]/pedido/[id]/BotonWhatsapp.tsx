"use client";

import { BotonWhatsappCTA } from "@/components/BotonWhatsappCTA";
import { marcarEnviadoWhatsapp } from "./actions";

export function BotonWhatsapp({
  slug,
  orderId,
  link,
  yaEnviado,
}: {
  slug: string;
  orderId: string;
  link: string;
  yaEnviado: boolean;
}) {
  return (
    <BotonWhatsappCTA
      link={link}
      yaEnviado={yaEnviado}
      onEnviar={() => {
        marcarEnviadoWhatsapp(slug, orderId).catch(() => {
          // Silencioso a propósito: no vale la pena molestar al cliente.
        });
      }}
    />
  );
}
