"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Entrada, MensajeError } from "@/components/ui";

export type DatosClienteRapido = {
  nombre: string;
  telefono: string;
};

/**
 * Alta de un cliente nuevo en el momento de una venta a crédito (o de cualquier
 * venta con cliente), con lo mínimo para poder cobrarle después: nombre y
 * teléfono.
 *
 * No pega a la base: solo junta los datos y se los devuelve al padre por
 * `onGuardar`. El Customer real se crea cuando se confirma la venta (ver
 * registrarVenta en pos/actions.ts) — así una venta que se abandona antes de
 * cobrar no deja un cliente huérfano. Es el mismo criterio que
 * ClienteFiscalModal, pero para el cliente que se identifica por teléfono en
 * vez de por RUC.
 */
export function ClienteRapidoModal({
  nombreInicial,
  telefonoInicial,
  onCerrar,
  onGuardar,
}: {
  nombreInicial: string;
  telefonoInicial: string;
  onCerrar: () => void;
  onGuardar: (datos: DatosClienteRapido) => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [telefono, setTelefono] = useState(telefonoInicial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  function guardar() {
    if (!nombre.trim() || !telefono.trim()) {
      setError("Completá el nombre y el teléfono.");
      return;
    }
    onGuardar({ nombre: nombre.trim(), telefono: telefono.trim() });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo cliente"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-sm sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Nuevo cliente</p>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Campo etiqueta="Nombre">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </Campo>
          <Campo etiqueta="Teléfono" ayuda="Sirve para ubicarlo y cobrarle después.">
            <Entrada
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              placeholder="0981 234 567"
            />
          </Campo>
          <p className="text-[0.78rem] text-tinta-suave">
            El cliente queda guardado cuando se registra la venta.
          </p>
          {error && <MensajeError>{error}</MensajeError>}
        </div>

        <div className="mt-5 flex gap-2">
          <div className="flex-1">
            <Boton tono="fantasma" tam="lg" onClick={onCerrar} className="w-full">
              Cancelar
            </Boton>
          </div>
          <div className="flex-[2]">
            <Boton tam="lg" onClick={guardar} className="w-full">
              Crear cliente
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
