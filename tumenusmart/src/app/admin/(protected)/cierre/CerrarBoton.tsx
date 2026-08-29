"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { cerrarRendicion } from "./actions";

/**
 * "Recibí la plata".
 *
 * Pide confirmación mostrando el monto porque es irreversible: una vez
 * cerrada, esos pedidos salen de la lista de pendientes. Y el monto va en la
 * confirmación —no solo arriba— para que el último vistazo sea al número que
 * se está por dar por bueno.
 */
export function CerrarBoton({
  repartidorId,
  nombre,
  efectivo,
  cantidad,
}: {
  repartidorId: string;
  nombre: string;
  efectivo: number;
  cantidad: number;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const router = useRouter();

  async function cerrar() {
    setYendo(true);
    setError(null);
    const r = await cerrarRendicion(repartidorId, notas);
    setYendo(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo cerrar");
      return;
    }
    setConfirmando(false);
    setNotas("");
    router.refresh();
  }

  if (!confirmando) {
    return (
      <Boton onClick={() => setConfirmando(true)} tam="sm">
        Recibí la rendición
      </Boton>
    );
  }

  return (
    <div className="rounded-xl border border-linea bg-papel-suave p-3">
      <p className="text-[0.88rem] text-tinta">
        Vas a dar por recibidos <strong>{formatearGuarani(efectivo)}</strong> en efectivo de{" "}
        <strong>{nombre}</strong>, por {cantidad} {cantidad === 1 ? "pedido" : "pedidos"}.
      </p>

      <input
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Nota (opcional): faltó un pedido, quedó debiendo…"
        className="mt-2 w-full rounded-lg border border-linea px-3 py-2 text-[0.85rem]"
      />

      {error && <p className="mt-2 text-[0.85rem] font-medium text-peligro">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Boton onClick={cerrar} disabled={yendo} tam="sm">
          {yendo ? "Cerrando…" : "Sí, recibí la plata"}
        </Boton>
        <Boton tono="fantasma" tam="sm" onClick={() => setConfirmando(false)}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}
