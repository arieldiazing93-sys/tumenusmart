"use client";

import { useState, useTransition } from "react";
import { Td, Tr } from "@/components/ui";
import { etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { actualizarNombreCliente } from "./actions";

type Props = {
  id: string;
  nombre: string;
  telefono: string | null;
  tipoIdentificacion: string | null;
  numeroIdentificacion: string | null;
};

export function ClienteFila({ id, nombre, telefono, tipoIdentificacion, numeroIdentificacion }: Props) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nombre);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await actualizarNombreCliente(id, valor);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditando(false);
    });
  }

  return (
    <Tr>
      <Td>
        {editando ? (
          <div className="flex items-center gap-2">
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardar();
                }
                if (e.key === "Escape") {
                  setValor(nombre);
                  setEditando(false);
                  setError(null);
                }
              }}
              autoFocus
              className="w-full rounded-md border border-linea px-2 py-1 text-[0.86rem]"
            />
            <button
              type="button"
              disabled={pending}
              onClick={guardar}
              className="text-[0.8rem] font-medium text-brand-texto hover:underline disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setValor(nombre);
                setEditando(false);
                setError(null);
              }}
              className="text-[0.8rem] text-tinta-suave hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-left text-tinta hover:underline"
            title="Corregir nombre"
          >
            {nombre}
          </button>
        )}
        {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      </Td>
      <Td>{telefono ?? "—"}</Td>
      <Td>
        {tipoIdentificacion && numeroIdentificacion
          ? `${etiquetaTipoIdentificacion(tipoIdentificacion)}: ${numeroIdentificacion}`
          : "—"}
      </Td>
    </Tr>
  );
}
