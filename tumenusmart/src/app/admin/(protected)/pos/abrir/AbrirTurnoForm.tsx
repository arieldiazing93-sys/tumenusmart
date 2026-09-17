"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { abrirTurno } from "../actions";

const MONTOS_RAPIDOS = [0, 50000, 100000, 200000];

export function AbrirTurnoForm({ estacionId }: { estacionId: string }) {
  const router = useRouter();
  const [monto, setMonto] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);

  async function abrir() {
    setAbriendo(true);
    setError(null);
    const r = await abrirTurno(estacionId, parseFloat(monto) || 0);
    setAbriendo(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push("/admin/pos");
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-1.5 text-[0.78rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
          Monto inicial de caja
        </p>
        <input
          type="number"
          min={0}
          step={1000}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          className="w-full rounded-lg border border-linea bg-papel-suave px-3 py-3 text-center text-[1.4rem] font-semibold text-tinta transition-colors focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
        <p className="mt-1.5 text-[0.78rem] text-tinta-suave">El vuelto con el que arrancás, en guaraníes.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {MONTOS_RAPIDOS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMonto(String(m))}
            className={`rounded-full border px-3 py-1.5 text-[0.8rem] font-medium transition-colors ${
              Number(monto) === m
                ? "border-brand bg-brand-light text-brand-texto"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {m === 0 ? "Sin vuelto" : `Gs. ${m.toLocaleString("es-PY")}`}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">{error}</p>
      )}

      <Boton onClick={abrir} disabled={abriendo} tam="lg" className="w-full">
        {abriendo ? "Abriendo…" : "🔓 Abrir turno"}
      </Boton>
    </div>
  );
}
