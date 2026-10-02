"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Tarjeta, clasesBoton } from "@/components/ui";
import { MINUTOS_ENTRE_MARCAS_MAXIMO } from "@/lib/asistencia";
import { guardarMinutosEntreMarcas } from "./actions";

/**
 * Las reglas del celular fijo. Por ahora una: cuánto tiene que esperar una persona entre una marcación y la siguiente.
 * Si intenta marcar antes, el celular le dice a qué hora puede volver (y se lo dice apenas pone el PIN, antes de la selfie).
 */
export function ReglasMarcacion({ minutosEntreMarcas }: { minutosEntreMarcas: number }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useState(String(minutosEntreMarcas));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    iniciar(async () => {
      const resultado = await guardarMinutosEntreMarcas(Number(valor));
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
      router.refresh();
    });
  }

  return (
    <Tarjeta className="campos-grises flex flex-col gap-3 !border-2 !border-azul/50">
      <div>
        <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Tiempo entre marcaciones</h2>
        <p className="mt-0.5 text-[0.84rem] leading-snug text-tinta-media">
          Cuánto tiene que esperar una persona entre una marcación y la siguiente suya. Evita marcar dos veces por error y
          que alguien marque la entrada y la salida seguidas. Con 5 minutos, quien marca la entrada a las 08:00 recién
          puede marcar la salida a almorzar a partir de las 08:05. Con 0 no hay espera.
        </p>
      </div>
      <form onSubmit={guardar} className="flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Campo etiqueta="Minutos">
            <Entrada
              type="number"
              min={0}
              max={MINUTOS_ENTRE_MARCAS_MAXIMO}
              step={1}
              inputMode="numeric"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setGuardado(false);
              }}
            />
          </Campo>
        </div>
        <button type="submit" disabled={pendiente || valor === ""} className={clasesBoton("principal", "md")}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {guardado && <span className="pb-2.5 text-[0.84rem] font-semibold text-exito">¡Guardado!</span>}
      </form>
      {error && <MensajeError>{error}</MensajeError>}
    </Tarjeta>
  );
}
