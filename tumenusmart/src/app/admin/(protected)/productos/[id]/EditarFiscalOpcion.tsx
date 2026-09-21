"use client";

import { useState } from "react";
import { actualizarIvaOpcion, actualizarUnidadMedidaOpcion } from "../actions";
import { TASAS_IVA } from "@/lib/iva";
import { UNIDADES_MEDIDA } from "@/lib/unidad-medida";

/**
 * IVA y unidad de medida de un agregado ya existente. A diferencia de
 * `EditarCostoOpcion`/`EditarPrecioExtraOpcion` (un número para tipear), acá
 * son dos <select> de pocas opciones — se guardan solos al elegir, sin botón
 * "Guardar" (mismo criterio que los <select> de EstacionFila).
 */
export function EditarFiscalOpcion({
  productId,
  optionId,
  ivaActual,
  unidadMedidaActual,
}: {
  productId: string;
  optionId: string;
  ivaActual: string;
  unidadMedidaActual: string;
}) {
  const [iva, setIva] = useState(ivaActual);
  const [unidadMedida, setUnidadMedida] = useState(unidadMedidaActual);
  const [guardandoIva, setGuardandoIva] = useState(false);
  const [guardandoUnidad, setGuardandoUnidad] = useState(false);

  async function cambiarIva(valor: string) {
    setIva(valor);
    setGuardandoIva(true);
    const datos = new FormData();
    datos.set("iva", valor);
    const resultado = await actualizarIvaOpcion(productId, optionId, datos);
    setGuardandoIva(false);
    if (!resultado.ok) alert(resultado.error);
  }

  async function cambiarUnidadMedida(valor: string) {
    setUnidadMedida(valor);
    setGuardandoUnidad(true);
    const datos = new FormData();
    datos.set("unidadMedida", valor);
    const resultado = await actualizarUnidadMedidaOpcion(productId, optionId, datos);
    setGuardandoUnidad(false);
    if (!resultado.ok) alert(resultado.error);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={iva}
        disabled={guardandoIva}
        onChange={(e) => cambiarIva(e.target.value)}
        title="IVA de este agregado"
        className="rounded border border-linea px-1.5 py-0.5 text-xs disabled:opacity-50"
      >
        {TASAS_IVA.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.etiqueta}
          </option>
        ))}
      </select>
      <select
        value={unidadMedida}
        disabled={guardandoUnidad}
        onChange={(e) => cambiarUnidadMedida(e.target.value)}
        title="Unidad de medida de este agregado"
        className="rounded border border-linea px-1.5 py-0.5 text-xs disabled:opacity-50"
      >
        {UNIDADES_MEDIDA.map((u) => (
          <option key={u.valor} value={u.valor}>
            {u.etiqueta}
          </option>
        ))}
      </select>
    </span>
  );
}
