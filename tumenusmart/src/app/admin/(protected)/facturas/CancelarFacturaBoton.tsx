"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { esDeMesAnterior, nombreDelMes } from "@/lib/mes-fiscal";
import { cancelarFactura } from "./actions";

/**
 * Anular una factura — con la cuenta que la sostiene, o sin ella.
 *
 * "Solo la factura" (el default) es el caso de la factura mal cargada: RUC
 * equivocado, razón social mal escrita. La cuenta sigue viva, solo el
 * número de timbrado queda consumido — el dueño la vuelve a facturar bien
 * desde el pedido/la cuenta, con un número nuevo.
 *
 * Si la factura es de un mes que ya terminó, muestra una alerta grande y no
 * deja anular hasta que se marque que se entendió: ese mes probablemente ya se
 * presentó en Marangatú y anular acá no cambia lo que se le informó a la DNIT.
 */
export function CancelarFacturaBoton({
  origen,
  id,
  facturaNumero,
  fecha,
}: {
  origen: "pedido" | "venta";
  id: string;
  facturaNumero: string;
  /** Cuándo se emitió la factura. */
  fecha: Date;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [tambienCuenta, setTambienCuenta] = useState<"no" | "si">("no");
  const [motivo, setMotivo] = useState("");
  const [entiendoElAviso, setEntiendoElAviso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const fechaFactura = new Date(fecha);
  const mesAnterior = esDeMesAnterior(fechaFactura);
  const puedeConfirmar = !!motivo.trim() && (!mesAnterior || entiendoElAviso);

  async function confirmar() {
    if (!puedeConfirmar) return;
    setCancelando(true);
    setError(null);
    const r = await cancelarFactura(origen, id, motivo, tambienCuenta === "si", mesAnterior && entiendoElAviso);
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
    <div
      className={`rounded-xl border border-peligro/25 bg-peligro-luz p-3 text-left ${mesAnterior ? "w-full" : "w-72"}`}
    >
      {mesAnterior && (
        <div
          role="alert"
          className="mb-3 rounded-xl border-2 border-peligro bg-white p-4 shadow-sm"
        >
          <p className="text-[1.05rem] font-bold uppercase leading-tight tracking-wide text-peligro">
            ⚠ Atención: esta factura es de {nombreDelMes(fechaFactura)}
          </p>
          <p className="mt-2 text-[0.9rem] font-medium text-tinta">
            Ese mes ya terminó, y probablemente ya lo presentaste en Marangatú (registro RG 90).
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.85rem] text-tinta-media">
            <li>
              Anularla acá <strong>no corrige lo que ya le informaste a la DNIT</strong>: tu sistema y la DNIT van a
              quedar distintos.
            </li>
            <li>
              Para un mes ya presentado, lo correcto es emitir una <strong>nota de crédito</strong>. Todavía no está
              disponible en el sistema.
            </li>
            <li>Consultalo con tu contador antes de anularla.</li>
          </ul>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-[0.88rem] font-semibold text-tinta">
            <input
              type="checkbox"
              checked={entiendoElAviso}
              onChange={(e) => setEntiendoElAviso(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>Entiendo el aviso y quiero anular esta factura igual.</span>
          </label>
        </div>
      )}

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
        <Boton tono="peligro" tam="sm" onClick={confirmar} disabled={cancelando || !puedeConfirmar}>
          {cancelando ? "Anulando…" : "Sí, anular"}
        </Boton>
        <Boton tono="fantasma" tam="sm" onClick={() => setConfirmando(false)}>
          Volver
        </Boton>
      </div>
    </div>
  );
}
