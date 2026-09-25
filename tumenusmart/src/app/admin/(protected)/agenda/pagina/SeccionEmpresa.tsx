"use client";

import { Area, Campo, Entrada, Tarjeta } from "@/components/ui";
import { BotonSubirImagen, PARA_BANNER } from "./BotonSubirImagen";
import { CampoTelefonoPagina } from "./CampoTelefonoPagina";
import type { PropsSeccion } from "./tipos";

/** Información de la empresa: banner, nombre, contacto, rubro y una breve descripción. */
export function SeccionEmpresa({ datos, cambiar }: PropsSeccion) {
  return (
    <Tarjeta className="flex flex-col gap-4">
      <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">Información general</h3>

      <div>
        <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Banner (opcional)</span>
        <div
          className="h-28 overflow-hidden rounded-xl border border-linea bg-papel-suave sm:h-36"
          style={
            datos.bannerUrl
              ? undefined
              : { backgroundImage: "linear-gradient(135deg, rgb(var(--brand-light)), rgb(var(--brand-tinte)))" }
          }
        >
          {datos.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={datos.bannerUrl} alt="Banner" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[0.82rem] text-brand-texto">Sin banner</div>
          )}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <BotonSubirImagen
            texto={datos.bannerUrl ? "Cambiar banner" : "Subir banner"}
            opciones={PARA_BANNER}
            onSubida={(url) => cambiar({ bannerUrl: url })}
          />
          {datos.bannerUrl && (
            <button
              type="button"
              onClick={() => cambiar({ bannerUrl: "" })}
              className="text-[0.78rem] font-medium text-peligro hover:underline"
            >
              Quitar banner
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[0.78rem] text-tinta-suave">
          Se ve arriba de tu página. Queda mejor una foto ancha; sin banner se usa el color de tu página.
        </p>
      </div>

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
