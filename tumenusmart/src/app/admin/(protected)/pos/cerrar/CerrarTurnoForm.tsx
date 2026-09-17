"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Area, Boton, Entrada } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";
import { cerrarTurno } from "../actions";

const ICONOS_FORMA: Record<FormaPagoPos, string> = {
  efectivo: "💵",
  transferencia: "🏦",
  tarjeta_debito: "💳",
  tarjeta_credito: "💳",
};

type Props = {
  turnoId: string;
  /** Solo para el chequeo anti-carrera al confirmar — nunca se muestran en pantalla. */
  cantidad: number;
  totalGeneral: number;
};

/**
 * Declarar lo que hay en caja y cerrar el turno.
 *
 * El corte es CIEGO a propósito, como se estila acá: el cajero cuenta y
 * carga sin ver cuánto calculó el sistema. Si lo viera de antemano,
 * terminaría copiando ese número en vez de contar la plata de verdad, y el
 * cierre dejaría de servir para detectar un error o un faltante — por eso
 * los campos arrancan vacíos, sin ningún monto precargado ni de referencia.
 * La comparación (sistema vs. declarado) recién aparece en el comprobante,
 * después de confirmar.
 */
export function CerrarTurnoForm({ turnoId, cantidad, totalGeneral }: Props) {
  const router = useRouter();
  const [declarado, setDeclarado] = useState<Record<FormaPagoPos, string>>({
    efectivo: "",
    transferencia: "",
    tarjeta_debito: "",
    tarjeta_credito: "",
  });
  const [notas, setNotas] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState(false);

  async function confirmar() {
    setCerrando(true);
    setError(null);
    const r = await cerrarTurno(
      turnoId,
      {
        efectivo: parseFloat(declarado.efectivo) || 0,
        transferencia: parseFloat(declarado.transferencia) || 0,
        tarjetaDebito: parseFloat(declarado.tarjeta_debito) || 0,
        tarjetaCredito: parseFloat(declarado.tarjeta_credito) || 0,
      },
      notas,
      cantidad,
      totalGeneral
    );
    setCerrando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push(`/admin/pos/turnos/${r.turnoId}`);
  }

  const totalDeclarado = FORMAS_PAGO_POS.reduce((s, f) => s + (parseFloat(declarado[f.valor]) || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-linea bg-papel-suave px-3.5 py-3 text-[0.85rem] text-tinta-media">
        Vas a cerrar {cantidad} {cantidad === 1 ? "cuenta" : "cuentas"} (mostrador + pedidos cobrados
        acá). Contá la caja y cargá lo que tenés en cada forma de pago.
      </div>

      <div className="flex flex-col gap-2.5">
        {FORMAS_PAGO_POS.map((f) => (
          <div key={f.valor} className="flex items-center gap-3 rounded-lg border border-linea bg-white p-3">
            <span aria-hidden="true" className="flex-none text-lg leading-none">
              {ICONOS_FORMA[f.valor]}
            </span>
            <p className="min-w-0 flex-1 text-[0.85rem] font-medium text-tinta">{f.etiqueta}</p>
            <div className="w-28 flex-none sm:w-32">
              <Entrada
                type="number"
                min={0}
                step={1000}
                placeholder="0"
                value={declarado[f.valor]}
                onChange={(e) => setDeclarado((d) => ({ ...d, [f.valor]: e.target.value }))}
                className="text-right"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-linea pt-3">
        <span className="text-[0.85rem] text-tinta-media">Total declarado</span>
        <span className="cifra text-[1.2rem] font-bold text-tinta">{formatearGuarani(totalDeclarado)}</span>
      </div>

      <Area
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Nota (opcional): faltó plata, sobró, etc."
        rows={2}
      />

      {error && (
        <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">{error}</p>
      )}

      {!confirmando ? (
        <Boton onClick={() => setConfirmando(true)} tam="lg">
          Cerrar turno
        </Boton>
      ) : (
        <div className="rounded-xl border border-linea bg-papel-suave p-3.5">
          <p className="text-[0.85rem] text-tinta">
            ¿Confirmás el cierre del turno con estos montos? No se puede deshacer.
          </p>
          <div className="mt-3 flex gap-2">
            <Boton onClick={confirmar} disabled={cerrando} tam="sm">
              {cerrando ? "Cerrando…" : "Sí, cerrar turno"}
            </Boton>
            <Boton tono="fantasma" tam="sm" onClick={() => setConfirmando(false)}>
              Cancelar
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}
