"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Campo, Entrada, Pastilla, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { Interruptor } from "@/components/Interruptor";
import { normalizarSlug } from "@/lib/alcance-local";
import { iniciales } from "@/lib/agenda";
import { ENTRADAS_CALENDARIO } from "@/lib/pagina-reservas";
import { generarMatrizQR } from "@/lib/qr";
import { dibujarPoster, matrizASvg } from "@/lib/poster-qr";
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
  const [mostrarQr, setMostrarQr] = useState(false);
  const [descargandoQr, setDescargandoQr] = useState(false);
  const [errorQr, setErrorQr] = useState<string | null>(null);
  const canvasQrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setOrigen(window.location.origin);
  }, []);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);
  // Cerrar el QR con Escape, como cualquier ventana de este panel.
  useEffect(() => {
    if (!mostrarQr) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMostrarQr(false);
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [mostrarQr]);

  const enlace = `${origen}/turnos/${datos.slug}`;

  // El QR se genera acá mismo, en el navegador, a partir del propio link: no sale ningún dato hacia
  // afuera (no hay un servicio externo de por medio) y funciona igual en cualquier navegador, porque
  // solo usa SVG y Canvas, que son estándares de toda la vida.
  const svgQr = useMemo(() => {
    if (!origen) return null;
    try {
      return matrizASvg(generarMatrizQR(enlace), 220);
    } catch {
      return null;
    }
  }, [origen, enlace]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
    } catch {
      // Sin permiso del navegador: se deja el enlace a la vista para copiarlo a mano.
      setEditandoDireccion(true);
    }
  }

  function descargarQr() {
    setErrorQr(null);
    setDescargandoQr(true);
    try {
      const canvas = canvasQrRef.current;
      if (!canvas) throw new Error("No se pudo preparar el afiche");
      dibujarPoster(canvas, {
        nombreNegocio: datos.nombre || "Reservá tu turno",
        url: enlace,
        bajada: "RESERVÁ TU TURNO",
        instruccion1: "Apuntá la cámara de tu celular",
        instruccion2: "y reservá tu turno online",
      });
      canvas.toBlob((blob) => {
        setDescargandoQr(false);
        if (!blob) {
          setErrorQr("No se pudo generar la imagen del afiche.");
          return;
        }
        const enlaceDescarga = document.createElement("a");
        enlaceDescarga.href = URL.createObjectURL(blob);
        enlaceDescarga.download = `reservas-${datos.slug || "negocio"}-qr.png`;
        document.body.appendChild(enlaceDescarga);
        enlaceDescarga.click();
        document.body.removeChild(enlaceDescarga);
        setTimeout(() => URL.revokeObjectURL(enlaceDescarga.href), 10000);
      }, "image/png");
    } catch (err) {
      setDescargandoQr(false);
      setErrorQr(err instanceof Error ? err.message : "No se pudo generar el afiche");
    }
  }

  return (
    <Tarjeta className="campos-grises flex flex-col gap-4 !border-2 !border-azul/50">
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

          <button
            type="button"
            onClick={() => setMostrarQr(true)}
            className={`mt-2 w-full ${clasesBoton("suave", "sm")}`}
          >
            <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" />
            </svg>
            Ver código QR
          </button>

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

      {/* ---------- QR de la página de reservas ---------- */}
      {mostrarQr && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QR de tu página de reservas"
          className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
          onClick={() => setMostrarQr(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-linea bg-superficie p-5 shadow-alta"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[1.05rem] font-semibold tracking-titular text-tinta">Código QR</h3>
                <p className="text-[0.8rem] leading-snug text-tinta-media">
                  Pegalo en tu local o en tus redes: apuntan la cámara y entran directo a reservar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarQr(false)}
                aria-label="Cerrar"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-tinta-suave transition-colors hover:bg-papel-hundido hover:text-tinta"
              >
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 flex justify-center rounded-xl border border-linea bg-papel-suave p-5">
              {svgQr ? (
                <div
                  className="rounded-lg bg-white p-2.5"
                  // El SVG lo armamos acá mismo a partir del link de este negocio: no hay contenido externo.
                  dangerouslySetInnerHTML={{ __html: svgQr }}
                />
              ) : (
                <p className="text-[0.85rem] text-tinta-media">Generando…</p>
              )}
            </div>

            <button
              type="button"
              onClick={descargarQr}
              disabled={descargandoQr || !svgQr}
              className={`w-full ${clasesBoton("principal", "md")}`}
            >
              {descargandoQr ? "Generando…" : "Descargar afiche PNG"}
            </button>
            <p className="mt-2 text-center text-[0.72rem] text-tinta-suave">
              1200×1600 px · listo para imprimir en carta u oficio
            </p>
            {errorQr && <p className="mt-2 text-[0.82rem] font-medium text-peligro">{errorQr}</p>}

            <canvas ref={canvasQrRef} className="hidden" />
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
