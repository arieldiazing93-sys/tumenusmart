"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Td, Tr } from "@/components/ui";
import { etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { formatearNumero } from "@/lib/format";
import { ClienteEditarModal } from "./ClienteEditarModal";

type Props = {
  id: string;
  numero: number | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  tipoIdentificacion: string | null;
  numeroIdentificacion: string | null;
};

export function ClienteFila({
  id,
  numero,
  nombre,
  email,
  telefono,
  tipoIdentificacion,
  numeroIdentificacion,
}: Props) {
  const [editando, setEditando] = useState(false);

  return (
    <>
      <Tr>
        <Td>{numero != null ? formatearNumero(numero) : "—"}</Td>
        <Td>{nombre}</Td>
        <Td>{telefono ?? "—"}</Td>
        <Td>
          {tipoIdentificacion && numeroIdentificacion
            ? `${etiquetaTipoIdentificacion(tipoIdentificacion)}: ${numeroIdentificacion}`
            : "—"}
        </Td>
        <Td>{email ?? "—"}</Td>
        <Td>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-[0.8rem] font-medium text-brand-texto hover:underline"
          >
            Editar
          </button>
        </Td>
      </Tr>
      {/* Portal a document.body: <tr> solo puede tener <td>/<th> como hijos
          directos — un modal con position:fixed adentro de la fila es HTML
          inválido y el navegador lo puede reubicar o descartar. */}
      {editando &&
        createPortal(
          <ClienteEditarModal
            id={id}
            numero={numero}
            nombre={nombre}
            email={email}
            tipoIdentificacion={tipoIdentificacion}
            numeroIdentificacion={numeroIdentificacion}
            onCerrar={() => setEditando(false)}
            onGuardado={() => setEditando(false)}
          />,
          document.body
        )}
    </>
  );
}
