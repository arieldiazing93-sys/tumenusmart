"use client";

import { useMemo, useState } from "react";
import { Entrada, Pastilla, Vacio, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { nombreDeColaborador, type ColaboradorFila } from "@/lib/asistencia";
import { AvatarPersonal } from "../../agenda/AvatarPersonal";
import { FormularioColaborador } from "./FormularioColaborador";

/** Sin tildes ni mayúsculas, para que "perez" encuentre a "Pérez". */
function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Qué muestra el panel lateral: nada, el alta o la edición de una persona. */
type PanelColaborador = null | { modo: "nuevo" } | { modo: "editar"; id: string };

/**
 * La lista de colaboradores: el buscador, el botón para dar de alta y una tarjeta por persona con su selfie,
 * su cargo y su hora de entrada. "Añadir" y "Editar" abren el panel lateral con el formulario.
 */
export function ListaColaboradores({ colaboradores }: { colaboradores: ColaboradorFila[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [panel, setPanel] = useState<PanelColaborador>(null);

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return colaboradores;
    return colaboradores.filter((c) => sinTildes(`${nombreDeColaborador(c)} ${c.cargo ?? ""}`).includes(q));
  }, [colaboradores, busqueda]);

  const persona = panel && panel.modo === "editar" ? (colaboradores.find((c) => c.id === panel.id) ?? null) : null;

  const botonAnadir = (
    <button type="button" onClick={() => setPanel({ modo: "nuevo" })} className={clasesBoton("nuevo", "md")}>
      <span aria-hidden="true" className="text-[1.1rem] leading-none">
        +
      </span>
      Añadir colaborador
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {colaboradores.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[12rem] flex-1 sm:max-w-md">
            <Entrada
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o cargo"
              aria-label="Buscar por nombre o cargo"
            />
          </div>
          <div className="ml-auto">{botonAnadir}</div>
        </div>
      )}

      {colaboradores.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste a nadie"
          detalle="Cada persona que va a marcar su asistencia necesita estar acá, con su selfie y su PIN. Cargala con ella delante: la selfie es la referencia para revisar sus marcaciones."
          accion={botonAnadir}
        />
      ) : visibles.length === 0 ? (
        <Vacio titulo="Nadie coincide con esa búsqueda" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c, i) => (
            <li
              key={c.id}
              className={`flex items-center gap-3 rounded-xl border-2 border-azul/50 bg-superficie p-3 ${
                c.activo ? "" : "opacity-70"
              }`}
            >
              <AvatarPersonal nombre={nombreDeColaborador(c)} fotoUrl={c.fotoUrl} indice={i} className="h-14 w-14 text-[1rem]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-semibold text-tinta">{nombreDeColaborador(c)}</p>
                <p className="truncate text-[0.8rem] text-tinta-media">{c.cargo || "Sin cargo"}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {c.horaEntrada ? (
                    <Pastilla color="azul">
                      Entra {c.horaEntrada} · {c.toleranciaMin} min
                    </Pastilla>
                  ) : (
                    <Pastilla>Sin hora de entrada</Pastilla>
                  )}
                  {!c.activo && <Pastilla>Inactivo</Pastilla>}
                  {c.sinPin && <Pastilla color="peligro">Sin PIN: no puede marcar</Pastilla>}
                  {c.sinRostro ? (
                    <Pastilla color="amarillo">Sin rostro registrado</Pastilla>
                  ) : (
                    <Pastilla color="exito">Rostro registrado</Pastilla>
                  )}
                  {!c.haceAlmuerzo && <Pastilla>No almuerza</Pastilla>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPanel({ modo: "editar", id: c.id })}
                className={clasesBoton("suave", "sm")}
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {panel && (panel.modo === "nuevo" || persona) && (
        <PanelLateral
          titulo={panel.modo === "nuevo" ? "Añadir colaborador" : "Editar colaborador"}
          onCerrar={() => setPanel(null)}
        >
          <FormularioColaborador
            key={panel.modo === "nuevo" ? "nuevo" : `editar-${panel.id}`}
            colaborador={persona}
            onCerrar={() => setPanel(null)}
          />
        </PanelLateral>
      )}
    </div>
  );
}
