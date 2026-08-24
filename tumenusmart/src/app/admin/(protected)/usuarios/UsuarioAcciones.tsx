"use client";

import { useState, useTransition } from "react";
import { alternarActivoUsuario, eliminarUsuario, restablecerPassword } from "./actions";

export function UsuarioAcciones({
  id,
  activo,
  email,
  esUnoMismo,
}: {
  id: string;
  activo: boolean;
  email: string;
  esUnoMismo: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  function correr(accion: () => Promise<unknown>, exito?: string) {
    setAviso(null);
    iniciar(async () => {
      try {
        await accion();
        if (exito) setAviso(exito);
      } catch (err) {
        setAviso(err instanceof Error ? err.message : "No se pudo completar");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          disabled={pendiente || esUnoMismo}
          title={esUnoMismo ? "No podés desactivar tu propio usuario" : undefined}
          onClick={() => correr(() => alternarActivoUsuario(id, !activo))}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium disabled:opacity-50 ${
            activo ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {activo ? "Activo" : "Inactivo"}
        </button>

        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            setAbierto((v) => !v);
            setAviso(null);
          }}
          className="text-neutral-500 hover:text-brand hover:underline disabled:opacity-50"
        >
          Cambiar contraseña
        </button>

        {!esUnoMismo && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              if (!confirm(`¿Borrar el usuario ${email}? No se puede deshacer.`)) return;
              correr(() => eliminarUsuario(id));
            }}
            className="text-red-500 hover:underline disabled:opacity-50"
          >
            Borrar
          </button>
        )}
      </div>

      {abierto && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña nueva"
            autoComplete="off"
            className="w-48 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            disabled={pendiente || password.length === 0}
            onClick={() => {
              const datos = new FormData();
              datos.set("password", password);
              correr(() => restablecerPassword(id, datos), "Contraseña actualizada.");
              setPassword("");
            }}
            className="rounded-lg bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            Guardar
          </button>
          <p className="w-full text-right text-xs text-neutral-400">
            Anotala antes de guardar: no se puede volver a ver, solo cambiar.
          </p>
        </div>
      )}

      {aviso && <p className="text-xs text-neutral-600">{aviso}</p>}
    </div>
  );
}
