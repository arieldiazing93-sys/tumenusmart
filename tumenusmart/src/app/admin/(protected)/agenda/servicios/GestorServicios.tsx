"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Pastilla, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { PanelLateral } from "@/components/PanelLateral";
import { formatearGuarani } from "@/lib/format";
import { textoDuracion, type PersonalOpcion, type ServicioFila } from "@/lib/servicios-agenda";
import {
  crearCategoriaServicio,
  eliminarCategoriaServicio,
  eliminarServicio as eliminarServicioAccion,
  renombrarCategoriaServicio,
} from "./actions";
import { FormularioServicio } from "./FormularioServicio";

type Categoria = { id: string; nombre: string };

function textoServicios(n: number): string {
  return n === 1 ? "1 servicio" : `${n} servicios`;
}

/** El precio como se lee en la lista: "Desde Gs. 45.000" si es un precio de partida. */
function textoPrecio(s: ServicioFila): string {
  return `${s.tipoPrecio === "desde" ? "Desde " : ""}${formatearGuarani(s.precio)}`;
}

// ---------------------------------------------------------------------------
//  El menú ⋮ de una categoría
// ---------------------------------------------------------------------------

function MenuCategoria({
  nombre,
  onRenombrar,
  onEliminar,
}: {
  nombre: string;
  onRenombrar: () => void;
  onEliminar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTocarAfuera = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const alApretarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("pointerdown", alTocarAfuera);
    document.addEventListener("keydown", alApretarTecla);
    return () => {
      document.removeEventListener("pointerdown", alTocarAfuera);
      document.removeEventListener("keydown", alApretarTecla);
    };
  }, [abierto]);

  return (
    <div ref={raiz} className="relative flex-none">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={`Opciones de la categoría ${nombre}`}
        onClick={() => setAbierto((a) => !a)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-tinta-media transition-colors hover:bg-papel-hundido hover:text-tinta sm:h-9 sm:w-9"
      >
        <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="12" cy="19" r="1.8" />
        </svg>
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-linea bg-superficie p-1.5 shadow-media"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              onRenombrar();
            }}
            className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-[0.86rem] font-medium text-tinta transition-colors hover:bg-papel-hundido"
          >
            Renombrar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              onEliminar();
            }}
            className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-[0.86rem] font-medium text-peligro transition-colors hover:bg-peligro-luz"
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  La pantalla
// ---------------------------------------------------------------------------

/**
 * Servicios de la Reserva de turnos: a la izquierda las categorías (Cortes,
 * Barba, Color…), a la derecha los servicios de la categoría elegida.
 *
 * En pantalla ancha son dos paneles lado a lado; en el celular las categorías
 * pasan a una tira de botones que se desliza arriba y los servicios quedan
 * debajo, como tarjetas. "Añadir servicio" abre un panel lateral con el
 * formulario; "Añadir" categoría, una ventana corta.
 */
