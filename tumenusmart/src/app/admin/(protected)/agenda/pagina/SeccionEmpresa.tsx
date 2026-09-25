"use client";

import { Area, Campo, Entrada, Tarjeta } from "@/components/ui";
import { CampoTelefonoPagina } from "./CampoTelefonoPagina";
import type { PropsSeccion } from "./tipos";

/** Información de la empresa: nombre, contacto, rubro y una breve descripción. */
export function SeccionEmpresa({ datos, cambiar }: PropsSeccion) {
  return (
    <Tarjeta className="flex flex-col gap-4">
      <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">Información general</h3>

      <Campo etiqueta="Nombre del negocio *">
        <Entrada
          value={datos.nombre}
          onChange={(e) => cambiar({ nombre: e.target.value })}
          required
          maxLength={60}
          placeholder="Ej: Barbería Sr. Britez"
        />
      </Campo>

      <Campo etiqueta="Correo electrónico">
        <Entrada
          type="email"
          value={datos.email}
          onChange={(e) => cambiar({ email: e.target.value })}
          maxLength={120}
          placeholder="contacto@minegocio.com"
        />
      </Campo>

      <CampoTelefonoPagina
        etiqueta="Teléfono"
        pais={datos.telefonoPais}
        numero={datos.telefono}
        onChange={(pais, numero) => cambiar({ telefonoPais: pais, telefono: numero })}
      />

      <Campo etiqueta="Rubro" ayuda="Se muestra debajo del nombre. Ej: Barbería, Salón de belleza, Uñas.">
        <Entrada
          value={datos.industria}
          onChange={(e) => cambiar({ industria: e.target.value })}
          maxLength={60}
          placeholder="Barbería"
        />
      </Campo>

      <Campo etiqueta="Breve descripción (opcional)" ayuda="Aparece en “Acerca de” de tu página.">
        <Area
          rows={4}
          maxLength={500}
          value={datos.descripcion}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
          placeholder="Contá en pocas palabras qué hacés y qué te distingue."
        />
      </Campo>
    </Tarjeta>
  );
}
