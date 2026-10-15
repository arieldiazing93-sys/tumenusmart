"use client";

import { clasesBoton } from "@/components/ui";
import { useState, useTransition } from "react";
import {
  alternarActivoUsuario,
  eliminarUsuario,
  restablecerPassword,
  type ResultadoAccion,
} from "./actions";

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

  function correr(accion: () => Promise<ResultadoAccion>, exito?: string) {
    setAviso(null);
    iniciar(async () => {
      const resultado = await accion();
      if (!resultado.ok) {
        setAviso(resultado.error);
        return;
      }
      if (exito) setAviso(exito);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        {/* El estado es un botón: tocarlo activa o desactiva el usuario (verde = entra, gris = no entra). */}
        <button
          type="button"
          disabled={pendiente || esUnoMismo}
          title={esUnoMismo ? "No podés desactivar tu propio usuario" : activo ? "Tocá para desactivarlo" : "Tocá para activarlo"}
          onClick={() => correr(() => alternarActivoUsuario(id, !activo))}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
            activo ? "bg-exito-luz text-exito hover:bg-exito-tinte" : "bg-papel-hundido text-tinta-media hover:bg-linea"
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
          className={clasesBoton("navegar", "sm")}
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
            className={clasesBoton("peligro", "sm")}
          >
            Borrar
          </button>
        )}
      </div>

      {abierto && (
        <div className="campos-grises flex flex-wrap items-center justify-end gap-2 rounded-lg border border-azul/40 bg-papel-suave p-2">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña nueva"
            autoComplete="off"
            className="w-48 rounded-lg border border-linea bg-white px-2 py-1.5 text-sm"
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
            className={clasesBoton("navegar", "sm")}
          >
            Guardar
          </button>
          <p className="w-full text-right text-xs text-tinta-suave">
            Anotala antes de guardar: no se puede volver a ver, solo cambiar.
          </p>
        </div>
      )}

      {aviso && <p className="text-xs font-medium text-tinta-media">{aviso}</p>}
    </div>
  );
}