export function GestorServicios({
  categorias,
  servicios,
  personal,
}: {
  categorias: Categoria[];
  servicios: ServicioFila[];
  personal: PersonalOpcion[];
}) {
  const router = useRouter();
  const [seleccionada, setSeleccionada] = useState<string | null>(categorias[0]?.id ?? null);
  const [ventana, setVentana] = useState<null | { tipo: "nueva" } | { tipo: "renombrar"; id: string }>(null);
  const [panel, setPanel] = useState<null | "nuevo" | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  // Si la categoría elegida se borró (o todavía no cargó), cae en la primera.
  const actual = categorias.find((c) => c.id === seleccionada) ?? categorias[0] ?? null;
  const delaCategoria = actual ? servicios.filter((s) => s.categoryId === actual.id) : [];
  const enEdicion = panel && panel !== "nuevo" ? (servicios.find((s) => s.id === panel) ?? null) : null;
  const nombresDePersonal = new Map(personal.map((p) => [p.id, p.nombre] as [string, string]));

  function eliminarCategoria(c: Categoria) {
    if (!window.confirm(`¿Eliminar la categoría “${c.nombre}”?`)) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarCategoriaServicio(c.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function eliminarServicio(s: ServicioFila) {
    if (!window.confirm(`¿Eliminar el servicio “${s.nombre}”?`)) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarServicioAccion(s.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const opcionesDeCategoria = (c: Categoria) => (
    <MenuCategoria
      nombre={c.nombre}
      onRenombrar={() => setVentana({ tipo: "renombrar", id: c.id })}
      onEliminar={() => eliminarCategoria(c)}
    />
  );

  const botonAnadirServicio = (
    <button
      type="button"
      onClick={() => setPanel("nuevo")}
      disabled={!actual}
      className={clasesBoton("principal", "md")}
    >
      <span aria-hidden="true" className="text-[1.1rem] leading-none">
        +
      </span>
      Añadir servicio
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-peligro/30 bg-peligro-luz p-3 text-[0.85rem] text-peligro"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso" className="flex-none font-semibold">
            ✕
          </button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        {/* ---------- categorías ---------- */}
        <section className="rounded-xl border border-linea bg-superficie p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Categoría de servicio</h2>
            <button type="button" onClick={() => setVentana({ tipo: "nueva" })} className={clasesBoton("principal", "sm")}>
              <span aria-hidden="true" className="text-[1.05rem] leading-none">
                +
              </span>
              Añadir
            </button>
          </div>

          {categorias.length === 0 ? (
            <p className="mt-3 text-[0.85rem] leading-snug text-tinta-media">
              Todavía no hay categorías. Creá la primera (por ejemplo Cortes, Barba o Color) para empezar a cargar
              servicios.
            </p>
          ) : (
            <>
              {/* Pantalla ancha: lista vertical. */}
              <ul className="mt-3 hidden flex-col gap-2 lg:flex">
                {categorias.map((c) => {
                  const esActual = actual?.id === c.id;
                  return (
                    <li
                      key={c.id}
                      className={`flex items-center gap-1 rounded-xl border pr-1 transition-colors ${
                        esActual ? "border-brand/40 bg-brand-light" : "border-transparent bg-papel-suave hover:border-linea"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSeleccionada(c.id)}
                        aria-current={esActual ? "true" : undefined}
                        className="min-w-0 flex-1 px-3.5 py-2.5 text-left"
                      >
                        <span
                          className={`block truncate text-[0.95rem] font-semibold ${
                            esActual ? "text-brand-texto" : "text-tinta"
                          }`}
                        >
                          {c.nombre}
                        </span>
                        <span className="block text-[0.76rem] text-tinta-suave">
                          {textoServicios(servicios.filter((s) => s.categoryId === c.id).length)}
                        </span>
                      </button>
                      {opcionesDeCategoria(c)}
                    </li>
                  );
                })}
              </ul>

              {/* Celular y tablet: una tira de botones que se desliza de costado. */}
              <ul className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
                {categorias.map((c) => {
                  const esActual = actual?.id === c.id;
                  return (
                    <li key={c.id} className="flex-none">
                      <button
                        type="button"
                        onClick={() => setSeleccionada(c.id)}
                        aria-current={esActual ? "true" : undefined}
                        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[0.86rem] font-semibold transition-colors ${
                          esActual
                            ? "border-brand bg-brand-light text-brand-texto"
                            : "border-linea bg-superficie text-tinta hover:border-brand"
                        }`}
                      >
                        {c.nombre}
                        <span
                          className={`rounded-full px-1.5 text-[0.7rem] ${
                            esActual ? "bg-brand text-white" : "bg-papel-hundido text-tinta-media"
                          }`}
                        >
                          {servicios.filter((s) => s.categoryId === c.id).length}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        {/* ---------- servicios de la categoría ---------- */}
        <section className="min-w-0 rounded-xl border border-linea bg-superficie p-4">
          {!actual ? (
            <Vacio
              titulo="Empezá creando una categoría"
              detalle="Las categorías agrupan tus servicios: Cortes, Barba, Color… Después cargás los servicios de cada una."
              accion={
                <button type="button" onClick={() => setVentana({ tipo: "nueva" })} className={clasesBoton("principal", "md")}>
                  + Añadir categoría
                </button>
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1">
                  <h2 className="truncate text-[1.1rem] font-semibold tracking-titular text-tinta">{actual.nombre}</h2>
                  {/* En pantalla ancha el menú está en la lista; acá solo en celular. */}
                  <span className="lg:hidden">{opcionesDeCategoria(actual)}</span>
                </div>
                {botonAnadirServicio}
              </div>

              {delaCategoria.length === 0 ? (
                <div className="mt-4">
                  <Vacio
                    titulo={`Todavía no hay servicios en ${actual.nombre}`}
                    detalle="Cargá el primero: su duración, su precio y quién lo realiza."
                  />
                </div>
              ) : (
                <>
                  {/* Pantalla ancha: tabla. */}
                  <div className="mt-4 hidden md:block">
                    <Tabla>
                      <thead>
                        <tr>
                          <Th>Servicio</Th>
                          <Th>Duración</Th>
                          <Th>Precio</Th>
                          <Th className="text-right">Opciones</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {delaCategoria.map((s) => (
                          <Tr key={s.id}>
                            <Td>
                              <div className="flex items-center gap-2.5">
                                <span
                                  aria-hidden="true"
                                  className="h-3 w-3 flex-none rounded-full"
                                  style={{ backgroundColor: s.color }}
                                />
                                <div className="min-w-0">
                                  <p className="flex flex-wrap items-center gap-2 font-semibold text-tinta">
                                    {s.nombre}
                                    {!s.activo && <Pastilla>Inactivo</Pastilla>}
                                  </p>
                                  <p className="truncate text-[0.76rem] text-tinta-suave">
                                    {s.personalIds.map((id) => nombresDePersonal.get(id)).filter(Boolean).join(", ") ||
                                      "Sin personal"}
                                  </p>
                                </div>
                              </div>
                            </Td>
                            <Td className="whitespace-nowrap">
                              {textoDuracion(s.duracionMin)}
                              {s.bufferMin > 0 && (
                                <span className="block text-[0.74rem] text-tinta-suave">+ {s.bufferMin} min de búfer</span>
                              )}
                            </Td>
                            <Td className="cifra whitespace-nowrap font-medium text-tinta">{textoPrecio(s)}</Td>
                            <Td className="text-right">
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setPanel(s.id)} className={clasesBoton("suave", "sm")}>
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => eliminarServicio(s)}
                                  disabled={pendiente}
                                  className={clasesBoton("peligro", "sm")}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Tabla>
                  </div>

                  {/* Celular: una tarjeta por servicio. */}
                  <ul className="mt-4 flex flex-col gap-2 md:hidden">
                    {delaCategoria.map((s) => (
                      <li key={s.id} className="rounded-xl border border-linea bg-superficie p-3">
                        <div className="flex items-start gap-2.5">
                          <span
                            aria-hidden="true"
                            className="mt-1.5 h-3 w-3 flex-none rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-2 text-[0.95rem] font-semibold text-tinta">
                              {s.nombre}
                              {!s.activo && <Pastilla>Inactivo</Pastilla>}
                            </p>
                            <p className="mt-0.5 text-[0.82rem] text-tinta-media">
                              {textoDuracion(s.duracionMin)}
                              {s.bufferMin > 0 ? ` (+ ${s.bufferMin} min de búfer)` : ""} ·{" "}
                              <span className="font-semibold text-tinta">{textoPrecio(s)}</span>
                            </p>
                            <p className="truncate text-[0.76rem] text-tinta-suave">
                              {s.personalIds.map((id) => nombresDePersonal.get(id)).filter(Boolean).join(", ") ||
                                "Sin personal"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPanel(s.id)}
                            className={`${clasesBoton("suave", "md")} flex-1`}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminarServicio(s)}
                            disabled={pendiente}
                            className={`${clasesBoton("peligro", "md")} flex-1`}
                          >
                            Eliminar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {/* ---------- ventana de categoría ---------- */}
      {ventana && (
        <Modal titulo={ventana.tipo === "nueva" ? "Nueva categoría" : "Renombrar categoría"} onCerrar={() => setVentana(null)}>
          <FormularioCategoria
            key={ventana.tipo === "nueva" ? "nueva" : ventana.id}
            id={ventana.tipo === "renombrar" ? ventana.id : null}
            nombreInicial={ventana.tipo === "renombrar" ? (categorias.find((c) => c.id === ventana.id)?.nombre ?? "") : ""}
            onCerrar={() => setVentana(null)}
            onCreada={(id) => setSeleccionada(id)}
          />
        </Modal>
      )}

      {/* ---------- panel lateral del servicio ---------- */}
      {panel && (panel === "nuevo" || enEdicion) && (
        <PanelLateral titulo={panel === "nuevo" ? "Añadir servicio" : "Editar servicio"} onCerrar={() => setPanel(null)}>
          <FormularioServicio
            key={panel}
            servicio={enEdicion}
            categorias={categorias}
            personal={personal}
            categoriaInicial={actual?.id ?? null}
            onCerrar={() => setPanel(null)}
          />
        </PanelLateral>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  El formulario corto de categoría
// ---------------------------------------------------------------------------

function FormularioCategoria({
  id,
  nombreInicial,
  onCerrar,
  onCreada,
}: {
  /** null para crear una nueva; el id de la que se renombra. */
  id: string | null;
  nombreInicial: string;
  onCerrar: () => void;
  onCreada: (id: string) => void;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreInicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      if (id) {
        const r = await renombrarCategoriaServicio(id, nombre);
        if (!r.ok) {
          setError(r.error);
          return;
        }
      } else {
        const r = await crearCategoriaServicio(nombre);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        onCreada(r.id);
      }
      router.refresh();
      onCerrar();
    });
  }

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-4">
      <Campo etiqueta="Nombre">
        <Entrada
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          autoFocus
          maxLength={60}
          placeholder="Categoría de servicio (ej: Cortes)"
        />
        {error && <MensajeError>{error}</MensajeError>}
      </Campo>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCerrar} className={clasesBoton("suave", "md")}>
          Cancelar
        </button>
        <button type="submit" disabled={pendiente || !nombre.trim()} className={clasesBoton("principal", "md")}>
          {pendiente ? "Guardando…" : id ? "Guardar" : "Crear"}
        </button>
      </div>
    </form>
  );
}
