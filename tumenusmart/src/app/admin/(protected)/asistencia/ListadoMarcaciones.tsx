"use client";

import { useEffect, useState } from "react";
import { Pastilla, clasesBoton } from "@/components/ui";
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

const ESTADOS: Record<EstadoTurno, { texto: string; clases: string }> = {
  completo: { texto: "Completo", clases: "bg-exito-luz text-exito" },
  en_curso: { texto: "En el trabajo", clases: "bg-azul-luz text-azul-oscuro" },
  incompleto: { texto: "Incompleto", clases: "bg-peligro-luz text-peligro" },
};

type Abierta = { fila: FilaAsistencia; tipo: TipoMarcacion } | null;

/** "Jue 02/10": el día en poco lugar (el nombre largo va en la foto ampliada). */
function diaCorto(f: FilaAsistencia): string {
  return `${f.diaTexto.slice(0, 3)} ${f.dia.slice(8, 10)}/${f.dia.slice(5, 7)}`;
}

/** Un horario que se puede tocar para ver la foto de esa marcación. Sin marcación: un guion. */
function BotonHora({ celda, alAbrir }: { celda: CeldaMarca | null; alAbrir: () => void }) {
  if (!celda) return <span className="text-tinta-suave">—</span>;
  return (
    <button
      type="button"
      onClick={alAbrir}
      title="Ver la foto de esta marcación"
      className={`cifra inline-flex items-center gap-1 rounded border px-1.5 py-px text-[0.78rem] font-semibold leading-snug transition-colors ${
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

/** Una etiqueta de estado chica, de una línea. */
function Estado({ estado }: { estado: EstadoTurno }) {
  return (
    <span
      className={`inline-flex flex-none items-center whitespace-nowrap rounded-full px-2 py-px text-[0.68rem] font-semibold ${ESTADOS[estado].clases}`}
    >
      {ESTADOS[estado].texto}
    </span>
  );
}

/**
 * El listado de marcaciones, un turno por fila y compacto: las cuatro horas (cada una se toca para ver la foto), lo que
 * trabajó y lo que conviene revisar, todo en una o dos líneas para ver muchas personas de un vistazo. En pantalla ancha
 * es una tabla; en el celular, una tarjeta chica por turno.
 */
export function ListadoMarcaciones({ filas }: { filas: FilaAsistencia[] }) {
  const [abierta, setAbierta] = useState<Abierta>(null);

  return (
    <>
      {/* Pantalla ancha: tabla. */}
      <div className="hidden overflow-x-auto rounded-xl border-2 border-azul/50 bg-superficie md:block">
        <table className="w-full min-w-[40rem] border-collapse text-left text-[0.8rem]">
          <thead className="bg-papel-suave text-[0.68rem] uppercase tracking-wide text-tinta-suave">
            <tr>
              <th className="px-2.5 py-1.5 font-semibold">Día</th>
              <th className="px-2.5 py-1.5 font-semibold">Colaborador</th>
              {TIPOS_MARCACION.map((t) => (
                <th key={t} className="px-2.5 py-1.5 font-semibold">
                  {ETIQUETA_TIPO_CORTA[t]}
                </th>
              ))}
              <th className="px-2.5 py-1.5 text-right font-semibold">Trabajado</th>
              <th className="px-2.5 py-1.5 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.clave} className="border-t border-linea-fina transition-colors duration-100 hover:bg-papel-suave">
                <td className="whitespace-nowrap px-2.5 py-1 font-medium text-tinta-media">{diaCorto(f)}</td>
                <td className="px-2.5 py-1" title={f.cargo ?? undefined}>
                  <div className="flex items-center gap-2">
                    <AvatarPersonal nombre={f.nombre} fotoUrl={f.fotoAlta} indice={i} className="h-6 w-6 text-[0.6rem]" />
                    <span className="max-w-[12rem] truncate font-semibold text-tinta">{f.nombre}</span>
                  </div>
                </td>
                {TIPOS_MARCACION.map((t) => (
                  <td key={t} className="px-2.5 py-1">
                    <BotonHora celda={f.celdas[t]} alAbrir={() => setAbierta({ fila: f, tipo: t })} />
                  </td>
                ))}
                <td
                  className="cifra whitespace-nowrap px-2.5 py-1 text-right font-semibold text-tinta"
                  title={f.almuerzo !== "—" ? `Almuerzo: ${f.almuerzo}` : undefined}
                >
                  {f.trabajado}
                </td>
                <td className="px-2.5 py-1">
                  <div className="flex items-center gap-2">
                    <Estado estado={f.estado} />
                    {f.avisos.length > 0 && (
                      <span className="max-w-[16rem] truncate text-[0.7rem] text-aviso" title={f.avisos.join(" · ")}>
                        {f.avisos.join(" · ")}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular y tablet vertical: una tarjeta chica por turno. */}
      <ul className="flex flex-col gap-1.5 md:hidden">
        {filas.map((f, i) => (
          <li key={f.clave} className="rounded-lg border-2 border-azul/50 bg-superficie px-2.5 py-2">
            <div className="flex items-center gap-2">
              <AvatarPersonal nombre={f.nombre} fotoUrl={f.fotoAlta} indice={i} className="h-7 w-7 text-[0.65rem]" />
              <p className="min-w-0 flex-1 truncate text-[0.86rem] font-semibold text-tinta">
                {f.nombre} <span className="font-normal text-tinta-suave">· {diaCorto(f)}</span>
              </p>
              <Estado estado={f.estado} />
            </div>
            <dl className="mt-1.5 grid grid-cols-4 gap-1">
              {TIPOS_MARCACION.map((t) => (
                <div key={t} className="min-w-0">
                  <dt className="truncate text-[0.6rem] font-semibold uppercase tracking-wide text-tinta-suave">
                    {ETIQUETA_TIPO_CORTA[t]}
                  </dt>
                  <dd className="mt-0.5">
                    <BotonHora celda={f.celdas[t]} alAbrir={() => setAbierta({ fila: f, tipo: t })} />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[0.74rem] leading-snug">
              <span className="text-tinta-suave">
                Trabajado <strong className="cifra text-tinta">{f.trabajado}</strong>
              </span>
              {f.avisos.length > 0 && <span className="text-aviso">{f.avisos.join(" · ")}</span>}
            </p>
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
