"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  const propuesto = normalizarSlug(texto);
  const cambia = propuesto !== slug && propuesto.length >= 2;

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
    <div className="rounded-xl border border-linea bg-white p-4">
      <p className="text-sm font-medium text-tinta-media">Dirección de la carta</p>

      <p className="mt-1 break-all font-mono text-[0.95rem] text-tinta">
        tumenusmart.vercel.app/<strong className="text-brand-texto">{slug}</strong>
      </p>

      {!abierto ? (
        <div className="mt-3">
          <Boton tono="navegar" tam="sm" onClick={() => setAbierto(true)}>
            Cambiar dirección
          </Boton>
        </div>
      ) : (
        <div className="mt-3">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
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
            <Boton onClick={guardar} disabled={!cambia || guardando} tam="sm">
              {guardando ? "Guardando…" : "Guardar dirección"}
            </Boton>
            <Boton
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
