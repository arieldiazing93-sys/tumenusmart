"use client";

import { useEffect, useState, useTransition } from "react";
import { Boton, Campo, Entrada, Selector, MensajeError } from "@/components/ui";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { crearCliente } from "./actions";

/**
 * Alta manual de un cliente nuevo, en ventana modal (mismo estilo que
 * ClienteEditarModal/ClienteFiscalModal del POS).
 *
 * A diferencia de ClienteEditarModal, acá el teléfono SÍ se carga (en la
 * edición no, porque ya lo trajo la primera compra) y no hay Clave que
 * mostrar todavía: se asigna recién al guardar.
 */
export function ClienteCrearModal({
  onCerrar,
  onCreado,
}: {
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [tipo, setTipo] = useState(TIPOS_IDENTIFICACION_FISCAL[0].valor);
  const [numeroIdent, setNumeroIdent] = useState("");
  const [tieneIdentificacion, setTieneIdentificacion] = useState(false);
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
      const r = await crearCliente({
        nombre,
        telefono,
        email,
        tipoIdentificacion: tieneIdentificacion ? tipo : "",
        numeroIdentificacion: tieneIdentificacion ? numeroIdent : "",
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onCreado();
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
        aria-label="Nuevo cliente"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-sm sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Nuevo cliente
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
          <Campo etiqueta="Nombre / Razón social">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </Campo>

          <Campo etiqueta="Teléfono" ayuda="Opcional — sirve para fidelización y para autocompletar en el POS">
            <Entrada
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="09xx xxx xxx"
            />
          </Campo>

          {tieneIdentificacion ? (
            <>
              <Campo etiqueta="Tipo">
                <Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {TIPOS_IDENTIFICACION_FISCAL.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.etiqueta}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="N° de RUC / Cédula / etc.">
                <Entrada value={numeroIdent} onChange={(e) => setNumeroIdent(e.target.value)} />
              </Campo>
              <button
                type="button"
                onClick={() => {
                  setTieneIdentificacion(false);
                  setNumeroIdent("");
                }}
                className="self-start text-[0.76rem] font-medium text-tinta-suave underline"
              >
                Quitar identificación fiscal
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setTieneIdentificacion(true)}
              className="self-start text-[0.76rem] font-medium text-brand-texto underline"
            >
              + Agregar identificación fiscal
            </button>
          )}

          <Campo etiqueta="Correo electrónico">
            <Entrada
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
            <Boton tam="lg" onClick={guardar} disabled={pending || !nombre.trim()} className="w-full">
              {pending ? "Creando…" : "Crear cliente"}
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
