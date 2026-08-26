"use client";

import { useState, useTransition } from "react";
import { crearLocal, type ResultadoAlta } from "./actions";
import { PLANTILLAS, contarProductos } from "@/lib/plantillas-menu";

const CAMPO =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function AltaLocal({ dominio }: { dominio: string }) {
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoAlta | null>(null);
  const [copiado, setCopiado] = useState(false);

  function enviar(datos: FormData) {
    setResultado(null);
    setCopiado(false);
    iniciar(async () => {
      try {
        setResultado(await crearLocal(datos));
      } catch (err) {
        setResultado({
          ok: false,
          error: err instanceof Error ? err.message : "No se pudo crear el local",
        });
      }
    });
  }

  // Cuando salió bien, la pantalla cambia de propósito: ya no es un formulario,
  // es la ficha para pasarle al cliente. La contraseña se muestra UNA vez.
  if (resultado?.ok && resultado.local && resultado.acceso) {
    const { local, acceso } = resultado;
    const url = `${dominio}${local.url}`;
    const paraPasar =
      `¡Listo! Tu carta digital ya está online:\n${url}\n\n` +
      `Para administrarla entrá a ${dominio}/admin\n` +
      `Usuario: ${acceso.email}\n` +
      `Contraseña: ${acceso.password}\n\n` +
      `Te recomiendo cambiar la contraseña apenas entres, desde Mi cuenta.`;

    return (
      <div className="rounded-lg border-2 border-green-300 bg-green-50/60 p-4">
        <h3 className="font-semibold text-green-900">
          {local.nombre} quedó creado
        </h3>

        <div className="mt-3 rounded-lg border border-green-200 bg-white p-3 font-mono text-sm">
          <p className="text-neutral-500">Carta pública</p>
          <p className="mb-2 font-medium text-neutral-900">{url}</p>
          <p className="text-neutral-500">Usuario</p>
          <p className="mb-2 font-medium text-neutral-900">{acceso.email}</p>
          <p className="text-neutral-500">Contraseña</p>
          <p className="text-lg font-bold tracking-wide text-neutral-900">
            {acceso.password}
          </p>
        </div>

        <p className="mt-2 text-sm font-medium text-amber-800">
          Copiala ahora: no se puede volver a ver. Si se pierde, se la restablecés desde
          Usuarios.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(paraPasar).then(
                () => setCopiado(true),
                () => setCopiado(false)
              );
            }}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            {copiado ? "Copiado ✓" : "Copiar el mensaje para el cliente"}
          </button>
          <button
            type="button"
            onClick={() => setResultado(null)}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Crear otro local
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={enviar} className="grid gap-3 sm:grid-cols-2">
      {resultado?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {resultado.error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-neutral-600">
        Nombre del negocio
        <input name="nombre" required placeholder="Mas Pizza" className={CAMPO} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-600">
        Dirección de la carta
        <input name="slug" placeholder="maspizza" className={CAMPO} />
        <span className="text-xs text-neutral-400">
          Si lo dejás vacío se arma con el nombre. Queda como {dominio}/maspizza
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-600">
        WhatsApp del negocio
        <input name="whatsapp" required placeholder="0982 951807" className={CAMPO} />
        <span className="text-xs text-neutral-400">
          Como lo escribís normalmente. Yo le pongo el código de país.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-600">
        Correo del dueño
        <input
          type="email"
          name="email"
          required
          placeholder="juan@maspizza.com"
          className={CAMPO}
        />
        <span className="text-xs text-neutral-400">
          Con esto entra al panel. La contraseña la genero yo.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-600">
        Carta de arranque
        <select name="plantilla" defaultValue="pizzeria" className={CAMPO}>
          {PLANTILLAS.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.etiqueta}
              {contarProductos(p) > 0 ? ` — ${contarProductos(p)} productos` : ""}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-400">
          Se cargan productos de ejemplo que el dueño después edita. Es lo que evita que
          abandone con la carta a medio hacer.
        </span>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-600">
          Plan
          <input name="plan" defaultValue="basico" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-neutral-600">
          Meses de regalo
          <input
            type="number"
            name="mesesGratis"
            min="0"
            max="12"
            defaultValue="1"
            className={CAMPO}
          />
        </label>
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pendiente ? "Creando..." : "Crear local"}
        </button>
      </div>
    </form>
  );
}
