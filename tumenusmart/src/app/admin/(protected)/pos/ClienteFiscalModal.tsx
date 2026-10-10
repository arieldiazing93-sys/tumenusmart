"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Boton, Campo, Entrada, Selector, MensajeError } from "@/components/ui";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { AvisoRucDnit, useVerificacionDeCliente } from "./AvisoRucDnit";

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
 *
 * Con tipo RUC, en cuanto el número está completo (80012345-0) se verifica solo contra la DNIT: trae la razón social, completa el
 * dígito verificador si faltaba y, si el RUC no existe o está en un estado que la DNIT rechaza, no deja guardarlo (la factura
 * saldría rechazada). Si la DNIT no contesta no estorba: queda el control del dígito verificador de siempre.
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
  const { verificacion, verificando, verificarAhora, usarNombreDeLaDnit } = useVerificacionDeCliente({
    tipo,
    numero,
    razonSocial,
    ponerNumero: setNumero,
    ponerRazonSocial: setRazonSocial,
  });

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  async function guardar() {
    const n = numero.trim();
    if (!n) {
      setError("Completá el número y la razón social.");
      return;
    }
    let razon = razonSocial.trim();
    let numeroFinal = n;
    if (tipo === "ruc") {
      if (verificando) {
        setError("Esperá un instante: se está verificando el RUC en la DNIT.");
        return;
      }
      // Si todavía no se verificó (se apretó Guardar enseguida, o falta el dígito verificador), se verifica ahora.
      let v = verificacion;
      if (!v && /^[1-9]\d{4,7}(-\d)?$/.test(n)) v = await verificarAhora(n, false);
      if (v?.bloquea) {
        setError(v.mensaje ?? "La DNIT no acepta facturas a ese RUC.");
        return;
      }
      if (v && (v.resultado === "encontrado" || v.resultado === "no_disponible") && v.rucCompleto) numeroFinal = v.rucCompleto;
      if (!razon && v?.resultado === "encontrado" && v.razonSocial) razon = v.razonSocial;
    }
    if (!razon) {
      setError("Completá el número y la razón social.");
      return;
    }
    if (email.trim() && !email.includes("@")) {
      setError("El correo electrónico no es válido.");
      return;
    }
    onGuardar({
      numeroIdentificacion: numeroFinal,
      tipoIdentificacion: tipo,
      razonSocial: razon,
      email: email.trim(),
    });
  }

  // Sin document (render en el servidor) no hay dónde dibujarlo; el cuadro solo se abre con un clic, ya en el navegador.
  if (typeof document === "undefined") return null;

  // Se dibuja con un portal directo en <body>, igual que el panel lateral del cobro desde el que se abre: si se quedara adentro
  // de la pantalla, el z-index no alcanza —queda dentro del contexto de apilado de la página, por debajo del velo del panel— y
  // el cuadro se ve opaco y no responde a los clics. En el body los dos compiten de igual a igual y gana el z-[60].
  return createPortal(
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

          <div>
            <Campo etiqueta="N° de RUC / Cédula / etc.">
              <Entrada
                value={numero}
                onChange={(e) => {
                  setNumero(e.target.value);
                  setError(null);
                }}
                placeholder="80012345-0"
              />
            </Campo>
            {tipo === "ruc" && (
              <>
                <AvisoRucDnit verificacion={verificacion} verificando={verificando} conRazonSocial={false} />
                {verificacion?.resultado === "encontrado" && verificacion.razonSocial && razonSocial.trim() !== verificacion.razonSocial && (
                  <div className="mt-1.5">
                    <Boton tono="navegar" tam="sm" onClick={usarNombreDeLaDnit}>
                      Usar el nombre de la DNIT
                    </Boton>
                  </div>
                )}
                <div className="mt-2">
                  <Boton
                    tono="navegar"
                    tam="sm"
                    disabled={verificando || !numero.trim()}
                    onClick={() => void verificarAhora(numero.trim(), true)}
                  >
                    {verificando ? "Verificando…" : "Verificar en la DNIT"}
                  </Boton>
                </div>
              </>
            )}
          </div>

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
            <Boton tono="peligro" tam="lg" onClick={onCerrar} className="w-full">
              Cancelar
            </Boton>
          </div>
          <div className="flex-[2]">
            <Boton tono="navegar" tam="lg" onClick={guardar} className="w-full">
              Guardar
            </Boton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
