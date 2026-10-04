"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { pinDemasiadoFacil } from "@/lib/asistencia";
import { actualizarMozo, crearMozo } from "./actions";

export type MozoFila = {
  id: string;
  nombre: string;
  apellido: string | null;
  activo: boolean;
  sinPin: boolean;
};

/**
 * Un PIN de 5 números al azar (el máximo que se acepta), para no tener que inventarlo. Con el generador seguro del navegador,
 * no con Math.random, que es predecible; si sale uno demasiado fácil (11111, 12345) se tira de nuevo.
 */
function pinAlAzar(): string {
  for (let intento = 0; intento < 20; intento++) {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const pin = String(10000 + (n[0] % 90000));
    if (!pinDemasiadoFacil(pin)) return pin;
  }
  return "73920";
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
              ? "De 3 a 5 números (solo números). Es lo que el mozo pone en su celular o tablet para entrar: no puede repetirse. Una forma fácil: los últimos 3 de su cédula o de su teléfono."
              : "Si lo dejás vacío, el mozo sigue entrando con el que ya tiene."
          }
        >
          <div className="flex gap-2">
            <Entrada
              name="pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 5))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej: 482"
              required={pedirPin}
              maxLength={5}
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
        <button type="submit" disabled={pendiente} className={clasesBoton(editando ? "navegar" : "nuevo", "md")}>
          {pendiente ? "Guardando…" : editando ? "Guardar" : "Crear mozo"}
        </button>
      </div>
    </form>
  );
}
