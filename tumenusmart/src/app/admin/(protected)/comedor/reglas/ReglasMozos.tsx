"use client";

import { useState, useTransition } from "react";
import { Interruptor } from "@/components/Interruptor";
import { guardarReglaDeMozos } from "./actions";

type Regla = "mozosVenCuentasAjenas" | "mozoImprimeCuenta";

/** Un bloque de la configuración: un interruptor que se guarda al instante, con su explicación de qué pasa prendido y apagado. */
function BloqueRegla({
  regla,
  inicial,
  titulo,
  prendido,
  apagado,
}: {
  regla: Regla;
  inicial: boolean;
  titulo: string;
  /** Qué pasa con el interruptor prendido. */
  prendido: string;
  /** Qué pasa con el interruptor apagado. */
  apagado: string;
}) {
  const [activo, setActivo] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function cambiar(nuevo: boolean) {
    setActivo(nuevo);
    setError(null);
    iniciar(async () => {
      try {
        const r = await guardarReglaDeMozos(regla, nuevo);
        if (!r.ok) {
          setActivo(!nuevo);
          setError(r.error);
        }
      } catch {
        setActivo(!nuevo); // vuelve atrás si no se pudo guardar
        setError("No se pudo guardar el cambio. Probá de nuevo.");
      }
    });
  }

  return (
    <section className="rounded-xl border-2 border-azul/50 bg-superficie p-4">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Interruptor activo={activo} onChange={cambiar} etiqueta={titulo} tono="azul" deshabilitado={pendiente} />
        </div>
        <div className="min-w-0">
          <p className="text-[0.95rem] font-semibold text-tinta">{titulo}</p>
          <p className={`mt-1 text-[0.82rem] leading-snug ${activo ? "font-medium text-tinta" : "text-tinta-suave"}`}>
            <strong className="font-semibold">Prendido:</strong> {prendido}
          </p>
          <p className={`mt-0.5 text-[0.82rem] leading-snug ${activo ? "text-tinta-suave" : "font-medium text-tinta"}`}>
            <strong className="font-semibold">Apagado:</strong> {apagado}
          </p>
        </div>
      </div>
      {error && <p className="mt-2 text-[0.78rem] font-medium text-peligro">{error}</p>}
    </section>
  );
}

/** Las reglas de los mozos, una por bloque. Cada interruptor se guarda solo al tocarlo. */
export function ReglasMozos({
  mozosVenCuentasAjenas,
  mozoImprimeCuenta,
}: {
  mozosVenCuentasAjenas: boolean;
  mozoImprimeCuenta: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <BloqueRegla
        regla="mozosVenCuentasAjenas"
        inicial={mozosVenCuentasAjenas}
        titulo="Un mozo puede entrar a las cuentas que abrió otro mozo"
        prendido="todos los mozos ven todas las mesas abiertas y pueden sumarles pedidos."
        apagado="cada mozo ve en su pantalla solo las cuentas que abrió él. Una mesa ocupada por otro mozo aparece como ocupada, pero no la puede abrir ni cargarle nada."
      />
      <BloqueRegla
        regla="mozoImprimeCuenta"
        inicial={mozoImprimeCuenta}
        titulo="El mozo puede imprimir la cuenta de su mesa"
        prendido="en la cuenta de la mesa aparece el botón “Imprimir la cuenta”. Sale en la impresora del ticket de la caja, y la cuenta queda por cobrar: el mozo ya no puede cargarle más hasta que la caja la reabra."
        apagado="la cuenta la imprime siempre la caja."
      />
    </div>
  );
}
