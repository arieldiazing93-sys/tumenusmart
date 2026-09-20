"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton, clasesBoton } from "@/components/ui";
import { cancelarVenta } from "../../actions";

/**
 * Anular una cuenta ya cobrada.
 *
 * Si la cuenta tiene una factura VIGENTE (con número y sin anular), no deja
 * cancelar desde acá: cancelar la cuenta entera anularía la factura de
 * yapa en el mismo paso, sin el registro/motivo propio que tiene esa acción
 * en Facturas — dos cosas distintas mezcladas en un solo clic. El protocolo
 * es: primero anular la factura (Facturas, "solo la factura" o "cancelar
 * todo"), recién ahí esta cuenta queda libre para cancelarse sola si hace
 * falta.
 *
 * Sin factura (o con la factura ya anulada), pide el motivo porque queda
 * registrado en el historial — sin eso, dentro de un mes nadie se acuerda
 * por qué se anuló esa venta puntual.
 */
export function CancelarVentaBoton({
  ventaId,
  comprobanteTipo,
  facturaNumero,
  facturaAnulada,
}: {
  ventaId: string;
  comprobanteTipo: string;
  facturaNumero: string | null;
  facturaAnulada: boolean;
}) {
  const router = useRouter();
  const facturaVigente = comprobanteTipo === "factura" && !!facturaNumero && !facturaAnulada;
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

  if (facturaVigente) {
    return (
      <div className="rounded-xl border border-aviso/25 bg-aviso-luz p-3">
        <p className="text-[0.85rem] text-tinta">
          Esta cuenta tiene la factura N° {facturaNumero} activa. Primero anulá la factura desde
          Facturas — recién después se puede cancelar la cuenta.
        </p>
        <div className="mt-3 flex gap-2">
          <Link href="/admin/facturas" className={clasesBoton("navegar", "sm")}>
            Ir a Facturas
          </Link>
          <Boton tono="fantasma" tam="sm" onClick={() => setConfirmando(false)}>
            Volver
          </Boton>
        </div>
      </div>
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
