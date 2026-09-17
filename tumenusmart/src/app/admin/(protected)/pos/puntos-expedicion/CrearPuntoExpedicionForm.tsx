"use client";

import { useRef, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearPuntoExpedicion } from "./actions";

export function CrearPuntoExpedicionForm() {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agregado, setAgregado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    setError(null);
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
    <Tarjeta className="mb-6 flex flex-col gap-3">
      <p className="rotulo text-[0.8rem] font-bold">Nuevo punto de expedición</p>
      <form ref={formRef} action={alCrear} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required placeholder="Ej: Mostrador" />
          </Campo>
        </div>
        <div className="col-span-2 sm:col-span-3 grid grid-cols-2 gap-3">
          <Campo etiqueta="Razón social del emisor">
            <Entrada name="razonSocialEmisor" required placeholder="Nombre del negocio o del titular" />
          </Campo>
          <Campo etiqueta="RUC del emisor">
            <Entrada name="rucEmisor" required placeholder="80012345-6" />
          </Campo>
        </div>
        <Campo etiqueta="Establecimiento" ayuda="3 dígitos">
          <Entrada name="establecimiento" required placeholder="001" maxLength={3} />
        </Campo>
        <Campo etiqueta="Punto de expedición" ayuda="3 dígitos">
          <Entrada name="puntoExpedicion" required placeholder="001" maxLength={3} />
        </Campo>
        <Campo etiqueta="N° de timbrado">
          <Entrada name="numeroTimbrado" required placeholder="12345678" />
        </Campo>
        <Campo etiqueta="Vigente desde">
          <Entrada type="date" name="timbradoDesde" required />
        </Campo>
        <Campo etiqueta="Vence">
          <Entrada type="date" name="timbradoHasta" required />
        </Campo>
        <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Creando…" : "Crear punto de expedición"}
          </button>
          {agregado && <span className="text-xs font-medium text-exito">✓ Creado</span>}
        </div>
      </form>
      {error && <p className="text-xs text-peligro">{error}</p>}
    </Tarjeta>
  );
}
