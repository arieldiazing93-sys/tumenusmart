"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Entrada } from "@/components/ui";
import { abrirTurno } from "../actions";

export function AbrirTurnoForm() {
  const router = useRouter();
  const [monto, setMonto] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);

  async function abrir() {
    setAbriendo(true);
    setError(null);
    const r = await abrirTurno(parseFloat(monto) || 0);
    setAbriendo(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push("/admin/pos");
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo etiqueta="Monto inicial de caja" ayuda="El vuelto con el que arrancás, en guaraníes.">
        <Entrada
          type="number"
          min={0}
          step={1000}
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </Campo>
      {error && <p className="text-[0.82rem] font-medium text-peligro">{error}</p>}
      <Boton onClick={abrir} disabled={abriendo} tam="lg">
        {abriendo ? "Abriendo…" : "Abrir turno"}
      </Boton>
    </div>
  );
}
