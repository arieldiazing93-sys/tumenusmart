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

  // Teclas suaves sobre el fondo oscuro: sin marcos, con un toque que se hunde y se aclara.
  const claseTecla =
    "flex h-[4.25rem] items-center justify-center rounded-2xl bg-white/[0.07] text-[1.7rem] font-semibold text-white transition-all active:scale-95 active:bg-white/20 disabled:opacity-40";

  return (
    <main className="min-h-screen bg-noche text-noche-tinta">
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-8">
        <span
          aria-hidden="true"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-[1.4rem] font-bold tracking-titular text-white shadow-media"
        >
          {nombreLocal.slice(0, 2).toUpperCase()}
        </span>
        <p className="mt-4 text-center text-[0.74rem] font-semibold uppercase tracking-rotulo text-noche-suave">{nombreLocal}</p>
        <h1 className="mt-1 text-center text-[1.7rem] font-semibold tracking-titular text-white">Servicio comedor</h1>
        <p className="mt-1 text-center text-[0.92rem] text-noche-suave">Poné tu PIN para entrar.</p>

        <div aria-live="polite" className="my-7 flex h-6 items-center justify-center gap-3.5">
          {Array.from({ length: LARGO_MAXIMO }).map((_, i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full transition-all ${i < pin.length ? "scale-110 bg-brand" : "bg-white/15"}`}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-peligro-luz px-3.5 py-2.5 text-center text-[0.88rem] font-medium text-peligro">
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
            className="flex h-[4.25rem] items-center justify-center rounded-2xl bg-brand text-[1.05rem] font-semibold text-white shadow-media transition-all active:scale-95 disabled:opacity-40"
          >
            {entrando ? "…" : "Entrar"}
          </button>
        </div>
      </div>
    </main>
  );
}
