"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ICONOS, IconoPlegar, type NombreIcono } from "./iconos";

export type Seccion = {
  href: string;
  label: string;
  icono: NombreIcono;
  /** Un punto naranja al lado. Hoy solo lo usa "Ideas". */
  aviso?: boolean;
};

export type GrupoSecciones = { titulo: string; secciones: Seccion[] };

/** Nombre de la cookie donde vive la preferencia de menú plegado. */
export const COOKIE_MENU = "menu_plegado";

/**
 * El menú del panel.
 *
 * Antes eran once enlaces en una fila horizontal arriba de todo. Con once
 * elementos esa fila se parte en dos líneas, no se puede agrupar por tema, y no
 * hay lugar para marcar en cuál estás parado. En columna se lee de un vistazo,
 * se agrupa por lo que hace cada cosa, y la sección activa se ve.
 *
 * Se puede plegar a una tira angosta de solo iconos, porque Pedidos y Reservas
 * son tablas anchas y esos 240 píxeles hacen la diferencia en una pantalla
 * chica. Plegado sigue navegándose con un clic: por eso la tira conserva los
 * iconos en vez de desaparecer del todo.
 *
 * En el celular es un cajón que se abre con un botón, porque ahí ni la columna
 * ni la tira tienen sentido.
 */
export function NavPanel({
  grupos,
  variante,
  plegadaInicial = false,
}: {
  grupos: GrupoSecciones[];
  /**
   * "boton" es el disparador del celular con su cajón; "columna" es la barra
   * fija del escritorio. Son dos instancias distintas y no una sola, porque
   * viven en lugares distintos del layout: el botón va adentro de la barra de
   * arriba y la columna al costado del contenido.
   */
  variante: "boton" | "columna";
  /**
   * Si el menú arranca plegado. Viene del servidor leyendo la cookie, y NO de
   * localStorage a propósito: leer la preferencia recién en el navegador haría
   * que el menú se dibuje ancho y se achique un instante después, a la vista.
   */
  plegadaInicial?: boolean;
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [plegada, setPlegada] = useState(plegadaInicial);

  // Al cambiar de sección el cajón se cierra solo: si quedara abierto, en el
  // celular taparía la pantalla a la que se acaba de entrar.
  useEffect(() => {
    setAbierto(false);
  }, [ruta]);

  // Escape cierra, como cualquier cosa que se superpone.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  /**
   * Guardar la preferencia en una cookie de un año.
   *
   * Cookie y no localStorage porque el servidor la necesita para dibujar el
   * menú ya plegado en la primera pintada. SameSite=Lax alcanza: no es un dato
   * sensible, es una preferencia de tamaño.
   */
  function alternarPlegada() {
    setPlegada((valor) => {
      const nuevo = !valor;
      document.cookie = `${COOKIE_MENU}=${nuevo ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
      return nuevo;
    });
  }

  /**
   * Qué sección está activa.
   *
   * Se compara por prefijo para que /admin/productos/abc123 siga marcando
   * "Productos". Pero /admin/configuracion/horarios NO debe marcar dos: gana
   * la coincidencia más larga.
   */
  const activa = grupos
    .flatMap((g) => g.secciones)
    .filter((s) => ruta === s.href || ruta.startsWith(s.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  function lista(compacta: boolean) {
    return (
      <nav className={`flex flex-col ${compacta ? "gap-3 p-2" : "gap-5 p-3"}`}>
        {grupos.map((grupo) => (
          <div key={grupo.titulo}>
            {compacta ? (
              // Plegado no entra el título del grupo, pero la separación entre
              // grupos sí importa: es lo que evita que once iconos se lean
              // como una lista sin orden.
              <span aria-hidden="true" className="mx-auto mb-2 block h-px w-5 bg-linea first:hidden" />
            ) : (
              <p className="px-3 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                {grupo.titulo}
              </p>
            )}

            <ul className="flex flex-col gap-0.5">
              {grupo.secciones.map((s) => {
                const esActiva = activa === s.href;
                const Icono = ICONOS[s.icono];
                return (
                  <li key={s.href}>
                    <Link
                      href={s.href}
                      aria-current={esActiva ? "page" : undefined}
                      // Plegado, el nombre de la sección se pierde: el title lo
                      // devuelve al pasar el mouse, y aria-label al lector de
                      // pantalla.
                      title={compacta ? s.label : undefined}
                      aria-label={compacta ? s.label : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-lg text-[0.86rem] font-medium transition-colors duration-100 ${
                        compacta ? "justify-center px-2 py-2.5" : "px-3 py-2"
                      } ${
                        esActiva
                          ? "bg-brand-light text-brand-texto"
                          : "text-tinta-media hover:bg-papel-hundido hover:text-tinta"
                      }`}
                    >
                      {/* La barrita del costado marca dónde estás sin depender
                          solo del color de fondo. */}
                      <span
                        aria-hidden="true"
                        className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-brand transition-opacity duration-150 ${
                          esActiva ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <Icono />
                      {!compacta && <span className="flex-1">{s.label}</span>}
                      {s.aviso && (
                        <span
                          className={`h-1.5 w-1.5 flex-none rounded-full bg-brand ${
                            compacta ? "absolute right-1.5 top-1.5" : ""
                          }`}
                          aria-label="Novedad sin ver"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    );
  }

  // -------------------------------------------------------------- escritorio
  if (variante === "columna") {
    return (
      <div
        className={`hidden flex-none transition-[width] duration-200 lg:block ${
          plegada ? "w-[3.5rem]" : "w-[15rem]"
        }`}
      >
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto overflow-x-hidden py-3">
          <div className={`flex ${plegada ? "justify-center" : "justify-end px-3"}`}>
            <button
              type="button"
              onClick={alternarPlegada}
              aria-expanded={!plegada}
              aria-label={plegada ? "Expandir el menú" : "Plegar el menú"}
              title={plegada ? "Expandir el menú" : "Plegar el menú"}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-linea bg-white text-tinta-suave transition-colors duration-150 hover:border-brand hover:text-brand"
            >
              <IconoPlegar
                className={`transition-transform duration-200 ${plegada ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {lista(plegada)}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------- celular
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el menú"
        aria-expanded={abierto}
        className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-linea bg-white text-tinta transition-colors hover:border-brand hover:text-brand lg:hidden"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-[1.5px] w-4 bg-current" />
          <span className="block h-[1.5px] w-4 bg-current" />
          <span className="block h-[1.5px] w-4 bg-current" />
        </span>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar el menú"
            onClick={() => setAbierto(false)}
            className="absolute inset-0 bg-noche/40"
          />
          <div className="absolute inset-y-0 left-0 w-[17rem] animate-[entrarIzquierda_0.18s_ease-out] overflow-y-auto border-r border-linea bg-white">
            <div className="flex items-center justify-between border-b border-linea px-4 py-3">
              <span className="text-[0.95rem] font-semibold tracking-titular">TuMenuSmart</span>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-tinta-media hover:bg-papel-hundido"
              >
                ✕
              </button>
            </div>
            {/* En el cajón siempre desplegado: hay lugar de sobra y ahí lo que
                importa es leer los nombres. */}
            {lista(false)}
          </div>
        </div>
      )}
    </>
  );
}
