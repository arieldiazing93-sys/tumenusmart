"use client";

import { useEffect, useState } from "react";
import { clasesBoton } from "@/components/ui";

/**
 * El enlace de trabajo de una persona del personal (/personal/<id>): ahí ve las citas
 * que ya se cobraron a su nombre. No lleva usuario ni contraseña —igual que el enlace
 * del repartidor—, así que el dueño se lo pasa a esa persona (por WhatsApp, si tiene
 * teléfono cargado) y a nadie más.
 */
export function EnlaceTrabajoPersonal({
  id,
  nombre,
  telefono,
  activo,
}: {
  id: string;
  nombre: string;
  /** Internacional, solo dígitos; null si no tiene. */
  telefono: string | null;
  activo: boolean;
}) {
  const [url, setUrl] = useState("");
  const [copiado, setCopiado] = useState(false);

  // El origen (https://…) recién se conoce en el navegador.
  useEffect(() => {
    setUrl(`${window.location.origin}/personal/${id}`);
  }, [id]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Si el navegador bloquea el portapapeles, el enlace queda visible para copiarlo a mano.
    }
  }

  const mensaje = `Hola ${nombre}, este es tu enlace para ver tu trabajo confirmado: ${url}`;
  const whatsapp = telefono && url ? `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}` : null;

  return (
    <div className="rounded-lg border border-linea bg-superficie p-3">
      <p className="text-[0.86rem] font-semibold text-tinta">Su enlace de trabajo</p>
      <p className="mt-0.5 text-[0.78rem] leading-snug text-tinta-suave">
        Ahí ve las citas que ya cobraste a su nombre. No lleva contraseña: pasáselo solo a esa persona.
        {!activo && " Como está inactivo, el enlace no funciona hasta que lo actives."}
      </p>
      {url && <p className="mt-2 truncate rounded-md bg-papel-suave px-2.5 py-1.5 text-[0.76rem] text-tinta-media">{url}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={copiar} disabled={!url} className={clasesBoton("suave", "sm")}>
          {copiado ? "¡Copiado!" : "Copiar enlace"}
        </button>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={clasesBoton("navegar", "sm")}>
            Enviar por WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
