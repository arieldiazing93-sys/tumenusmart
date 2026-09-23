"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, clasesBoton } from "@/components/ui";
import { cancelarCompra } from "../actions";

/**
 * Anular una compra ya registrada. Pide el motivo (queda en el historial) y
 * avisa qué pasa con el stock: la compra sumó cantidades a sus insumos, y
 * anularla se las resta de nuevo.
 */
export function CancelarCompraBoton({ compraId }: { compraId: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function confirmar() {
    setError(null);
    iniciar(async () => {
      const resultado = await cancelarCompra(compraId, motivo);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={clasesBoton("peligro")}>
        Cancelar compra
      </button>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-2 rounded-xl border border-peligro/25 bg-peligro-luz p-4">
      <p className="text-[0.88rem] font-semibold text-peligro">¿Cancelar esta compra?</p>
      <p className="text-[0.84rem] leading-relaxed text-tinta-media">
        Se le resta a cada insumo lo que esta compra había sumado, y la compra queda marcada como
        cancelada (no se borra). El costo de reposición de los insumos no se revierte.
      </p>
      <Area
        rows={2}
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (obligatorio) — ej: se cargó con la cantidad equivocada"
      />
      {error && <p className="text-xs font-medium text-peligro">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pendiente || !motivo.trim()}
          onClick={confirmar}
          className={clasesBoton("peligro", "sm")}
        >
          {pendiente ? "Cancelando…" : "Sí, cancelar compra"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          className="text-sm text-tinta-media hover:underline"
        >
          No, volver
        </button>
      </div>
    </div>
  );
}
