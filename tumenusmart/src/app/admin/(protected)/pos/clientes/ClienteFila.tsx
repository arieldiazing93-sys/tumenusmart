"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Td, Tr, clasesBoton } from "@/components/ui";
import { etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { formatearNumero } from "@/lib/format";
import { ClienteVerModal } from "./ClienteVerModal";
import { ClienteEditarModal } from "./ClienteEditarModal";

type Props = {
  id: string;
  numero: number | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  tipoIdentificacion: string | null;
  numeroIdentificacion: string | null;
  fotoUrl: string | null;
};

/** La foto grande sola, para el link "Ver imagen" de la columna Imagen. */
function VerFotoModal({ nombre, fotoUrl, onCerrar }: { nombre: string; fotoUrl: string; onCerrar: () => void }) {
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/70 p-4"
      onClick={onCerrar}
    >
      <div className="flex max-h-[90vh] max-w-lg flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 self-stretch">
          <p className="text-[0.86rem] font-semibold text-white">Último peinado de {nombre}</p>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            ✕
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoUrl} alt={`Último peinado de ${nombre}`} className="max-h-[75vh] w-auto rounded-lg object-contain" />
      </div>
    </div>
  );
}

export function ClienteFila({ id, numero, nombre, email, telefono, tipoIdentificacion, numeroIdentificacion, fotoUrl }: Props) {
  const [modal, setModal] = useState<"ver" | "editar" | "foto" | null>(null);

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
          {fotoUrl ? (
            <button
              type="button"
              onClick={() => setModal("foto")}
              className="inline-flex h-8 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-violeta/30 bg-violeta-tinte px-3 text-[0.82rem] font-semibold text-violeta-oscuro transition-colors duration-150 hover:border-violeta hover:bg-violeta hover:text-white"
            >
              Ver imagen
            </button>
          ) : (
            <span className="text-[0.8rem] text-tinta-suave">Sin imagen</span>
          )}
        </Td>
        <Td>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setModal("ver")} className={clasesBoton("navegar", "sm")}>
              Ver
            </button>
            <button type="button" onClick={() => setModal("editar")} className={clasesBoton("navegar", "sm")}>
              Editar
            </button>
          </div>
        </Td>
      </Tr>
      {/* Portal a document.body: <tr> solo puede tener <td>/<th> como hijos
          directos — un modal con position:fixed adentro de la fila es HTML
          inválido y el navegador lo puede reubicar o descartar. */}
      {modal === "ver" &&
        createPortal(
          <ClienteVerModal
            numero={numero}
            nombre={nombre}
            email={email}
            telefono={telefono}
            tipoIdentificacion={tipoIdentificacion}
            numeroIdentificacion={numeroIdentificacion}
            fotoUrl={fotoUrl}
            onCerrar={() => setModal(null)}
            onEditar={() => setModal("editar")}
          />,
          document.body
        )}
      {modal === "editar" &&
        createPortal(
          <ClienteEditarModal
            id={id}
            numero={numero}
            nombre={nombre}
            telefono={telefono}
            email={email}
            tipoIdentificacion={tipoIdentificacion}
            numeroIdentificacion={numeroIdentificacion}
            fotoUrl={fotoUrl}
            onCerrar={() => setModal(null)}
            onGuardado={() => setModal(null)}
          />,
          document.body
        )}
      {modal === "foto" &&
        fotoUrl &&
        createPortal(<VerFotoModal nombre={nombre} fotoUrl={fotoUrl} onCerrar={() => setModal(null)} />, document.body)}
    </>
  );
}
