"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { cancelarVenta } from "../../actions";

/**
 * Anular una cuenta ya cobrada.
 *
 * Pide el motivo porque queda registrado en el historial — sin eso, dentro
 * de un mes nadie se acuerda por qué se anuló esa venta puntual.
 */
export function CancelarVentaBoton({ ventaId }: { ventaId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  async function cancelar() {
    if (!motivo.trim()) return;
    setCancelando(true);
    setError(null);
    const r = await cancelarVenta(ventaId, motivo);
    setCancelando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  if (!confirmando) {
    return (
      <Boton tono="peligro" tam="sm" onClick={() => setConfirmando(true)}>
        Cancelar cuenta
      </Boton>
    );
  }

  return (
    <div className="rounded-xl border border-peligro/25 bg-peligro-luz p-3">
      <p className="text-[0.85rem] text-tinta">
        ¿Por qué se cancela esta cuenta? Es obligatorio, queda en el historial.
      </p>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo: se cargó mal, el cliente se arrepintió, producto equivocado…"
        rows={2}
        className="mt-2 w-full rounded-lg border border-linea px-3 py-2 text-[0.85rem]"
      />
      {error && <p className="mt-2 text-[0.85rem] font-medium text-peligro">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Boton tono="peligro" tam="sm" onClick={cancelar} disabled={cancelando || !motivo.trim()}>
          {cancelando ? "Cancelando…" : "Sí, cancelar esta cuenta"}
        </Boton>
        <Boton tono="fantasma" tam="sm" onClick={() => setConfirmando(false)}>
          Volver
        </Boton>
      </div>
    </div>
  );
}
