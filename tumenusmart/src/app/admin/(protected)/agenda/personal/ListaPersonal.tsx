"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Entrada, Pastilla, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { formatearTelefonoPersonal, nombreCompleto, type MiembroFila } from "@/lib/agenda-personal";
import { AvatarPersonal } from "../AvatarPersonal";
import { FormularioPersonal } from "./FormularioPersonal";

/** Sin tildes ni mayúsculas, para que "barbero" encuentre a "Bárbero". */
function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function textoCitas(n: number): string {
  return n === 1 ? "1 cita" : `${n} citas`;
}

function textoServicios(n: number): string {
  return n === 1 ? "1 servicio" : `${n} servicios`;
}

/**
 * La pantalla de Personal: el buscador, el botón para añadir y la lista.
 * "Añadir personal" y "Editar" abren el mismo panel lateral con el formulario.
 *
 * En pantalla ancha la lista es una tabla; en el celular son tarjetas, con el
 * botón Editar siempre a la mano.
 */
export function ListaPersonal({ miembros }: { miembros: MiembroFila[] }) {
  const [busqueda, setBusqueda] = useState("");
  // null: cerrado · "nuevo": alta · un id: editando a esa persona.
  const [panel, setPanel] = useState<null | "nuevo" | string>(null);

  const visibles = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    if (!q) return miembros;
    return miembros.filter((m) => sinTildes(`${nombreCompleto(m)} ${m.profesion ?? ""}`).includes(q));
  }, [miembros, busqueda]);

  const enEdicion = panel && panel !== "nuevo" ? (miembros.find((m) => m.id === panel) ?? null) : null;
  const botonAnadir = (
    <button type="button" onClick={() => setPanel("nuevo")} className={clasesBoton("principal", "md")}>
      <span aria-hidden="true" className="text-[1.1rem] leading-none">
        +
      </span>
      Añadir personal
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {miembros.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-md">
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <Entrada
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre de personal"
              aria-label="Buscar por nombre de personal"
              // Inline y no una clase: el campo ya trae px-3 y no hay garantía de cuál gana.
              style={{ paddingLeft: "2.25rem" }}
            />
          </div>
          <div className="ml-auto">{botonAnadir}</div>
        </div>
      )}

      {miembros.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste personal"
          detalle="Sumá a quienes atienden a tus clientes (barberos, peluqueras, manicuristas…). Cada uno tiene su propia agenda en el calendario."
          accion={botonAnadir}
        />
      ) : visibles.length === 0 ? (
        <Vacio titulo="Nadie coincide con esa búsqueda" />
      ) : (
        <>
          {/* Pantalla ancha: tabla. */}
          <div className="hidden md:block">
            <Tabla>
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Profesión</Th>
                  <Th>Teléfono</Th>
                  <Th className="text-right">Servicios asignados</Th>
                  <Th className="text-right">Conteo de citas</Th>
                  <Th className="text-right">Opciones</Th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((m) => (
                  <Tr key={m.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <AvatarPersonal
                          nombre={nombreCompleto(m)}
                          fotoUrl={m.fotoUrl}
                          indice={miembros.indexOf(m)}
                          className="h-9 w-9 text-[0.75rem]"
                        />
                        <span className="font-semibold text-tinta">{nombreCompleto(m)}</span>
                        {!m.activo && <Pastilla>Inactivo</Pastilla>}
                      </div>
                    </Td>
                    <Td>{m.profesion || <span className="text-tinta-suave">—</span>}</Td>
                    <Td className="cifra whitespace-nowrap">
                      {formatearTelefonoPersonal(m.telefono) || <span className="text-tinta-suave">—</span>}
                    </Td>
                    <Td className="cifra text-right">{m.servicios}</Td>
                    <Td className="cifra text-right">{m.citas}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        {/* Su vista de trabajo: las citas que ya cobró, confirmadas a su nombre. */}
                        <Link href={`/admin/agenda/citas?personal=${m.id}`} className={clasesBoton("navegar", "sm")}>
                          Ver trabajo
                        </Link>
                        <button type="button" onClick={() => setPanel(m.id)} className={clasesBoton("suave", "sm")}>
                          Editar
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabla>
          </div>

          {/* Celular y tablet vertical: una tarjeta por persona. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {visibles.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-linea bg-superficie p-3">
                <AvatarPersonal
                  nombre={nombreCompleto(m)}
                  fotoUrl={m.fotoUrl}
                  indice={miembros.indexOf(m)}
                  className="h-11 w-11 text-[0.85rem]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.92rem] font-semibold text-tinta">{nombreCompleto(m)}</p>
                  <p className="truncate text-[0.8rem] text-tinta-media">
                    {m.profesion || "Sin profesión"} · {textoServicios(m.servicios)} · {textoCitas(m.citas)}
                  </p>
                  {!m.activo && (
                    <span className="mt-1 inline-block">
                      <Pastilla>Inactivo</Pastilla>
                    </span>
                  )}
                </div>
                <div className="flex flex-none flex-col gap-1.5">
                  <Link href={`/admin/agenda/citas?personal=${m.id}`} className={clasesBoton("navegar", "sm")}>
                    Ver trabajo
                  </Link>
                  <button type="button" onClick={() => setPanel(m.id)} className={clasesBoton("suave", "sm")}>
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {panel && (panel === "nuevo" || enEdicion) && (
        <PanelLateral
          titulo={panel === "nuevo" ? "Añadir personal" : "Editar personal"}
          onCerrar={() => setPanel(null)}
          // Al editar hay más para ver (el reporte de trabajos y comisión): el panel es más ancho.
          ancho={panel === "nuevo" ? "normal" : "ancho"}
        >
          <FormularioPersonal key={panel} miembro={enEdicion} onCerrar={() => setPanel(null)} />
        </PanelLateral>
      )}
    </div>
  );
}
