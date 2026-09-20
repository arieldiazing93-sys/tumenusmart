"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton } from "@/components/ui";
import { EntradaMonto } from "@/components/EntradaMonto";
import { abrirTurno } from "../actions";

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
        <EntradaMonto
          value={monto}
          onChange={setMonto}
          className="w-full rounded-lg border border-linea bg-papel-suave px-3 py-3 text-center text-[1.4rem] font-semibold text-tinta transition-colors focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/15"
        />
        <p className="mt-1.5 text-[0.78rem] text-tinta-suave">
          Contá el vuelto que tenés de verdad y cargalo acá — es plata real que se suma al arqueo de
          este turno.
        </p>
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
