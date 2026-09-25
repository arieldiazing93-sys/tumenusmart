"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pastilla, clasesBoton } from "@/components/ui";
import { Interruptor } from "@/components/Interruptor";
import { formatearTelefonoPersonal, nombreCompleto, type MiembroFila } from "@/lib/agenda-personal";
import { resumenDeHorario, type HorarioDia } from "@/lib/horario-trabajo";
import { AvatarPersonal } from "../AvatarPersonal";
import { darHorarioPropio, usarHorarioGeneral } from "../horario/actions";
import { EnlaceTrabajoPersonal } from "./EnlaceTrabajoPersonal";
import { TrabajosYComision } from "./TrabajosYComision";

function textoPorcentaje(valor: number): string {
  return String(valor).replace(".", ",");
}

function Dato({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-papel-suave px-3 py-2.5">
      <dt className="text-[0.7rem] font-medium text-tinta-suave">{rotulo}</dt>
      <dd className="cifra mt-0.5 truncate text-[0.92rem] font-semibold text-tinta">{children}</dd>
    </div>
  );
}

/** La semana en pocas líneas: "Lun a Vie · 09:00 a 18:00 · descanso 13:00 a 14:00". */
function ResumenSemana({ horario, apagado = false }: { horario: HorarioDia[]; apagado?: boolean }) {
  return (
    <ul className="flex flex-col gap-1">
      {resumenDeHorario(horario).map((linea) => (
        <li key={linea.dias} className="flex items-baseline gap-3 text-[0.82rem]">
          <span className={`w-[5.5rem] flex-none font-semibold ${apagado ? "text-tinta-suave" : "text-tinta"}`}>
            {linea.dias}
          </span>
          <span className={`cifra min-w-0 ${apagado ? "text-tinta-suave" : "text-tinta-media"}`}>{linea.horas}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * El horario de esta persona: por defecto usa el horario general del negocio; con el interruptor "Horario propio"
 * pasa a tener el suyo (un turno completo, uno intermedio, uno de tarde y noche…) y aparece el botón para
 * configurarlo, que lleva a la pantalla del horario de esa persona.
 */
function BloqueHorario({ miembro, horarioGeneral }: { miembro: MiembroFila; horarioGeneral: HorarioDia[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);

  const propio = miembro.horarioPropio;
  const irAlHorario = `/admin/agenda/horario?personal=${miembro.id}`;

  function cambiar(activar: boolean) {
    setError(null);
    if (!activar) {
      // Se pierde lo que se configuró: antes se pide confirmación.
      setConfirmandoQuitar(true);
      return;
    }
    iniciar(async () => {
      const r = await darHorarioPropio(miembro.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(irAlHorario);
    });
  }

  function quitar() {
    setError(null);
    iniciar(async () => {
      const r = await usarHorarioGeneral(miembro.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmandoQuitar(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-lg border border-linea bg-superficie p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.92rem] font-semibold text-tinta">Horario de trabajo</p>
          <p className="mt-0.5 text-[0.78rem] leading-snug text-tinta-suave">
            {propio
              ? "Tiene su propio horario: los días, las horas y el descanso que le pongas valen solo para esta persona."
              : "Hoy usa el horario general del local. Activá el interruptor para configurarle el suyo."}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2 pt-0.5">
          <span className="text-[0.78rem] font-medium text-tinta-media">Horario propio</span>
          <Interruptor
            activo={propio !== null}
            onChange={cambiar}
            etiqueta={`Horario propio de ${nombreCompleto(miembro)}`}
            tono="azul"
            deshabilitado={pendiente}
          />
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-papel-suave px-3 py-2.5">
        <ResumenSemana horario={propio ?? horarioGeneral} apagado={propio === null} />
      </div>

      {propio && !confirmandoQuitar && (
        <div className="mt-3">
          <Link href={irAlHorario} className={clasesBoton("navegar", "sm")}>
            Configurar horario
          </Link>
        </div>
      )}

      {confirmandoQuitar && (
        <div className="mt-3 rounded-lg border border-aviso/30 bg-aviso-luz p-3">
          <p className="text-[0.84rem] font-semibold text-aviso">¿Volver al horario general?</p>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Se pierde el horario propio de {miembro.nombre}: pasa a atender según el horario general del local.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmandoQuitar(false)}
              disabled={pendiente}
              className={clasesBoton("suave", "sm")}
            >
              Cancelar
            </button>
            <button type="button" onClick={quitar} disabled={pendiente} className={clasesBoton("peligro", "sm")}>
              {pendiente ? "Quitando…" : "Sí, volver al general"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[0.78rem] font-medium text-peligro">{error}</p>}
    </section>
  );
}

/**
 * Lo que se ve al tocar "Ver" en un miembro del personal: su información completa (datos, comisión, horario,
 * trabajos terminados, enlace de trabajo). Desde acá se pasa a editar sus datos y a configurar su horario.
 */
export function FichaPersonal({
  miembro,
  indice,
  horarioGeneral,
  onEditar,
  onCerrar,
}: {
  miembro: MiembroFila;
  /** Su posición en la lista, para darle su color al avatar. */
  indice: number;
  /** El horario general del negocio (el que usa quien no tiene uno propio). */
  horarioGeneral: HorarioDia[];
  onEditar: () => void;
  onCerrar: () => void;
}) {
  const nombre = nombreCompleto(miembro);
  const telefono = formatearTelefonoPersonal(miembro.telefono);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {/* ---------- quién es ---------- */}
        <div className="flex items-center gap-4">
          <AvatarPersonal nombre={nombre} fotoUrl={miembro.fotoUrl} indice={indice} className="h-20 w-20 text-[1.4rem]" />
          <div className="min-w-0">
            <h3 className="truncate text-[1.15rem] font-semibold tracking-titular text-tinta">{nombre}</h3>
            <p className="truncate text-[0.88rem] text-tinta-media">{miembro.profesion || "Sin profesión cargada"}</p>
            <span className="mt-1.5 inline-block">
              <Pastilla color={miembro.activo ? "exito" : "neutro"} punto>
                {miembro.activo ? "Activo" : "Inactivo"}
              </Pastilla>
            </span>
          </div>
        </div>

        {/* ---------- datos ---------- */}
        <dl className="grid grid-cols-2 gap-2">
          <Dato rotulo="Teléfono">{telefono || "—"}</Dato>
          <Dato rotulo="Comisión">
            {miembro.comisionPorcentaje != null ? `${textoPorcentaje(miembro.comisionPorcentaje)} %` : "No cobra"}
          </Dato>
          <Dato rotulo="Servicios que realiza">{miembro.servicios}</Dato>
          <Dato rotulo="Citas">{miembro.citas}</Dato>
        </dl>
        <p className="-mt-2 text-[0.76rem] leading-snug text-tinta-suave">
          La comisión se calcula solo sobre los servicios: los productos que se lleve el cliente no suman.
        </p>

        {/* ---------- horario ---------- */}
        <BloqueHorario miembro={miembro} horarioGeneral={horarioGeneral} />

        {/* ---------- sus trabajos y su enlace ---------- */}
        <TrabajosYComision id={miembro.id} />
        <EnlaceTrabajoPersonal
          id={miembro.id}
          nombre={miembro.nombre}
          telefono={miembro.telefono}
          activo={miembro.activo}
        />
      </div>

      {/* ---------- pie fijo ---------- */}
      <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-5 py-4">
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={clasesBoton("suave", "md")}>
            Cerrar
          </button>
          <button type="button" onClick={onEditar} className={clasesBoton("principal", "md")}>
            Editar datos
          </button>
        </div>
      </div>
    </div>
  );
}
