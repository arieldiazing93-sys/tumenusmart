"use client";

import { useState } from "react";
import { ClienteCrearModal } from "./ClienteCrearModal";

export function NuevoClienteBoton() {
  const [creando, setCreando] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setCreando(true)}
        className="rounded-lg bg-brand px-4 py-2 text-[0.85rem] font-semibold text-white hover:bg-brand-dark"
      >
        + Nuevo cliente
      </button>
      {creando && (
        <ClienteCrearModal onCerrar={() => setCreando(false)} onCreado={() => setCreando(false)} />
      )}
    </>
  );
}
