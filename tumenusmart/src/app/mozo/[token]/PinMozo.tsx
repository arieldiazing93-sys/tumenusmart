"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PIN_MOZO_MAXIMO_AL_ENTRAR, PIN_MOZO_MINIMO } from "@/lib/comedor";
import { entrarConPin } from "./actions";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
// Se puede teclear hasta 6 (los PIN de 6 que ya existían siguen sirviendo); los nuevos son de 3 a 5.
const LARGO_MAXIMO = PIN_MOZO_MAXIMO_AL_ENTRAR;

/**
 * La puerta del mozo: su PIN. Teclado grande para tablet y celular. Con el PIN correcto se abre la sesión y la página se
 * vuelve a armar ya con el salón.
 */
export function PinMozo({ token, nombreLocal }: { token: string; nombreLocal: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, iniciar] = useTransition();

  function tocar(digito: string) {
    setError(null);
    setPin((actual) => (actual.length < LARGO_MAXIMO ? actual + digito : actual));
  }

  function entrar() {
    if (pin.length < PIN_MOZO_MINIMO || entrando) return;
    setError(null);
    iniciar(async () => {
      const r = await entrarConPin(token, pin);
      if (!r.ok) {
        setError(r.error);
        setPin("");
        return;
      }
      router.refresh();
    });
  }

  const claseTecla =
    "flex h-16 items-center justify-center rounded-xl border-2 border-azul/50 bg-superficie text-[1.5rem] font-semibold text-tinta transition-all active:scale-95 active:bg-azul-luz disabled:opacity-50";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-8">
      <p className="text-center text-[0.8rem] font-semibold uppercase tracking-rotulo text-tinta-suave">{nombreLocal}</p>
      <h1 className="mt-1 text-center text-[1.5rem] font-semibold tracking-titular text-tinta">Servicio comedor</h1>
      <p className="mt-1 text-center text-[0.9rem] text-tinta-media">Poné tu PIN para entrar.</p>

      <div aria-live="polite" className="my-6 flex h-6 items-center justify-center gap-3">
        {Array.from({ length: LARGO_MAXIMO }).map((_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-2 ${
              i < pin.length ? "border-brand bg-brand" : "border-linea"
            }`}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-peligro-luz px-3 py-2 text-center text-[0.85rem] font-medium text-peligro">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {TECLAS.map((t) => (
          <button key={t} type="button" onClick={() => tocar(t)} disabled={entrando} className={claseTecla}>
            {t}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPin((actual) => actual.slice(0, -1));
          }}
          disabled={entrando || pin.length === 0}
          aria-label="Borrar un número"
          className={claseTecla}
        >
          ⌫
        </button>
        <button type="button" onClick={() => tocar("0")} disabled={entrando} className={claseTecla}>
          0
        </button>
        <button
          type="button"
          onClick={entrar}
          disabled={entrando || pin.length < PIN_MOZO_MINIMO}
          className="flex h-16 items-center justify-center rounded-xl bg-brand text-[1rem] font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
        >
          {entrando ? "…" : "Entrar"}
        </button>
      </div>
    </main>
  );
}
