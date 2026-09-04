"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearUsuario } from "./actions";

const CAMPO =
  "w-full rounded-lg border border-linea px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

type Local = { id: string; nombre: string; slug: string };

export function CrearUsuarioForm({ locales }: { locales: Local[] }) {
  const [pendiente, iniciar] = useTransition();

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearUsuario(formData);
      if (!resultado.ok) {
        alert(resultado.error);
      }
    });
  }

  return (
    <form action={alCrear} className="grid gap-3 border-t border-linea p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Correo
        <input
          type="email"
          name="email"
          required
          placeholder="juan@maspizza.com"
          className={CAMPO}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Nombre
        <input type="text" name="nombre" placeholder="Juan Pérez" className={CAMPO} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Local
        <select name="storeId" className={CAMPO} defaultValue="">
          <option value="">— Elegí un local —</option>
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre} (/{l.slug})
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Nivel
        <select name="rol" className={CAMPO} defaultValue="local">
          <option value="local">Local — solo su negocio</option>
          <option value="superadmin">Administrador — todos los locales</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media sm:col-span-2">
        Contraseña
        <input
          type="text"
          name="password"
          required
          autoComplete="off"
          placeholder="Al menos 8 caracteres, con letras y números"
          className={CAMPO}
        />
        <span className="text-xs text-tinta-suave">
          Se muestra en claro a propósito, para que puedas copiarla y pasársela. Después
          de guardar no se puede volver a ver: solo cambiarla. Si elegís Administrador, el
          local queda ignorado.
        </span>
      </label>

      <div className="sm:col-span-2">
        <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
          {pendiente ? "Creando…" : "Crear usuario"}
        </button>
      </div>
    </form>
  );
}
