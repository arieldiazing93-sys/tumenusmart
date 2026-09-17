"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Area, Boton, Entrada } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";
import { cerrarTurno } from "../actions";

type Props = {
  turnoId: string;
  cantidad: number;
  totalGeneral: number;
  porForma: Record<FormaPagoPos, number>;
};

/**
 * Declarar lo que hay en caja y cerrar el turno.
 *
 * Los 4 campos arrancan precargados con lo que calculó el sistema — el
 * cajero los ajusta si al contar la plata dio distinto. Pide confirmación
 * porque es irreversible: una vez cerrado, ese turno sale del listado de
 * turnos abiertos y no se puede seguir vendiendo en él.
 */
export function CerrarTurnoForm({ turnoId, cantidad, totalGeneral, porForma }: Props) {
  const router = useRouter();
  const [declarado, setDeclarado] = useState<Record<FormaPagoPos, string>>({
    efectivo: String(Math.round(porForma.efectivo)),
    transferencia: String(Math.round(porForma.transferencia)),
    tarjeta_debito: String(Math.round(porForma.tarjeta_debito)),
    tarjeta_credito: String(Math.round(porForma.tarjeta_credito)),
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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-linea bg-papel-suave px-3 py-2.5 text-[0.85rem] text-tinta-media">
        {cantidad} {cantidad === 1 ? "cuenta" : "cuentas"} (mostrador + pedidos cobrados acá) · Total del
        sistema:{" "}
        <strong className="text-tinta">{formatearGuarani(totalGeneral)}</strong>
      </div>

      <div className="flex flex-col gap-3">
        {FORMAS_PAGO_POS.map((f) => (
          <label key={f.valor} className="flex items-center justify-between gap-3">
            <span className="text-[0.85rem] font-medium text-tinta">
              {f.etiqueta}
              <span className="ml-1.5 block text-[0.76rem] font-normal text-tinta-suave">
                Sistema: {formatearGuarani(porForma[f.valor])}
              </span>
            </span>
            {/* El ancho fijo va en el contenedor, no en el input: Entrada ya
                trae "w-full" en su clase base, y mezclar dos utilidades de
                ancho en el mismo elemento deja el resultado a merced del
                orden en que Tailwind las genera. Adentro de un contenedor
                angosto, "w-full" simplemente llena ESE ancho. */}
            <div className="w-32 flex-none">
              <Entrada
                type="number"
                min={0}
                step={1000}
                value={declarado[f.valor]}
                onChange={(e) => setDeclarado((d) => ({ ...d, [f.valor]: e.target.value }))}
                className="text-right"
              />
            </div>
          </label>
        ))}
      </div>

      <Area
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        placeholder="Nota (opcional): faltó plata, sobró, etc."
        rows={2}
      />

      {error && <p className="text-[0.82rem] font-medium text-peligro">{error}</p>}

      {!confirmando ? (
        <Boton onClick={() => setConfirmando(true)} tam="lg">
          Cerrar turno
        </Boton>
      ) : (
        <div className="rounded-xl border border-linea bg-papel-suave p-3">
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
