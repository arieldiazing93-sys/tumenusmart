"use client";

import { clasesBoton } from "@/components/ui";
import { useState, useTransition } from "react";
import { alternarSuspension, registrarPago } from "./actions";

const CAMPO =
  "rounded-lg border border-linea px-2 py-1 text-sm focus:border-brand focus:outline-none";

export function AccionesLocal({
  storeId,
  nombre,
  suspendidoAMano,
  linkRecordatorio,
}: {
  storeId: string;
  nombre: string;
  suspendidoAMano: boolean;
  /** Enlace de WhatsApp con el mensaje ya escrito, o null si no hay número. */
  linkRecordatorio: string | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const [cobrando, setCobrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function correr(accion: () => Promise<unknown>, exito?: string) {
    setAviso(null);
    iniciar(async () => {
      try {
        await accion();
        if (exito) setAviso(exito);
        setCobrando(false);
      } catch (err) {
        setAviso(err instanceof Error ? err.message : "No se pudo completar");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          disabled={pendiente}
          onClick={() => setCobrando((v) => !v)}
          className={clasesBoton("principal", "sm")}
        >
          Registrar pago
        </button>

        {linkRecordatorio && (
          <a
            href={linkRecordatorio}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-exito hover:underline"
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
              ? "text-exito hover:underline disabled:opacity-50"
              : "text-peligro hover:underline disabled:opacity-50"
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
        </form>
      )}

      {aviso && <p className="text-xs text-tinta-media">{aviso}</p>}
    </div>
  );
}
