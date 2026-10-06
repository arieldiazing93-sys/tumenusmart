"use client";

import { useEffect, useState } from "react";
import { BotonWhatsappCTA } from "@/components/BotonWhatsappCTA";
import { enlaceConDatosDeFactura, leerDatosFacturaCliente } from "@/lib/factura-cliente-sesion";
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
  // Si el cliente pidió factura, sus datos (razón social, RUC, correo) los tiene solo este navegador: no se guardan en el pedido.
  // Se agregan al mensaje acá, justo debajo de "Comprobante: Factura".
  const [enlace, setEnlace] = useState(link);
  useEffect(() => {
    const datos = leerDatosFacturaCliente(orderId);
    setEnlace(datos ? enlaceConDatosDeFactura(link, datos) : link);
  }, [orderId, link]);

  return (
    <BotonWhatsappCTA
      link={enlace}
      yaEnviado={yaEnviado}
      onEnviar={() => {
        marcarEnviadoWhatsapp(slug, orderId).catch(() => {
          // Silencioso a propósito: no vale la pena molestar al cliente.
        });
      }}
    />
  );
}
