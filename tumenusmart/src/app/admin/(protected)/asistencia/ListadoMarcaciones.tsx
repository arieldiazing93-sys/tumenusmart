"use client";

import { useEffect, useState } from "react";
import { Pastilla, Tabla, Td, Th, Tr, clasesBoton } from "@/components/ui";
import {
  ETIQUETA_TIPO,
  ETIQUETA_TIPO_CORTA,
  TIPOS_MARCACION,
  type CeldaMarca,
  type EstadoTurno,
  type FilaAsistencia,
  type TipoMarcacion,
} from "@/lib/asistencia";
import { AvatarPersonal } from "../agenda/AvatarPersonal";

const ESTADOS: Record<EstadoTurno, { texto: string; color: "exito" | "azul" | "peligro" }> = {
  completo: { texto: "Completo", color: "exito" },
  en_curso: { texto: "En el trabajo", color: "azul" },
  incompleto: { texto: "Incompleto", color: "peligro" },
};

type Abierta = { fila: FilaAsistencia; tipo: TipoMarcacion } | null;

/** Un horario que se puede tocar para ver la foto de esa marcación. Sin marcación: un guion. */
function BotonHora({ celda, alAbrir }: { celda: CeldaMarca | null; alAbrir: () => void }) {
  if (!celda) return <span className="text-tinta-suave">—</span>;
  return (
    <button
      type="button"
      onClick={alAbrir}
      title="Ver la foto de esta marcación"
      className={`cifra inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.84rem] font-semibold transition-colors ${
        celda.verificada
          ? "border-azul/35 bg-azul-luz text-azul-oscuro hover:border-azul hover:bg-azul hover:text-white"
          : "border-aviso/40 bg-aviso-luz text-aviso hover:border-aviso hover:bg-aviso hover:text-white"
      }`}
    >
      {celda.hora}
      {!celda.verificada && <span aria-label="La cámara no vio su cara">!</span>}
    </button>
  );
}

/**
 * El listado de marcaciones, un turno por fila: las cuatro horas (cada una se toca para ver la foto), lo que
 * trabajó y lo que conviene revisar. En pantalla ancha es una tabla; en el celular, una tarjeta por turno.
 */
