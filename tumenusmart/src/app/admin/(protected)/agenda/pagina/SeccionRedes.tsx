"use client";

import type { ComponentType } from "react";
import { Entrada, Tarjeta } from "@/components/ui";
import { IconoWhatsapp } from "@/components/iconos";
import { IconoFacebook, IconoInstagram, IconoTiktok } from "@/components/IconosRedes";
import { formatearTelefonoPersonal, normalizarTelefonoPersonal } from "@/lib/agenda-personal";
import type { DatosPagina, RedSocial } from "@/lib/pagina-reservas";
import type { PropsSeccion } from "./tipos";

const REDES: {
  clave: RedSocial;
  etiqueta: string;
  Icono: ComponentType<{ tam?: number; className?: string }>;
  ejemplo: string;
}[] = [
  { clave: "instagram", etiqueta: "Instagram", Icono: IconoInstagram, ejemplo: "https://instagram.com/tuusuario  o  @tuusuario" },
  { clave: "tiktok", etiqueta: "TikTok", Icono: IconoTiktok, ejemplo: "https://www.tiktok.com/@tuusuario  o  @tuusuario" },
  { clave: "facebook", etiqueta: "Facebook", Icono: IconoFacebook, ejemplo: "https://facebook.com/tupagina  o  tupagina" },
];

/**
 * Enlaces sociales: Instagram, TikTok, Facebook y WhatsApp. Se puede pegar el
 * enlace completo o solo escribir el usuario. El de WhatsApp no se carga acá:
 * usa el número donde se reciben las reservas.
 */
export function SeccionRedes({ datos, cambiar }: PropsSeccion) {
  const numero = normalizarTelefonoPersonal(datos.whatsappPais, datos.whatsapp);

  function cambiarRed(red: RedSocial, valor: string) {
    const parche: Partial<DatosPagina> =
      red === "instagram" ? { instagram: valor } : red === "tiktok" ? { tiktok: valor } : { facebook: valor };
    cambiar(parche);
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div>
        <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">Enlaces sociales</h3>
        <p className="mt-0.5 text-[0.82rem] text-tinta-media">
          Aparecen como iconos en tu página. Dejá vacío el que no uses.
        </p>
      </div>

      {REDES.map(({ clave, etiqueta, Icono, ejemplo }) => (
        <label key={clave} className="block">
          <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Enlace de {etiqueta}</span>
          <div className="relative">
            <Icono tam={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave" />
            <Entrada
              value={datos[clave]}
              onChange={(e) => cambiarRed(clave, e.target.value)}
              maxLength={200}
              inputMode="url"
              autoComplete="off"
              placeholder={`Enlace o usuario de ${etiqueta}`}
              // Inline y no una clase: el campo ya trae px-3 y no hay garantía de cuál gana.
              style={{ paddingLeft: "2.5rem" }}
            />
          </div>
          <span className="mt-1 block text-[0.76rem] text-tinta-suave">Ejemplo: {ejemplo}</span>
        </label>
      ))}

      <div className="flex items-start gap-3 rounded-lg border border-linea bg-papel-suave p-3">
        <IconoWhatsapp tam={20} className="mt-0.5 text-exito" />
        <div className="min-w-0">
          <p className="text-[0.86rem] font-semibold text-tinta">WhatsApp</p>
          <p className="text-[0.8rem] leading-snug text-tinta-media">
            {numero.ok
              ? `Se usa el número donde recibís las reservas: ${formatearTelefonoPersonal(numero.telefono)}.`
              : "Se usa el número donde recibís las reservas. Cargalo en el panel de la izquierda."}
          </p>
        </div>
      </div>
    </Tarjeta>
  );
}
