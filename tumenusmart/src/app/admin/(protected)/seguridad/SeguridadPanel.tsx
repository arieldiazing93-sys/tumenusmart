"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MensajeError, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { EVENTOS_DE_SEGURIDAD, type EventoSeguridad } from "@/lib/seguridad";
import { guardarSeguridad } from "./actions";

/**
 * La lista de acciones que se pueden proteger, con una casilla cada una (como "Eventos de seguridad" de los sistemas de restaurante), y
 * quién puede dar la contraseña. Se guarda con un botón: nada cambia hasta tocarlo.
 */
export function SeguridadPanel({ activos, autorizantes }: { activos: string[]; autorizantes: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const guardados = EVENTOS_DE_SEGURIDAD.map((e) => e.id).filter((id) => activos.includes(id));
  const [elegidos, setElegidos] = useState<EventoSeguridad[]>(guardados);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const hayCambios = elegidos.length !== guardados.length || elegidos.some((e) => !guardados.includes(e));

  function alternar(id: EventoSeguridad) {
    setAviso(null);
    setElegidos((previos) => (previos.includes(id) ? previos.filter((e) => e !== id) : [...previos, id]));
  }

  function guardar() {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await guardarSeguridad(elegidos);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setAviso(elegidos.length > 0 ? "Listo: esas acciones ahora piden la contraseña de un usuario autorizado." : "Listo: ninguna acción pide contraseña.");
        router.refresh();
      } catch {
        setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3 !border-2 !border-azul/50">
        <p className="rotulo text-[0.78rem] font-bold">Pedir contraseña de un usuario autorizado para estos eventos</p>
        <div className="flex flex-col gap-2.5">
          {EVENTOS_DE_SEGURIDAD.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-linea px-3 py-2.5 hover:border-azul/40">
              <input
                type="checkbox"
                checked={elegidos.includes(e.id)}
                onChange={() => alternar(e.id)}
                className="mt-0.5 h-4 w-4 flex-none accent-azul"
              />
              <span className="min-w-0">
                <span className="block text-[0.92rem] font-semibold text-tinta">{e.etiqueta}</span>
                <span className="block text-[0.78rem] leading-snug text-tinta-suave">{e.detalle}</span>
              </span>
            </label>
          ))}
        </div>

        {error && <MensajeError>{error}</MensajeError>}
        {aviso && <p className="rounded-lg bg-exito-luz px-3 py-2 text-[0.82rem] font-medium text-exito">{aviso}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {hayCambios && <span className="text-[0.78rem] text-tinta-suave">Hay cambios sin guardar.</span>}
          <button type="button" disabled={pendiente || !hayCambios} onClick={guardar} className={`${clasesBoton("navegar")} disabled:opacity-50`}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2">
        <p className="rotulo text-[0.78rem] font-bold">Quién puede autorizar</p>
        {autorizantes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {autorizantes.map((a) => (
              <Pastilla key={a.id} color="azul">
                {a.nombre}
              </Pastilla>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
            No hay ningún usuario dueño activo: sin él nadie puede dar la contraseña.
          </p>
        )}
        <p className="text-[0.78rem] leading-snug text-tinta-suave">
          La contraseña que se pide es la de un usuario dueño de este local (la misma con la que entra al panel). Se escribe cada vez que se hace una de las
          acciones tildadas, aunque quien está en la caja sea el mismo dueño. Con 5 contraseñas incorrectas seguidas el cuadro se bloquea 3 minutos, y
          todo queda en la Bitácora (módulo Seguridad): quién pidió qué, quién lo autorizó y los intentos fallidos.
        </p>
      </Tarjeta>
    </div>
  );
}
