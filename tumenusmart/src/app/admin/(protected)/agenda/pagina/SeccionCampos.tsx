"use client";

import { useState } from "react";
import { Entrada, Tarjeta, clasesBoton } from "@/components/ui";
import { Interruptor } from "@/components/Interruptor";
import {
  MAX_CAMPOS_PERSONALIZADOS,
  claveCampoNuevo,
  type CampoFormulario,
} from "@/lib/pagina-reservas";
import type { PropsSeccion } from "./tipos";

/**
 * Campos del formulario de reserva: qué datos le pide la página al cliente al
 * reservar y cuáles son obligatorios. El nombre siempre está y siempre es
 * obligatorio. Se pueden sumar campos propios (por ejemplo "¿Cómo nos conociste?").
 */
export function SeccionCampos({ datos, cambiar }: PropsSeccion) {
  const [agregando, setAgregando] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const campos = datos.campos;
  const personalizados = campos.filter((c) => c.tipo === "personalizado").length;

  function actualizar(clave: string, parche: Partial<CampoFormulario>) {
    cambiar({ campos: campos.map((c) => (c.clave === clave ? { ...c, ...parche } : c)) });
  }

  function agregar() {
    const etiqueta = nuevo.trim().slice(0, 40);
    if (!etiqueta) return;
    cambiar({
      campos: [
        ...campos,
        { clave: claveCampoNuevo(campos), etiqueta, activo: true, obligatorio: false, tipo: "personalizado" },
      ],
    });
    setNuevo("");
    setAgregando(false);
  }

  return (
    <Tarjeta className="flex flex-col gap-3">
      <div>
        <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">Campos del formulario de reserva</h3>
        <p className="mt-0.5 text-[0.82rem] text-tinta-media">
          Elegí qué datos completan tus clientes al reservar. Marcá como obligatorios los que necesites.
        </p>
      </div>

      <ul className="divide-y divide-linea-fina">
        {campos.map((c) => {
          const bloqueado = c.tipo === "fijo";
          return (
            <li key={c.clave} className="flex items-center gap-3 py-3">
              <label className={`flex min-w-0 flex-1 items-center gap-3 ${bloqueado ? "" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={c.activo}
                  disabled={bloqueado}
                  onChange={(e) =>
                    actualizar(c.clave, { activo: e.target.checked, obligatorio: e.target.checked ? c.obligatorio : false })
                  }
                  className="h-4 w-4 flex-none accent-brand"
                />
                <span className={`truncate text-[0.92rem] ${c.activo ? "font-medium text-tinta" : "text-tinta-suave"}`}>
                  {c.etiqueta}
                </span>
              </label>

              {c.activo && (
                <div className="flex flex-none items-center gap-2">
                  <span className="text-[0.76rem] text-tinta-suave">Obligatorio</span>
                  <Interruptor
                    activo={c.obligatorio}
                    onChange={(v) => actualizar(c.clave, { obligatorio: v })}
                    etiqueta={`${c.etiqueta}: obligatorio`}
                    tono="azul"
                    deshabilitado={bloqueado}
                  />
                </div>
              )}

              {c.tipo === "personalizado" && (
                <button
                  type="button"
                  onClick={() => cambiar({ campos: campos.filter((x) => x.clave !== c.clave) })}
                  aria-label={`Quitar el campo ${c.etiqueta}`}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-tinta-suave transition-colors hover:bg-peligro-luz hover:text-peligro"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {agregando ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[12rem] flex-1">
            <Entrada
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregar();
                }
              }}
              maxLength={40}
              autoFocus
              placeholder="Nombre del campo (ej: ¿Cómo nos conociste?)"
              aria-label="Nombre del campo nuevo"
            />
          </div>
          <button type="button" onClick={agregar} disabled={!nuevo.trim()} className={clasesBoton("principal", "md")}>
            Añadir
          </button>
          <button
            type="button"
            onClick={() => {
              setAgregando(false);
              setNuevo("");
            }}
            className={clasesBoton("suave", "md")}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setAgregando(true)}
            disabled={personalizados >= MAX_CAMPOS_PERSONALIZADOS}
            className={clasesBoton("navegar", "md")}
          >
            + Añadir campo
          </button>
          {personalizados >= MAX_CAMPOS_PERSONALIZADOS && (
            <p className="mt-1.5 text-[0.78rem] text-tinta-suave">
              Podés tener hasta {MAX_CAMPOS_PERSONALIZADOS} campos propios.
            </p>
          )}
        </div>
      )}
    </Tarjeta>
  );
}
