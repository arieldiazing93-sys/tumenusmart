"use client";

import { useEffect } from "react";
import { Boton, Campo, Entrada } from "@/components/ui";
import { etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { formatearNumero } from "@/lib/format";

/**
 * Ficha del cliente, de solo lectura — lo que se abre con "Ver" en la
 * lista. Desde acá se pasa a "Editar" si hace falta corregir algo, mismo
 * criterio que la ficha de Personal (Ver primero, Editar aparte).
 */
export function ClienteVerModal({
  numero,
  nombre,
  email,
  telefono,
  tipoIdentificacion,
  numeroIdentificacion,
  fotoUrl,
  onCerrar,
  onEditar,
}: {
  numero: number | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  tipoIdentificacion: string | null;
  numeroIdentificacion: string | null;
  fotoUrl: string | null;
  onCerrar: () => void;
  onEditar: () => void;
}) {
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ver cliente"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-sm sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Cliente</p>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex flex-col items-center gap-2 border-b border-linea pb-4">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-linea bg-papel-suave">
            {fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoUrl} alt={`Último peinado de ${nombre}`} className="h-full w-full object-cover" />
            ) : (
              <span className="px-2 text-center text-[0.7rem] text-tinta-suave">Sin foto de su último peinado</span>
            )}
          </div>
          <p className="text-[1.05rem] font-semibold text-tinta">{nombre}</p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Campo etiqueta="Clave">
            <Entrada value={numero != null ? formatearNumero(numero) : "—"} disabled />
          </Campo>
          <Campo etiqueta="Teléfono">
            <Entrada value={telefono ?? "—"} disabled />
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
          <Campo etiqueta="Correo electrónico">
            <Entrada value={email ?? "—"} disabled />
          </Campo>
        </div>

        <div className="mt-5 flex gap-2">
          <div className="flex-1">
            <Boton tono="fantasma" tam="lg" onClick={onCerrar} className="w-full">
              Cerrar
            </Boton>
          </div>
          <div className="flex-[2]">
            <Boton tono="navegar" tam="lg" onClick={onEditar} className="w-full">
              Editar
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
