"use client";

import { useEffect, useState } from "react";
import { AvatarPersonal } from "@/app/admin/(protected)/agenda/AvatarPersonal";
import { diaLargo } from "@/lib/agenda";
import type { PersonalPublico, ProximaDisponibilidad, ServicioPublico } from "@/lib/reserva-cliente";
import { proximaDisponibilidad } from "../actions";
import { IconoCheck } from "../Iconos";

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
      <p className="rounded-2xl border border-dashed border-linea bg-papel-suave px-5 py-10 text-center text-[0.9rem] text-tinta-media">
        Ningún profesional realiza todos esos servicios juntos. Volvé y elegí menos servicios, o pedilos en citas
        separadas.
      </p>
    );
  }
  if (error) {
    return <p className="rounded-xl bg-peligro-luz p-3.5 text-[0.88rem] text-peligro">{error}</p>;
  }
  if (proximas === null) {
    return (
      <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Buscando horarios">
        {elegibles.map((p) => (
          <li key={p.id} className="h-36 animate-pulse rounded-2xl bg-papel-hundido" />
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
              className={`flex items-start gap-3.5 rounded-2xl p-4 shadow-sm transition-all ${
                elegido ? "bg-brand/5 ring-2 ring-brand" : "bg-superficie ring-1 ring-linea"
              } ${disponible ? "cursor-pointer hover:ring-brand/50 active:scale-[0.99]" : "opacity-60"}`}
            >
              <AvatarPersonal nombre={p.nombre} fotoUrl={p.fotoUrl} indice={i} className="h-16 w-16 text-[1.15rem]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[1.08rem] font-semibold tracking-titular text-tinta">{p.nombre}</p>
                {p.profesion && <p className="truncate text-[0.85rem] text-tinta-suave">{p.profesion}</p>}
                <p className="mt-2.5 flex items-center gap-1.5 text-[0.8rem] text-tinta-media">
                  <span aria-hidden="true" className={`h-2 w-2 flex-none rounded-full ${prox?.fecha ? "bg-exito" : "bg-tinta-suave"}`} />
                  {prox?.fecha ? `Próxima disponibilidad: ${diaLargo(prox.fecha)}` : "Sin horarios disponibles por ahora"}
                </p>
                {prox?.fecha && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {prox.horas.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onElegir(p.id, { fecha: prox.fecha as string, hora: h });
                        }}
                        className="cifra rounded-xl bg-brand-light px-3.5 py-2 text-[0.86rem] font-semibold text-brand-texto transition-all hover:bg-brand hover:text-white active:scale-95"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span
                aria-hidden="true"
                className={`mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 transition-all ${
                  elegido ? "border-brand bg-brand text-white" : "border-linea text-transparent"
                }`}
              >
                <IconoCheck tam={16} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
