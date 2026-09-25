"use client";

import { Entrada, Selector } from "@/components/ui";
import { IconoTelefono } from "@/components/IconosRedes";
import { PAISES_TELEFONO } from "@/lib/agenda-personal";

/**
 * Un teléfono con selector de país (Paraguay +595 por defecto). Guarda lo que se
 * escribe tal cual; el servidor lo lleva al formato internacional al guardar.
 */
export function CampoTelefonoPagina({
  etiqueta,
  ayuda,
  pais,
  numero,
  onChange,
  requerido = false,
}: {
  etiqueta: string;
  ayuda?: string;
  pais: string;
  numero: string;
  onChange: (pais: string, numero: string) => void;
  requerido?: boolean;
}) {
  return (
    <div>
      <span className="mb-1.5 flex items-center gap-1.5 text-[0.82rem] font-semibold text-tinta">
        <IconoTelefono tam={15} />
        {etiqueta}
      </span>
      {/* El ancho va en un contenedor y no en el campo: el campo ya trae w-full. */}
      <div className="flex gap-2">
        <div className="w-[7.5rem] flex-none">
          <Selector aria-label="País" value={pais} onChange={(e) => onChange(e.target.value, numero)}>
            {PAISES_TELEFONO.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.sigla} +{p.codigo}
              </option>
            ))}
          </Selector>
        </div>
        <div className="min-w-0 flex-1">
          <Entrada
            type="tel"
            inputMode="tel"
            autoComplete="off"
            required={requerido}
            value={numero}
            onChange={(e) => onChange(pais, e.target.value)}
            placeholder="Ej: 984 123 456"
            aria-label={etiqueta}
          />
        </div>
      </div>
      <p className="mt-1.5 text-[0.78rem] text-tinta-suave">{ayuda ?? "Ejemplo: +595 984 123 456"}</p>
    </div>
  );
}
