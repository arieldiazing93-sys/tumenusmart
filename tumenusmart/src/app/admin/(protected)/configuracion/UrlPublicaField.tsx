"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Boton } from "@/components/ui";
import { normalizarSlug } from "@/lib/alcance-local";
import { cambiarUrlPublica } from "./actions";

/**
 * Cambiar la dirección pública de la carta.
 *
 * Arranca cerrado y hay que apretar "Cambiar" para que aparezca el campo. No
 * es un capricho: es el único dato del panel que rompe cosas que ya están
 * afuera —carteles impresos, enlaces compartidos— y un campo suelto entre los
 * demás se toca sin pensar.
 *
 * Mientras se escribe se muestra la dirección REAL que va a quedar, no lo que
 * se tipeó. "La Esquina del Fabri" se convierte en "la-esquina-del-fabri", y
 * es mejor que eso se vea antes de guardar y no después.
 */
export function UrlPublicaField({ slug }: { slug: string }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(slug);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const router = useRouter();

  // Se lee del navegador y no queda escrito a mano: así, el día que el
  // dominio cambie (de tumenusmart.vercel.app a uno propio), esta pantalla
  // no se queda mostrando la dirección vieja sin que nadie se acuerde de
  // venir a tocarla.
  const [dominio, setDominio] = useState("tumenusmart.vercel.app");
  useEffect(() => {
    setDominio(window.location.host);
  }, []);

  const propuesto = normalizarSlug(texto);
  const cambia = propuesto !== slug && propuesto.length >= 2;

  // "Copiar dirección": copia la dirección completa (con https://) para pegarla en WhatsApp, un cartel o donde haga falta.
  const [copiado, setCopiado] = useState<"copiado" | "fallo" | null>(null);
  async function copiar() {
    const direccion = `${window.location.origin}/${slug}`;
    let listo = false;
    try {
      await navigator.clipboard.writeText(direccion);
      listo = true;
    } catch {
      // Sin permiso del portapapeles (por ejemplo, una página sin https): se prueba con el método viejo.
      try {
        const auxiliar = document.createElement("textarea");
        auxiliar.value = direccion;
        auxiliar.setAttribute("readonly", "");
        auxiliar.style.position = "fixed";
        auxiliar.style.opacity = "0";
        document.body.appendChild(auxiliar);
        auxiliar.select();
        listo = document.execCommand("copy");
        document.body.removeChild(auxiliar);
      } catch {
        listo = false;
      }
    }
    setCopiado(listo ? "copiado" : "fallo");
    if (listo) setTimeout(() => setCopiado(null), 2500);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    const fd = new FormData();
    fd.set("slug", texto);
    const r = await cambiarUrlPublica(fd);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo cambiar");
      return;
    }
    setAbierto(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-azul/40 bg-white p-4">
      <p className="text-sm font-medium text-tinta-media">Dirección de la carta</p>

      <p className="mt-1 break-all font-mono text-[0.95rem] text-tinta">
        {dominio}/<strong className="text-brand-texto">{slug}</strong>
      </p>

      {!abierto ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* type="button": esto vive dentro del formulario de Datos del negocio y sin eso cada botón lo enviaría. */}
          <Boton type="button" tono="navegar" tam="sm" onClick={copiar}>
            {copiado === "copiado" ? "¡Dirección copiada!" : "Copiar dirección"}
          </Boton>
          <Boton type="button" tono="navegar" tam="sm" onClick={() => setAbierto(true)}>
            Cambiar dirección
          </Boton>
          {copiado === "fallo" && (
            <span role="alert" className="text-[0.8rem] font-medium text-peligro">
              No se pudo copiar solo: seleccioná la dirección de arriba y copiala.
            </span>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              // Enter acá no debe enviar todo el formulario de Datos del negocio: guarda solo la dirección.
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (cambia && !guardando) void guardar();
            }}
            autoFocus
            aria-label="Nueva dirección de la carta"
            className="w-full rounded-lg border border-linea px-3 py-2"
          />

          <p className="mt-2 text-[0.82rem] text-tinta-media">
            Va a quedar como{" "}
            <span className="font-mono text-tinta">
              /{propuesto || "…"}
            </span>
          </p>

          <div className="mt-3 rounded-lg border border-azul/25 bg-azul-luz p-3">
            <p className="text-[0.82rem] leading-relaxed text-tinta-media">
              <strong className="font-semibold text-azul-oscuro">
                La dirección de ahora va a seguir funcionando.
              </strong>{" "}
              Los carteles con QR ya impresos y los enlaces que andan dando vueltas
              por WhatsApp van a traer igual a la carta — entran por la vieja y
              llegan a la nueva solos.
            </p>
          </div>

          {error && (
            <p className="mt-2 text-[0.85rem] font-medium text-peligro">{error}</p>
          )}

          <div className="mt-3 flex gap-2">
            <Boton type="button" tono="navegar" onClick={guardar} disabled={!cambia || guardando} tam="sm">
              {guardando ? "Guardando…" : "Guardar dirección"}
            </Boton>
            <Boton
              type="button"
              tono="fantasma"
              tam="sm"
              onClick={() => {
                setAbierto(false);
                setTexto(slug);
                setError(null);
              }}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