export function ListadoMarcaciones({ filas }: { filas: FilaAsistencia[] }) {
  const [abierta, setAbierta] = useState<Abierta>(null);

  return (
    <>
      {/* Pantalla ancha: tabla. */}
      <div className="hidden md:block">
        <Tabla className="!border-2 !border-azul/50">
          <thead>
            <tr>
              <Th>Día</Th>
              <Th>Colaborador</Th>
              {TIPOS_MARCACION.map((t) => (
                <Th key={t}>{ETIQUETA_TIPO_CORTA[t]}</Th>
              ))}
              <Th className="text-right">Trabajado</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <Tr key={f.clave}>
                <Td className="whitespace-nowrap font-medium text-tinta">{f.diaTexto}</Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <AvatarPersonal nombre={f.nombre} fotoUrl={f.fotoAlta} indice={i} className="h-8 w-8 text-[0.7rem]" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-tinta">{f.nombre}</p>
                      {f.cargo && <p className="truncate text-[0.74rem] text-tinta-suave">{f.cargo}</p>}
                    </div>
                  </div>
                </Td>
                {TIPOS_MARCACION.map((t) => (
                  <Td key={t}>
                    <BotonHora celda={f.celdas[t]} alAbrir={() => setAbierta({ fila: f, tipo: t })} />
                  </Td>
                ))}
                <Td className="cifra whitespace-nowrap text-right font-semibold text-tinta">
                  {f.trabajado}
                  {f.almuerzo !== "—" && <span className="block text-[0.72rem] font-normal text-tinta-suave">almuerzo {f.almuerzo}</span>}
                </Td>
                <Td>
                  <div className="flex flex-col items-start gap-1">
                    <Pastilla color={ESTADOS[f.estado].color} punto>
                      {ESTADOS[f.estado].texto}
                    </Pastilla>
                    {f.avisos.map((a) => (
                      <span key={a} className="text-[0.74rem] leading-tight text-aviso">
                        {a}
                      </span>
                    ))}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      </div>

      {/* Celular y tablet vertical: una tarjeta por turno. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {filas.map((f, i) => (
          <li key={f.clave} className="rounded-xl border-2 border-azul/50 bg-superficie p-3">
            <div className="flex items-center gap-3">
              <AvatarPersonal nombre={f.nombre} fotoUrl={f.fotoAlta} indice={i} className="h-10 w-10 text-[0.8rem]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.92rem] font-semibold text-tinta">{f.nombre}</p>
                <p className="truncate text-[0.78rem] text-tinta-media">{f.diaTexto}</p>
              </div>
              <Pastilla color={ESTADOS[f.estado].color} punto>
                {ESTADOS[f.estado].texto}
              </Pastilla>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
              {TIPOS_MARCACION.map((t) => (
                <div key={t}>
                  <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-tinta-suave">
                    {ETIQUETA_TIPO_CORTA[t]}
                  </dt>
                  <dd className="mt-0.5">
                    <BotonHora celda={f.celdas[t]} alAbrir={() => setAbierta({ fila: f, tipo: t })} />
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-linea pt-2">
              <span className="text-[0.78rem] text-tinta-suave">Trabajado</span>
              <span className="cifra text-[0.92rem] font-semibold text-tinta">{f.trabajado}</span>
            </div>
            {f.avisos.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4 text-[0.76rem] leading-snug text-aviso">
                {f.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {abierta && <ModalFoto abierta={abierta} onCerrar={() => setAbierta(null)} />}
    </>
  );
}

/** La foto de una marcación al lado de la selfie del alta, para compararlas a ojo. */
function ModalFoto({ abierta, onCerrar }: { abierta: NonNullable<Abierta>; onCerrar: () => void }) {
  const { fila, tipo } = abierta;
  const celda = fila.celdas[tipo];

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [onCerrar]);

  if (!celda) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${ETIQUETA_TIPO[tipo]} de ${fila.nombre}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/50 p-4"
      onClick={onCerrar}
    >
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border-2 border-azul/50 bg-superficie p-5 shadow-alta"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[1.05rem] font-semibold tracking-titular text-tinta">{fila.nombre}</h3>
            <p className="text-[0.82rem] text-tinta-media">
              {ETIQUETA_TIPO[tipo]} · {fila.diaTexto} · <span className="cifra font-semibold text-tinta">{celda.hora}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-tinta-suave transition-colors hover:bg-papel-hundido hover:text-tinta"
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <figure>
            <div className="aspect-[3/4] overflow-hidden rounded-xl border border-linea bg-papel-hundido">
              {celda.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={celda.fotoUrl} alt="Foto de la marcación" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center p-3 text-center text-[0.8rem] text-tinta-suave">
                  Sin foto
                </div>
              )}
            </div>
            <figcaption className="mt-1 text-center text-[0.74rem] font-semibold text-tinta-media">Al marcar</figcaption>
          </figure>
          <figure>
            <div className="aspect-[3/4] overflow-hidden rounded-xl border border-linea bg-papel-hundido">
              {fila.fotoAlta ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fila.fotoAlta} alt="Selfie del alta" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center p-3 text-center text-[0.8rem] text-tinta-suave">
                  Sin foto
                </div>
              )}
            </div>
            <figcaption className="mt-1 text-center text-[0.74rem] font-semibold text-tinta-media">Selfie del alta</figcaption>
          </figure>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {celda.verificada ? (
            <Pastilla color="exito" punto>
              La cámara vio su cara
            </Pastilla>
          ) : (
            <Pastilla color="aviso" punto>
              La cámara no vio su cara: revisá la foto
            </Pastilla>
          )}
          {celda.tardanzaMin !== null && celda.tardanzaMin > 0 && (
            <Pastilla color="aviso">Llegó {celda.tardanzaMin} min tarde</Pastilla>
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onCerrar} className={clasesBoton("navegar", "md")}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
