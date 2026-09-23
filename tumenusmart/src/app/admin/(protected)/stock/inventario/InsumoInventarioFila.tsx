"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tr, Td, Entrada, clasesBoton } from "@/components/ui";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { ajustarInventario } from "./actions";

export function InsumoInventarioFila({
  id,
  nombre,
  categoriaNombre,
  stockActual,
  unidadMedida,
}: {
  id: string;
  nombre: string;
  categoriaNombre: string;
  stockActual: number;
  unidadMedida: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [ajustando, setAjustando] = useState(false);
  const [contado, setContado] = useState(String(stockActual));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardar() {
    setError(null);
    const cantidad = Number(contado);
    iniciar(async () => {
      const resultado = await ajustarInventario(id, cantidad, motivo);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setAjustando(false);
      setMotivo("");
      setGuardado(true);
      router.refresh();
      setTimeout(() => setGuardado(false), 2000);
    });
  }

  return (
    <Tr>
      <Td className="font-medium text-tinta">{nombre}</Td>
      <Td>{categoriaNombre}</Td>
      <Td>
        {ajustando ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Entrada
                type="number"
                step="0.001"
                min="0"
                autoFocus
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-tinta-suave">{etiquetaUnidadMedida(unidadMedida)}</span>
            </div>
            <Entrada
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="text-xs"
            />
          </div>
        ) : (
          <span>
            {stockActual} {etiquetaUnidadMedida(unidadMedida)}
            {guardado && <span className="ml-2 text-xs font-normal text-exito">✓ Guardado</span>}
          </span>
        )}
        {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      </Td>
      <Td>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {ajustando ? (
            <>
              <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal", "sm")}>
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAjustando(false);
                  setContado(String(stockActual));
                  setMotivo("");
                  setError(null);
                }}
                className="text-tinta-media hover:underline"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setAjustando(true)} className="text-tinta-media hover:underline">
                Ajustar
              </button>
              <Link href={`/admin/stock/inventario/${id}`} className="text-brand hover:underline">
                Historial
              </Link>
            </>
          )}
        </div>
      </Td>
    </Tr>
  );
}
