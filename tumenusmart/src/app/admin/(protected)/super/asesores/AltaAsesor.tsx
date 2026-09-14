"use client";

import { clasesBoton } from "@/components/ui";
import { useRef, useState, useTransition } from "react";
import { crearAsesor, type ResultadoAsesor } from "../actions";

const CAMPO =
  "w-full rounded-lg border border-linea px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function AltaAsesor() {
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoAsesor | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function enviar(datos: FormData) {
    setResultado(null);
    iniciar(async () => {
      const r = await crearAsesor(datos);
      setResultado(r);
      if (r.ok) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={enviar} className="grid gap-3 sm:grid-cols-2">
      {resultado && !resultado.ok && (
        <p className="rounded-lg bg-peligro-luz px-3 py-2 text-sm text-peligro sm:col-span-2">
          {resultado.error}
        </p>
      )}
      {resultado?.ok && (
        <p className="rounded-lg bg-exito-luz px-3 py-2 text-sm text-exito sm:col-span-2">
          Asesor creado. Ya aparece en la lista para asignarlo a un local nuevo.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Nombre y apellido
        <input name="nombre" required placeholder="Ariel Díaz" className={CAMPO} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Teléfono
        <input name="telefono" required placeholder="0981 234 567" className={CAMPO} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Ciudad
        <input name="ciudad" required placeholder="Itá" className={CAMPO} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Correo electrónico
        <input type="email" name="email" required placeholder="ariel@ejemplo.com" className={CAMPO} />
      </label>

      <div className="sm:col-span-2">
        <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
          {pendiente ? "Creando..." : "Crear asesor"}
        </button>
      </div>
    </form>
  );
}
