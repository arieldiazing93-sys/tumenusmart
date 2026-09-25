"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Entrada, Selector, MensajeError } from "@/components/ui";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";

export type DatosClienteFiscal = {
  numeroIdentificacion: string;
  tipoIdentificacion: string;
  razonSocial: string;
  email: string;
};

/**
 * Alta de un cliente fiscal nuevo, en el momento de facturar.
 *
 * No pega a la base: solo junta los datos y se los devuelve al padre por
 * `onGuardar`. El Customer real recién se crea cuando se confirma el cobro
 * (ver registrarVenta en pos/actions.ts) — así una venta que se abandona
 * antes de cobrar no deja un cliente huérfano.
 *
 * La Clave no se puede mostrar todavía: sale de un contador que recién se
 * incrementa cuando el cliente se crea de verdad.
 *
 * Hoja desde abajo en el celular, cuadro centrado en pantallas más anchas.
 */
export function ClienteFiscalModal({
  numeroInicial,
  tipoInicial,
  onCerrar,
  onGuardar,
}: {
  numeroInicial: string;
  tipoInicial: string;
  onCerrar: () => void;
  onGuardar: (datos: DatosClienteFiscal) => void;
}) {
  const [numero, setNumero] = useState(numeroInicial);
  const [tipo, setTipo] = useState(tipoInicial);
  const [razonSocial, setRazonSocial] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  function guardar() {
    if (!numero.trim() || !razonSocial.trim()) {
      setError("Completá el número y la razón social.");
      return;
    }
    if (email.trim() && !email.includes("@")) {
      setError("El correo electrónico no es válido.");
      return;
    }
    onGuardar({
      numeroIdentificacion: numero.trim(),
      tipoIdentificacion: tipo,
      razonSocial: razonSocial.trim(),
      email: email.trim(),
    });
  }

  return (
    <div
      // z-[60]: se abre desde el panel de cobro (que va en un portal con z-50) y tiene que quedar por encima.
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
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Nuevo cliente
            </p>
            <p className="text-[0.85rem] text-tinta-media">Datos para la factura</p>
          </div>
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
          <Campo etiqueta="Clave" ayuda="Se asigna al guardar la venta">
            <Entrada value="" disabled placeholder="Se asigna al guardar la venta" />
          </Campo>

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
            <Entrada
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="80012345-6"
            />
          </Campo>

          <Campo etiqueta="Nombre / Razón social">
            <Entrada
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Nombre de la empresa o del titular"
              autoFocus
            />
          </Campo>

          <Campo etiqueta="Correo electrónico" ayuda="Opcional — para cuando se implemente la factura electrónica">
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
            <Boton tam="lg" onClick={guardar} className="w-full">
              Guardar
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
