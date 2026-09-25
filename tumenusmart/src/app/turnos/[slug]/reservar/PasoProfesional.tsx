"use client";

import { useEffect, useState } from "react";
import { AvatarPersonal } from "@/app/admin/(protected)/agenda/AvatarPersonal";
import { diaLargo } from "@/lib/agenda";
import type { PersonalPublico, ProximaDisponibilidad, ServicioPublico } from "@/lib/reserva-cliente";
import { proximaDisponibilidad } from "../actions";

/**
 * Paso 2: elegir quién realiza los servicios. Solo aparecen los profesionales que
 * realizan TODOS los servicios elegidos, cada uno con su próxima disponibilidad y
 * las primeras horas libres. Tocar una de esas horas lo elige y la deja marcada
 * para el paso siguiente, donde también se puede elegir otro día.
 */
export function PasoProfesional({
  slug,
  servicios,
  personal,
  personalId,
  onElegir,
}: {
  slug: string;
  servicios: ServicioPublico[];
  personal: PersonalPublico[];
  personalId: string | null;
  /** `sugerida` es la hora que se tocó, si se tocó una. */
  onElegir: (personalId: string, sugerida?: { fecha: string; hora: string }) => void;
}) {
  const elegibles = personal.filter((p) => servicios.every((s) => s.personalIds.includes(p.id)));
  const clave = servicios.map((s) => s.id).join(",");

  const [proximas, setProximas] = useState<ProximaDisponibilidad[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setProximas(null);
    setError(null);
    proximaDisponibilidad(slug, clave.split(",")).then((r) => {
      if (cancelado) return;
      if (r.ok) setProximas(r.proximas);
      else setError(r.error);
    });
    return () => {
      cancelado = true;
    };
  }, [slug, clave]);

  // Con un solo profesional posible, ya queda elegido.
  useEffect(() => {
    if (proximas && elegibles.length === 1 && personalId === null && proximas[0]?.fecha) {
      onElegir(elegibles[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proximas]);

  if (elegibles.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-linea bg-papel-suave px-5 py-10 text-center text-[0.9rem] text-tinta-media">
        Ningún profesional realiza todos esos servicios juntos. Volvé y elegí menos servicios, o pedilos en citas
        separadas.
      </p>
    );
  }
  if (error) {
    return <p className="rounded-lg bg-peligro-luz p-3 text-[0.88rem] text-peligro">{error}</p>;
  }
  if (proximas === null) {
    return (
      <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Buscando horarios">
        {elegibles.map((p) => (
          <li key={p.id} className="h-28 animate-pulse rounded-xl border border-linea bg-papel-suave" />
        ))}
      </ul>
    );
  }

  return (
    <ul className="flex flex-col gap-3" role="radiogroup" aria-label="Profesional">
      {elegibles.map((p, i) => {
        const prox = proximas.find((x) => x.personalId === p.id);
        const disponible = !!prox?.fecha;
        const elegido = personalId === p.id;
        return (
          <li key={p.id}>
            <div
              role="radio"
              aria-checked={elegido}
              aria-disabled={!disponible}
              tabIndex={disponible ? 0 : -1}
              onClick={() => disponible && onElegir(p.id)}
              onKeyDown={(e) => {
                if (disponible && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onElegir(p.id);
                }
              }}
              className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                elegido ? "border-brand bg-brand-light/50" : "border-linea bg-superficie"
              } ${disponible ? "cursor-pointer hover:border-brand" : "opacity-60"}`}
            >
              <AvatarPersonal nombre={p.nombre} fotoUrl={p.fotoUrl} indice={i} className="h-12 w-12 text-[0.95rem]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[1rem] font-semibold text-tinta">{p.nombre}</p>
                {p.profesion && <p className="truncate text-[0.82rem] text-tinta-suave">{p.profesion}</p>}
                <p className="mt-2 text-[0.78rem] text-tinta-suave">
                  {prox?.fecha ? `Próxima disponibilidad: ${diaLargo(prox.fecha)}` : "Sin horarios disponibles por ahora"}
                </p>
                {prox?.fecha && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {prox.horas.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onElegir(p.id, { fecha: prox.fecha as string, hora: h });
                        }}
                        className="cifra rounded-lg border border-brand px-3 py-1.5 text-[0.82rem] font-medium text-brand-texto transition-colors hover:bg-brand-light"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span
                aria-hidden="true"
                className={`mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${
                  elegido ? "border-brand" : "border-linea"
                }`}
              >
                {elegido && <span className="h-3 w-3 rounded-full bg-brand" />}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
