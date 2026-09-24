"use client";

import { clasesBoton } from "@/components/ui";
import { useState, useTransition } from "react";
import { activarLocal, alternarSuspension, registrarPago } from "./actions";
import { FichaLocalModal, type FichaLocal } from "./FichaLocalModal";

const CAMPO =
  "rounded-lg border border-linea px-2 py-1 text-sm focus:border-brand focus:outline-none";

export function AccionesLocal({
  storeId,
  nombre,
  suspendidoAMano,
  sinActivar,
  venceSiSeActivaHoy,
  linkRecordatorio,
  ficha,
  asesores,
}: {
  storeId: string;
  nombre: string;
  suspendidoAMano: boolean;
  /** Sin fecha de vencimiento todavía: no corre el plazo hasta que se lo active. */
  sinActivar: boolean;
  /** Fecha (ya formateada) hasta la que quedaría si se lo activa hoy. */
  venceSiSeActivaHoy: string;
  /** Enlace de WhatsApp con el mensaje ya escrito, o null si no hay número. */
  linkRecordatorio: string | null;
  /** Todo lo que se muestra (y se puede editar) en el modal "Ver". */
  ficha: FichaLocal;
  /** Asesores activos, para reasignar desde el modal. */
  asesores: { id: string; nombre: string }[];
}) {
  const [pendiente, iniciar] = useTransition();
  const [cobrando, setCobrando] = useState(false);
  const [viendo, setViendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function correr(
    accion: () => Promise<{ ok: true } | { ok: false; error: string }>,
    exito?: string
  ) {
    setAviso(null);
    iniciar(async () => {
      const resultado = await accion();
      if (!resultado.ok) {
        setAviso(resultado.error);
        return;
      }
      if (exito) setAviso(exito);
      setCobrando(false);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {/*
          "Ver" abre la ficha completa del local en un modal, y desde ahí se
          editan sus datos (reemplaza al viejo "Editar datos" en línea, que
          solo llegaba a los cuatro campos del titular).
        */}
        <button
          type="button"
          onClick={() => setViendo(true)}
          className={clasesBoton("navegar", "sm")}
        >
          Ver
        </button>

        {/*
          Mientras el local no tiene fecha de vencimiento, "Activar" es LA acción:
          ahí empieza a correr su plazo. "Registrar pago" queda como secundaria
          (registrar un pago también activa, contando desde hoy los meses pagados).
        */}
        {sinActivar && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              const texto =
                `¿Activar ${nombre}? Desde hoy empieza a correr su plan y vence el ${venceSiSeActivaHoy}.`;
              if (!confirm(texto)) return;
              correr(() => activarLocal(storeId));
            }}
            className={clasesBoton("violeta", "sm")}
          >
            Activar
          </button>
        )}

        <button
          type="button"
          disabled={pendiente}
          onClick={() => setCobrando((v) => !v)}
          className={clasesBoton(sinActivar ? "suave" : "principal", "sm")}
        >
          Registrar pago
        </button>

        {/*
          Las cuatro acciones con la misma forma de píldora (borde + fondo
          tenue), aunque cada una tenga su propio color — antes "Recordar" y
          "Suspender" eran texto subrayado suelto, y al lado del botón lleno
          de "Registrar pago" se leían como que no se podían tocar igual.
        */}
        {linkRecordatorio && (
          <a
            href={linkRecordatorio}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-exito/30 bg-exito-luz px-3 py-1.5 text-sm font-medium text-exito transition-colors hover:bg-exito hover:text-white"
          >
            Recordar por WhatsApp
          </a>
        )}

        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            const texto = suspendidoAMano
              ? `¿Reactivar ${nombre}? Su carta vuelve a tomar pedidos.`
              : `¿Suspender ${nombre}? Su carta deja de tomar pedidos hasta que lo reactives.`;
            if (!confirm(texto)) return;
            correr(() => alternarSuspension(storeId, !suspendidoAMano));
          }}
          className={
            suspendidoAMano
              ? "rounded-lg border border-exito/30 bg-exito-luz px-3 py-1.5 text-sm font-medium text-exito transition-colors hover:bg-exito hover:text-white disabled:opacity-50"
              : "rounded-lg border border-peligro/30 bg-peligro-luz px-3 py-1.5 text-sm font-medium text-peligro transition-colors hover:bg-peligro hover:text-white disabled:opacity-50"
          }
        >
          {suspendidoAMano ? "Reactivar" : "Suspender"}
        </button>
      </div>

      {cobrando && (
        <form
          action={(datos) =>
            correr(() => registrarPago(storeId, datos), "Pago registrado.")
          }
          className="flex flex-wrap items-end justify-end gap-2 rounded-lg border border-linea bg-papel-suave p-2"
        >
          <label className="flex flex-col gap-0.5 text-xs text-tinta-media">
            Meses
            <input
              type="number"
              name="meses"
              min="1"
              max="24"
              defaultValue="1"
              onWheel={(e) => e.currentTarget.blur()}
              className={`${CAMPO} w-16`}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-tinta-media">
            Monto (Gs.)
            <input
              type="text"
              name="monto"
              inputMode="numeric"
              placeholder="150000"
              className={`${CAMPO} w-28`}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs text-tinta-media">
            Nota
            <input
              type="text"
              name="nota"
              placeholder="N° transferencia"
              className={`${CAMPO} w-36`}
            />
          </label>
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-lg bg-noche px-3 py-1.5 text-sm font-medium text-white hover:bg-noche-panel disabled:opacity-50"
          >
            Guardar
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              setCobrando(false);
              setAviso(null);
            }}
            className="rounded-lg border border-linea bg-white px-3 py-1.5 text-sm font-medium text-tinta-media transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
          >
            Cancelar
          </button>
        </form>
      )}

      {aviso && <p className="text-xs text-tinta-media">{aviso}</p>}

      {viendo && (
        <FichaLocalModal ficha={ficha} asesores={asesores} onCerrar={() => setViendo(false)} />
      )}
    </div>
  );
}
