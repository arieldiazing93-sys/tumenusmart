"use client";

import { useEffect, useState, useTransition } from "react";
import { Boton, Campo, Entrada, MensajeError } from "@/components/ui";
import { etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { formatearNumero } from "@/lib/format";
import { actualizarCliente } from "./actions";

/**
 * Edición de un cliente ya existente, en ventana modal (mismo estilo que
 * ClienteFiscalModal/CobrarModal del POS).
 *
 * Clave y tipo+número de identificación quedan de solo lectura: son la
 * clave única del registro, y editarlos arriesgaría reasignar la identidad
 * de un cliente que ya tiene ventas pasadas. Solo se editan Nombre y
 * Correo.
 */
export function ClienteEditarModal({
  id,
  numero,
  nombre,
  email,
  tipoIdentificacion,
  numeroIdentificacion,
  onCerrar,
  onGuardado,
}: {
  id: string;
  numero: number | null;
  nombre: string;
  email: string | null;
  tipoIdentificacion: string | null;
  numeroIdentificacion: string | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [valorNombre, setValorNombre] = useState(nombre);
  const [valorEmail, setValorEmail] = useState(email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await actualizarCliente(id, { nombre: valorNombre, email: valorEmail });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onGuardado();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar cliente"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-sm sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Editar cliente
          </p>
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
          <Campo etiqueta="Clave">
            <Entrada value={numero != null ? formatearNumero(numero) : "—"} disabled />
          </Campo>

          <Campo etiqueta="Identificación fiscal">
            <Entrada
              value={
                tipoIdentificacion && numeroIdentificacion
                  ? `${etiquetaTipoIdentificacion(tipoIdentificacion)}: ${numeroIdentificacion}`
                  : "—"
              }
              disabled
            />
          </Campo>

          <Campo etiqueta="Nombre / Razón social">
            <Entrada value={valorNombre} onChange={(e) => setValorNombre(e.target.value)} autoFocus />
          </Campo>

          <Campo etiqueta="Correo electrónico">
            <Entrada
              type="email"
              value={valorEmail}
              onChange={(e) => setValorEmail(e.target.value)}
              placeholder="cliente@correo.com"
            />
          </Campo>

          {error && <MensajeError>{error}</MensajeError>}
        </div>

        <div className="mt-5 flex gap-2">
          <div className="flex-1">
            <Boton tono="fantasma" tam="lg" onClick={onCerrar} className="w-full">
              Cancelar
            </Boton>
          </div>
          <div className="flex-[2]">
            <Boton tam="lg" onClick={guardar} disabled={pending} className="w-full">
              {pending ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
