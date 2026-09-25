"use client";

import { useEffect, useState } from "react";
import { Campo, Entrada, Pastilla, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { Interruptor } from "@/components/Interruptor";
import { normalizarSlug } from "@/lib/alcance-local";
import { iniciales } from "@/lib/agenda";
import { ENTRADAS_CALENDARIO } from "@/lib/pagina-reservas";
import { BotonSubirImagen, PARA_PERFIL } from "./BotonSubirImagen";
import { CampoTelefonoPagina } from "./CampoTelefonoPagina";
import type { PropsSeccion } from "./tipos";

/**
 * La columna de la izquierda del editor: la foto de perfil, el nombre, el
 * interruptor "Habilitar la reserva en línea", la dirección de la página (con
 * copiar y editar) y todo lo del WhatsApp: el número donde llegan las reservas,
 * si se avisa por WhatsApp y cuándo entra la reserva al calendario.
 */
export function PerfilPagina({ datos, cambiar }: PropsSeccion) {
  // El dominio se lee recién en el navegador: en el servidor no se conoce.
  const [origen, setOrigen] = useState("");
  const [editandoDireccion, setEditandoDireccion] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setOrigen(window.location.origin);
  }, []);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  const enlace = `${origen}/turnos/${datos.slug}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      // Sin permiso del navegador: se deja el enlace a la vista para copiarlo a mano.
      setEditandoDireccion(true);
    }
  }

  return (
    <Tarjeta className="flex flex-col gap-4">
      {/* ---------- foto y nombre ---------- */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border border-linea bg-brand-light text-[2rem] font-semibold text-brand-texto">
          {datos.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={datos.fotoUrl} alt="Foto de perfil" className="h-full w-full object-cover" />
          ) : (
            iniciales(datos.nombre || "?")
          )}
        </div>
        <BotonSubirImagen
          texto={datos.fotoUrl ? "Cambiar foto" : "Subir foto"}
          opciones={PARA_PERFIL}
          onSubida={(url) => cambiar({ fotoUrl: url })}
        />
        {datos.fotoUrl && (
          <button
            type="button"
            onClick={() => cambiar({ fotoUrl: "" })}
            className="text-[0.78rem] font-medium text-peligro hover:underline"
          >
            Quitar foto
          </button>
        )}
        <div className="min-w-0">
          <p className="truncate text-[1rem] font-semibold text-tinta">{datos.nombre || "Tu negocio"}</p>
          <p className="truncate text-[0.85rem] text-tinta-suave">{datos.industria || "Sin rubro"}</p>
        </div>
      </div>

      {/* ---------- habilitar y dirección ---------- */}
      <div className="flex flex-col gap-4 rounded-xl border border-linea bg-papel-suave p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.9rem] font-semibold text-tinta">Habilitar la reserva en línea</p>
            <div className="mt-1">
              <Pastilla color={datos.habilitada ? "exito" : "neutro"} punto>
                {datos.habilitada ? "Página activa" : "Página apagada"}
              </Pastilla>
            </div>
          </div>
          <Interruptor
            activo={datos.habilitada}
            onChange={(v) => cambiar({ habilitada: v })}
            etiqueta="Habilitar la reserva en línea"
            tono="exito"
          />
        </div>

        <div className="border-t border-linea pt-3">
          <p className="mb-1.5 text-[0.76rem] font-medium text-tinta-suave">Dirección de tu página de reservas</p>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate rounded-lg border border-linea bg-superficie px-3 py-2.5 text-[0.82rem] text-tinta">
              {enlace}
            </div>
            <button
              type="button"
              onClick={copiar}
              aria-label="Copiar la dirección"
              title="Copiar"
              className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-linea bg-superficie text-tinta-media transition-colors hover:border-brand hover:text-brand"
            >
              {copiado ? (
                <span className="text-[0.7rem] font-bold text-exito">✓</span>
              ) : (
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="12" height="12" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => setEditandoDireccion((e) => !e)}
              aria-label="Cambiar la dirección"
              title="Cambiar"
              aria-pressed={editandoDireccion}
              className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg border transition-colors ${
                editandoDireccion
                  ? "border-brand bg-brand-light text-brand-texto"
                  : "border-linea bg-superficie text-tinta-media hover:border-brand hover:text-brand"
              }`}
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>

          {editandoDireccion && (
            <div className="mt-3 flex flex-col gap-2">
              <Campo
                etiqueta="Cómo querés que termine el link"
                ayuda="Solo letras, números y guiones. Si la cambiás, el link anterior deja de funcionar."
              >
                <div className="flex items-center gap-1.5">
                  <span className="flex-none text-[0.82rem] text-tinta-suave">/turnos/</span>
                  <Entrada
                    value={datos.slug}
                    onChange={(e) =>
                      // Mientras se escribe solo se limpia: normalizar de más borraría el guion recién tipeado.
                      cambiar({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) })
                    }
                    maxLength={40}
                    autoFocus
                    placeholder="mi-barberia"
                  />
                </div>
              </Campo>
              <button
                type="button"
                onClick={() => {
                  cambiar({ slug: normalizarSlug(datos.slug) });
                  setEditandoDireccion(false);
                }}
                className={`${clasesBoton("suave", "sm")} self-start`}
              >
                Listo
              </button>
            </div>
          )}
        </div>

        {/* ---------- WhatsApp ---------- */}
        <div className="flex flex-col gap-4 border-t border-linea pt-3">
          <CampoTelefonoPagina
            etiqueta="WhatsApp donde recibís las reservas"
            ayuda="Es el número al que le llega el aviso de cada reserva. Hace falta para habilitar la página."
            pais={datos.whatsappPais}
            numero={datos.whatsapp}
            onChange={(pais, numero) => cambiar({ whatsappPais: pais, whatsapp: numero })}
          />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.86rem] font-semibold text-tinta">Aviso por WhatsApp</p>
              <p className="text-[0.78rem] leading-snug text-tinta-suave">
                Al reservar, el cliente te manda el aviso por WhatsApp con los datos del turno.
              </p>
            </div>
            <Interruptor
              activo={datos.avisoWhatsapp}
              onChange={(v) =>
                cambiar({ avisoWhatsapp: v, ...(v ? {} : { entradaCalendario: "al_reservar" as const }) })
              }
              etiqueta="Aviso por WhatsApp"
              tono="azul"
            />
          </div>

          <Campo
            etiqueta="La reserva entra al calendario"
            ayuda={ENTRADAS_CALENDARIO.find((e) => e.valor === datos.entradaCalendario)?.ayuda}
          >
            <Selector
              value={datos.entradaCalendario}
              onChange={(e) =>
                cambiar({ entradaCalendario: e.target.value === "al_enviar_whatsapp" ? "al_enviar_whatsapp" : "al_reservar" })
              }
            >
              {ENTRADAS_CALENDARIO.map((e) => (
                <option key={e.valor} value={e.valor} disabled={e.valor === "al_enviar_whatsapp" && !datos.avisoWhatsapp}>
                  {e.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
        </div>
      </div>
    </Tarjeta>
  );
}
