"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pastilla, clasesBoton } from "@/components/ui";
import { reimprimirTrabajo } from "./actions";

export type TrabajoFila = {
  id: string;
  titulo: string;
  estado: string;
  hora: string;
  error: string | null;
  /** La comanda ya legible (sin los comandos de la impresora). */
  texto: string;
};

const ESTADOS: Record<string, { texto: string; color: "exito" | "amarillo" | "peligro" | "azul" }> = {
  impreso: { texto: "Impresa", color: "exito" },
  pendiente: { texto: "En espera", color: "amarillo" },
  imprimiendo: { texto: "Imprimiendo", color: "azul" },
  error: { texto: "Con error", color: "peligro" },
  // La estación tiene 0 copias para esa área: se cerró a propósito sin imprimir.
  omitido: { texto: "No se imprime (0 copias)", color: "azul" },
};

/** Las últimas comandas de la cola, con su estado y el botón para reimprimir las que ya salieron o fallaron. */
export function ListaTrabajos({ trabajos }: { trabajos: TrabajoFila[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [verId, setVerId] = useState<string | null>(null);

  function reimprimir(id: string) {
    setError(null);
    iniciar(async () => {
      const r = await reimprimirTrabajo(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (trabajos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-linea bg-papel-suave px-3 py-6 text-center text-[0.85rem] text-tinta-suave">
        Todavía no se envió ninguna comanda.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-[0.82rem] font-medium text-peligro">{error}</p>}
      <ul className="flex flex-col gap-2">
        {trabajos.map((t) => {
          const estado = ESTADOS[t.estado] ?? { texto: t.estado, color: "azul" as const };
          const sePuedeReimprimir = t.estado === "impreso" || t.estado === "error";
          return (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[0.88rem] font-medium text-tinta">{t.titulo}</p>
                <p className="text-[0.76rem] text-tinta-suave">
                  {t.hora}
                  {t.error ? ` · ${t.error}` : ""}
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                <Pastilla color={estado.color}>{estado.texto}</Pastilla>
                <button
                  type="button"
                  onClick={() => setVerId(verId === t.id ? null : t.id)}
                  className={clasesBoton("navegar", "sm")}
                >
                  {verId === t.id ? "Ocultar" : "Ver comanda"}
                </button>
                {sePuedeReimprimir && (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => reimprimir(t.id)}
                    className={clasesBoton("navegar", "sm")}
                  >
                    Reimprimir
                  </button>
                )}
              </div>
              {verId === t.id && (
                <pre className="w-full overflow-x-auto rounded-lg bg-papel-suave p-3 font-mono text-[0.78rem] leading-snug text-tinta">
                  {t.texto}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
