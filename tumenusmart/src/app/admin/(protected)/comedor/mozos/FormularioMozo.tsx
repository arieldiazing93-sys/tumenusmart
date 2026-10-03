"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { actualizarMozo, crearMozo } from "./actions";

export type MozoFila = {
  id: string;
  nombre: string;
  apellido: string | null;
  activo: boolean;
  sinPin: boolean;
};

/** Un PIN de 5 números al azar, para no tener que inventarlo (más largo se repite menos y es más difícil de adivinar). */
function pinAlAzar(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
}

/**
 * El alta y la edición de un mozo, dentro del panel lateral: su nombre y el PIN con el que entra al enlace. El PIN no se
 * guarda (solo su huella): al editar, dejarlo vacío conserva el que ya tenía. Si el mozo se va, se desactiva: su PIN deja
 * de funcionar pero lo que cargó queda en las cuentas.
 */
export function FormularioMozo({ mozo, onCerrar }: { mozo: MozoFila | null; onCerrar: () => void }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const editando = mozo !== null;

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    iniciar(async () => {
      const resultado = mozo ? await actualizarMozo(mozo.id, datos) : await crearMozo(datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      onCerrar();
    });
  }

  const pedirPin = !editando || !!mozo?.sinPin;

  return (
    <form onSubmit={alEnviar} className="flex min-h-0 flex-1 flex-col">
      <div className="campos-grises flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" required defaultValue={mozo?.nombre ?? ""} maxLength={60} autoFocus />
        </Campo>
        <Campo etiqueta="Apellido (opcional)">
          <Entrada name="apellido" defaultValue={mozo?.apellido ?? ""} maxLength={60} />
        </Campo>

        <Campo
          etiqueta={pedirPin ? "PIN" : "Nuevo PIN (opcional)"}
          ayuda={
            pedirPin
              ? "De 4 a 6 números. Es lo que el mozo pone en su celular o tablet para entrar: no puede repetirse."
              : "Si lo dejás vacío, el mozo sigue entrando con el que ya tiene."
          }
        >
          <div className="flex gap-2">
            <Entrada
              name="pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="12345"
              required={pedirPin}
              maxLength={6}
            />
            <button type="button" onClick={() => setPin(pinAlAzar())} className={clasesBoton("suave", "md")}>
              Generar
            </button>
          </div>
        </Campo>

        {editando && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-linea bg-superficie px-3 py-2.5">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={mozo?.activo ?? true}
              className="mt-0.5 h-[18px] w-[18px] flex-none accent-brand"
            />
            <span className="text-[0.88rem] text-tinta">
              <strong className="font-semibold">Activo</strong>
              <span className="block text-[0.78rem] text-tinta-suave">
                Si lo desactivás, su PIN deja de funcionar en el enlace, pero lo que cargó antes queda en las cuentas.
              </span>
            </span>
          </label>
        )}

        {error && <MensajeError>{error}</MensajeError>}
      </div>

      <div className="flex flex-none items-center justify-end gap-2 border-t border-linea bg-superficie px-5 py-3">
        <button type="button" onClick={onCerrar} className={clasesBoton("peligro", "md")}>
          Cancelar
        </button>
        <button type="submit" disabled={pendiente} className={clasesBoton("principal", "md")}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
