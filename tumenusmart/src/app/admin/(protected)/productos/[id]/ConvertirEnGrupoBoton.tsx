"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Boton, Entrada, clasesBoton } from "@/components/ui";
import { convertirAgregadosEnGrupo } from "../actions";

/**
 * Copia los agregados propios de este producto a un grupo reutilizable
 * nuevo (ver /admin/grupos-agregados), para no retipear un producto que ya
 * tenía sus salsas/quesos cargados antes de que existieran los grupos. No
 * borra los agregados originales — el dueño los borra a mano una vez que
 * confirma que el grupo quedó bien (botón "Quitar" que ya existe en cada
 * fila de la tarjeta "Agregados", de arriba).
 */
export function ConvertirEnGrupoBoton({
  productId,
  nombreProducto,
  cantidadAgregados,
}: {
  productId: string;
  nombreProducto: string;
  cantidadAgregados: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState(`Agregados de ${nombreProducto}`);
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<{ groupId: string } | { error: string } | null>(null);

  if (cantidadAgregados === 0) return null;

  function convertir() {
    setResultado(null);
    iniciar(async () => {
      const r = await convertirAgregadosEnGrupo(productId, nombre);
      if (!r.ok) {
        setResultado({ error: r.error });
        return;
      }
      setResultado({ groupId: r.groupId });
      setAbierto(false);
    });
  }

  if (resultado && "groupId" in resultado) {
    return (
      <p className="text-xs text-exito">
        ✓ Grupo creado y adjuntado —{" "}
        <Link href={`/admin/grupos-agregados/${resultado.groupId}`} className="underline">
          verlo
        </Link>
        .
      </p>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={clasesBoton("suave", "sm")}
      >
        Convertir en grupo reutilizable
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Entrada
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="min-w-[16rem]"
        />
        <Boton tono="principal" tam="sm" onClick={convertir} disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear grupo"}
        </Boton>
        <Boton tono="fantasma" tam="sm" onClick={() => setAbierto(false)} disabled={pendiente}>
          Cancelar
        </Boton>
      </div>
      {resultado && "error" in resultado && (
        <p className="text-xs text-peligro">{resultado.error}</p>
      )}
    </div>
  );
}
