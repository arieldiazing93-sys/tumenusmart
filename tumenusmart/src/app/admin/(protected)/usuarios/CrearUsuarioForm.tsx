"use client";

import { useRef, useState, useTransition } from "react";
import { Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { llamarAlServidor } from "@/lib/llamar-servidor";
import { crearUsuario } from "./actions";

type Local = { id: string; nombre: string; slug: string };

export function CrearUsuarioForm({ locales }: { locales: Local[] }) {
  const [pendiente, iniciar] = useTransition();
  const formulario = useRef<HTMLFormElement>(null);
  const [rol, setRol] = useState("local");
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<string | null>(null);

  // No se usa `action={...}` del formulario a propósito: React vacía los campos al terminar una acción, y si hubo un error (correo
  // repetido, contraseña floja) habría que volver a escribir todo.
  function alCrear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCreado(null);
    const formData = new FormData(e.currentTarget);
    const correo = String(formData.get("email") ?? "");
    iniciar(async () => {
      const resultado = await llamarAlServidor(() => crearUsuario(formData));
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      // Quedó creado: se limpia el formulario para poder cargar el siguiente sin que quede la contraseña a la vista.
      formulario.current?.reset();
      setRol("local");
      setCreado(correo);
    });
  }

  return (
    <form
      ref={formulario}
      onSubmit={alCrear}
      className="campos-grises grid gap-3 border-t-2 border-azul/30 p-4 sm:grid-cols-2"
    >
      <Campo etiqueta="Correo">
        <Entrada type="email" name="email" required placeholder="juan@maspizza.com" autoComplete="off" />
      </Campo>

      <Campo etiqueta="Nombre">
        <Entrada type="text" name="nombre" placeholder="Juan Pérez" autoComplete="off" />
      </Campo>

      <Campo etiqueta="Nivel">
        <Selector name="rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="local">Local — solo su negocio</option>
          <option value="superadmin">Administrador — todos los locales</option>
        </Selector>
      </Campo>

      <Campo etiqueta="Local" ayuda={rol === "superadmin" ? "Un administrador ve todos los locales: no hace falta elegir uno." : undefined}>
        <Selector name="storeId" defaultValue="" disabled={rol === "superadmin"}>
          <option value="">— Elegí un local —</option>
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre} (/{l.slug})
            </option>
          ))}
        </Selector>
      </Campo>

      <div className="sm:col-span-2">
        <Campo
          etiqueta="Contraseña"
          ayuda="Se muestra en claro a propósito, para que puedas copiarla y pasársela. Después de guardar no se puede volver a ver: solo cambiarla."
        >
          <Entrada
            type="text"
            name="password"
            required
            autoComplete="off"
            placeholder="Al menos 8 caracteres, con letras y números"
          />
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pendiente} className={clasesBoton("nuevo", "md")}>
          {pendiente ? "Creando…" : "Crear usuario"}
        </button>
        {creado && (
          <span className="text-[0.84rem] font-semibold text-exito">
            ¡Listo! Se creó {creado}. Aparece abajo en la lista.
          </span>
        )}
      </div>
      {error && (
        <div className="sm:col-span-2">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </form>
  );
}
