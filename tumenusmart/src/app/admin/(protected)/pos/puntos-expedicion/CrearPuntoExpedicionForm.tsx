"use client";

import { useRef, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { MODALIDADES_PUNTO, type ModalidadPunto } from "@/lib/modalidad-punto";
import { crearPuntoExpedicion } from "./actions";

/**
 * `modalidadDelLocal`: el tipo de timbrado de los puntos activos del local, o null si todavía no hay ninguno. Un local factura
 * con un solo tipo de timbrado: si ya lo tiene definido, no se elige acá (para cambiarlo hay que desactivar los puntos del
 * otro tipo). Sin puntos, se elige y el electrónico viene marcado: es lo que se consigue hoy.
 */
export function CrearPuntoExpedicionForm({ modalidadDelLocal }: { modalidadDelLocal: ModalidadPunto | null }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agregado, setAgregado] = useState(false);
  const [elegida, setElegida] = useState<ModalidadPunto>(modalidadDelLocal ?? "electronico");
  const formRef = useRef<HTMLFormElement>(null);
  const modalidad = modalidadDelLocal ?? elegida;
  const electronico = modalidad === "electronico";

  function alCrear(formData: FormData) {
    setError(null);
    formData.set("modalidad", modalidad);
    iniciar(async () => {
      const resultado = await crearPuntoExpedicion(formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      formRef.current?.reset();
      setAgregado(true);
      setTimeout(() => setAgregado(false), 2500);
    });
  }

  return (
    <Tarjeta className="mb-6 flex flex-col gap-3 !border-2 !border-azul/50">
      <p className="rotulo text-[0.8rem] font-bold">Nuevo punto de expedición</p>
      <form ref={formRef} action={alCrear} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <p className="mb-1.5 text-[0.82rem] font-semibold text-tinta">Tipo de timbrado</p>
          {modalidadDelLocal ? (
            <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.82rem] text-tinta-media">
              Este local factura con timbrado <strong className="text-tinta">{electronico ? "electrónico (SIFEN)" : "autoimpresor"}</strong>. Todos los puntos
              activos son del mismo tipo.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MODALIDADES_PUNTO.map((m) => (
                <label
                  key={m.valor}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
                    elegida === m.valor ? "border-azul bg-azul-luz" : "border-linea bg-superficie hover:border-azul/50"
                  }`}
                >
                  <input type="radio" name="modalidad-visible" checked={elegida === m.valor} onChange={() => setElegida(m.valor)} className="mt-1" />
                  <span>
                    <span className="block text-[0.88rem] font-semibold text-tinta">{m.etiqueta}</span>
                    <span className="block text-[0.78rem] text-tinta-media">{m.detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="col-span-2 sm:col-span-3">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required placeholder="Ej: Mostrador" />
          </Campo>
        </div>
        <div className="col-span-2 sm:col-span-3 grid grid-cols-2 gap-3">
          <Campo etiqueta="Razón social del emisor">
            <Entrada name="razonSocialEmisor" required placeholder="Nombre del negocio o del titular" />
          </Campo>
          <Campo etiqueta="RUC del emisor" ayuda={electronico ? "Con su dígito verificador" : undefined}>
            <Entrada name="rucEmisor" required placeholder="80012345-6" />
          </Campo>
        </div>
        <Campo etiqueta="Establecimiento" ayuda="3 dígitos">
          <Entrada name="establecimiento" required placeholder="001" maxLength={3} />
        </Campo>
        <Campo etiqueta="Punto de expedición" ayuda="3 dígitos">
          <Entrada name="puntoExpedicion" required placeholder="001" maxLength={3} />
        </Campo>
        <Campo
          etiqueta={electronico ? "N° de timbrado electrónico" : "N° de timbrado"}
          ayuda={electronico ? "8 dígitos. En el ambiente de pruebas de la DNIT es tu RUC sin el dígito verificador" : undefined}
        >
          <Entrada name="numeroTimbrado" required placeholder="12345678" inputMode="numeric" />
        </Campo>
        <Campo etiqueta={electronico ? "Inicio de vigencia del timbrado" : "Vigente desde"}>
          <Entrada type="date" name="timbradoDesde" required />
        </Campo>
        {!electronico && (
          <Campo etiqueta="Vence">
            <Entrada type="date" name="timbradoHasta" required />
          </Campo>
        )}
        <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
          <button type="submit" disabled={pendiente} className={clasesBoton("nuevo")}>
            {pendiente ? "Creando…" : "Crear punto de expedición"}
          </button>
          {agregado && <span className="text-xs font-medium text-exito">✓ Creado</span>}
        </div>
      </form>
      {error && <p className="text-xs text-peligro">{error}</p>}
    </Tarjeta>
  );
}
