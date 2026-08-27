"use client";

import { useEffect, useState } from "react";

export function LinkRepartidor({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/repartidor/${id}`);
  }, [id]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Si el navegador bloquea el clipboard, el admin igual puede
      // seleccionar y copiar el texto a mano — el link ya queda visible.
    }
  }

  if (!url) return null;

  return (
    <div className="mt-1 flex items-center gap-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="max-w-[220px] truncate text-xs text-tinta-suave hover:text-brand hover:underline"
      >
        {url}
      </a>
      <button
        type="button"
        onClick={copiar}
        className="text-xs font-medium text-brand hover:underline"
      >
        {copiado ? "¡Copiado!" : "Copiar link"}
      </button>
    </div>
  );
}
