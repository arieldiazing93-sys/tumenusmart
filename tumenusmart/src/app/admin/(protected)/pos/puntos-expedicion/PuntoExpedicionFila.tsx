"use client";

import { useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { diasParaVencer, DIAS_AVISO_VENCIMIENTO } from "@/lib/factura-pos";
import { actualizarPuntoExpedicion, alternarActivoPuntoExpedicion } from "./actions";

type Props = {
  id: string;
  nombre: string;
  establecimiento: string;
  puntoExpedicion: string;
  numeroTimbrado: string;
  timbradoDesde: string; // "YYYY-MM-DD", ya formateado por el server component
  timbradoHasta: string;
  razonSocialEmisor: string;
  rucEmisor: string;
  ultimoNumeroFactura: number;
  activo: boolean;
};

function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

export function PuntoExpedicionFila({
  id,
  nombre,
  establecimiento,
  puntoExpedicion,
  numeroTimbrado,
  timbradoDesde,
  timbradoHasta,
  razonSocialEmisor,
  rucEmisor,
  ultimoNumeroFactura,
  activo,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dias = diasParaVencer(new Date(timbradoHasta));
  const vencido = dias < 0;
  const porVencer = !vencido && dias <= DIAS_AVISO_VENCIMIENTO;

  function guardar(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const resultado = await actualizarPuntoExpedicion(id, formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
    });
  }

  if (editando) {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <form action={guardar} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-3">
            <Campo etiqueta="Nombre">
              <Entrada name="nombre" required defaultValue={nombre} />
            </Campo>
          </div>
          <div className="col-span-2 sm:col-span-3 grid grid-cols-2 gap-3">
            <Campo etiqueta="Razón social del emisor">
              <Entrada name="razonSocialEmisor" required defaultValue={razonSocialEmisor} />
            </Campo>
            <Campo etiqueta="RUC del emisor">
              <Entrada name="rucEmisor" required defaultValue={rucEmisor} />
            </Campo>
          </div>
          <Campo etiqueta="Establecimiento">
            <Entrada name="establecimiento" required defaultValue={establecimiento} maxLength={3} />
          </Campo>
          <Campo etiqueta="Punto de expedición">
            <Entrada name="puntoExpedicion" required defaultValue={puntoExpedicion} maxLength={3} />
          </Campo>
          <Campo etiqueta="N° de timbrado">
            <Entrada name="numeroTimbrado" required defaultValue={numeroTimbrado} />
          </Campo>
          <Campo etiqueta="Vigente desde">
            <Entrada type="date" name="timbradoDesde" required defaultValue={timbradoDesde} />
          </Campo>
          <Campo etiqueta="Vence">
            <Entrada type="date" name="timbradoHasta" required defaultValue={timbradoHasta} />
          </Campo>
          <div className="col-span-2 flex items-center gap-2 sm:col-span-3">
            <button type="submit" disabled={pending} className={clasesBoton("principal", "sm")}>
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditando(false);
                setError(null);
              }}
              className="text-sm text-tinta-media hover:underline"
            >
              Cancelar
            </button>
          </div>
        </form>
        {error && <p className="text-xs text-peligro">{error}</p>}
      </Tarjeta>
    );
  }

  return (
    <div className={`rounded-lg border bg-white px-4 py-3 ${activo ? "border-linea" : "border-linea opacity-60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-medium">
            {nombre} <span className="text-tinta-suave">({establecimiento}-{puntoExpedicion})</span>
            {!activo && <span className="ml-2 text-xs font-normal text-tinta-suave">(desactivado)</span>}
          </span>
          <p className="text-[0.8rem] text-tinta-media">
            {razonSocialEmisor} · RUC {rucEmisor}
          </p>
          <p className="text-[0.8rem] text-tinta-media">
            Timbrado {numeroTimbrado} · vigente {fechaCorta(timbradoDesde)} – {fechaCorta(timbradoHasta)} ·{" "}
            {ultimoNumeroFactura} factura(s) emitida(s)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {vencido && <Pastilla color="peligro">Timbrado vencido</Pastilla>}
          {porVencer && <Pastilla color="aviso">Vence en {dias} día(s)</Pastilla>}
          <button type="button" onClick={() => setEditando(true)} className="text-tinta-media hover:underline">
            Editar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => alternarActivoPuntoExpedicion(id, !activo))}
            className="text-tinta-media hover:underline disabled:opacity-50"
          >
            {activo ? "Desactivar" : "Reactivar"}
          </button>
        </div>
      </div>
    </div>
  );
}
