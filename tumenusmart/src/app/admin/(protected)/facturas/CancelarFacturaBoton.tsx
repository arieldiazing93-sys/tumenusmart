"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { cancelarFactura } from "./actions";

/**
 * Anular una factura — con la cuenta que la sostiene, o sin ella.
 *
 * "Solo la factura" (el default) es el caso de la factura mal cargada: RUC
 * equivocado, razón social mal escrita. La cuenta sigue viva, solo el
 * número de timbrado queda consumido — el dueño la vuelve a facturar bien
 * desde el pedido/la cuenta, con un número nuevo.
 */
export function CancelarFacturaBoton({
  origen,
  id,
  facturaNumero,
}: {
  origen: "pedido" | "venta";
  id: string;
  facturaNumero: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [tambienCuenta, setTambienCuenta] = useState<"no" | "si">("no");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  async function confirmar() {
    if (!motivo.trim()) return;
    setCancelando(true);
    setError(null);
    const r = await cancelarFactura(origen, id, motivo, tambienCuenta === "si");
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
        Anular
      </Boton>
    );
  }

  return (
    <div className="w-72 rounded-xl border border-peligro/25 bg-peligro-luz p-3 text-left">
      <p className="text-[0.82rem] text-tinta">
        Vas a anular la factura N° {facturaNumero}. Ese número queda consumido para siempre, no se
        puede reutilizar.
      </p>
      <div className="mt-2.5">
        <p className="mb-1.5 text-[0.75rem] font-medium text-tinta-media">
          ¿También cancelar la cuenta?
        </p>
        <Segmentado
          opciones={[
            { value: "no", label: "No, solo la factura" },
            { value: "si", label: "Sí, cancelar todo" },
          ]}
          valor={tambienCuenta}
          onChange={setTambienCuenta}
          color="tinta"
        />
      </div>
      <textarea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo: RUC equivocado, razón social mal cargada…"
        rows={2}
        className="mt-2.5 w-full rounded-lg border border-linea px-3 py-2 text-[0.82rem]"
      />
      {error && <p className="mt-2 text-[0.8rem] font-medium text-peligro">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Boton tono="peligro" tam="sm" onClick={confirmar} disabled={cancelando || !motivo.trim()}>
          {cancelando ? "Anulando…" : "Sí, anular"}
        </Boton>
        <Boton tono="fantasma" tam="sm" onClick={() => setConfirmando(false)}>
          Volver
        </Boton>
      </div>
    </div>
  );
}
