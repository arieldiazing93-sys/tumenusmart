"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/components/ui";
import { probarElAviso } from "./actions";

/**
 * El botón que revienta a propósito.
 *
 * La acción del servidor SIEMPRE falla — esa es su función. Así que acá el
 * `catch` es el camino bueno y el `try` completo es el camino malo: si la
 * llamada vuelve sin error, quiere decir que la acción no hizo lo que dice
 * hacer, y eso también hay que mostrarlo en vez de festejar.
 */
export function BotonProbar() {
  const [estado, setEstado] = useState<"quieto" | "yendo" | "listo" | "raro">("quieto");
  const router = useRouter();

  async function probar() {
    setEstado("yendo");
    try {
      await probarElAviso();
      // No tendría que llegar nunca acá.
      setEstado("raro");
    } catch {
      setEstado("listo");
      // El error se guarda en `onRequestError`, que corre después de que la
      // respuesta salió. Por eso se espera un momento antes de recargar: sin
      // esa pausa la lista se refresca antes de que la fila exista y parece
      // que no funcionó.
      setTimeout(() => router.refresh(), 1500);
    }
  }

  return (
    <div>
      <Boton tono="suave" tam="sm" onClick={probar} disabled={estado === "yendo"}>
        {estado === "yendo" ? "Probando…" : "Probar el aviso"}
      </Boton>

      {estado === "listo" && (
        <p className="mt-2 text-[0.82rem] text-tinta-media">
          Lancé un error de prueba. En unos segundos tendría que aparecer abajo
          como <strong>&quot;Prueba del sistema de avisos&quot;</strong>. Si aparece, el
          sistema está grabando y la pantalla vacía de antes era real. Si no
          aparece, avisame: el enganche no está agarrando nada.
        </p>
      )}

      {estado === "raro" && (
        <p className="mt-2 text-[0.82rem] text-peligro">
          La prueba volvió sin fallar, y tendría que haber fallado siempre. Algo
          no está bien en la acción misma.
        </p>
      )}
    </div>
  );
}
