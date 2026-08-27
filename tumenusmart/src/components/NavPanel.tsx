"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type Seccion = {
  href: string;
  label: string;
  /** Un punto naranja al lado. Hoy solo lo usa "Ideas". */
  aviso?: boolean;
};

export type GrupoSecciones = { titulo: string; secciones: Seccion[] };

/**
 * El menú del panel.
 *
 * Antes eran once enlaces en una fila horizontal arriba de todo. Con once
 * elementos esa fila se parte en dos líneas, no se puede agrupar por tema, y no
 * hay lugar para marcar en cuál estás parado. En columna se lee de un vistazo,
 * se agrupa por lo que hace cada cosa, y la sección activa se ve.
 *
 * En el celular se convierte en un cajón que se abre con un botón, porque ahí
 * la columna se comería media pantalla.
 */
export function NavPanel({
  grupos,
  variante,
}: {
  grupos: GrupoSecciones[];
  /**
   * "boton" es el disparador del celular con su cajón; "columna" es la barra
   * fija del escritorio. Son dos instancias distintas y no una sola, porque
   * viven en lugares distintos del layout: el botón va adentro de la barra de
   * arriba y la columna al costado del contenido.
   */
  variante: "boton" | "columna";
}) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

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

  const lista = (
    <nav className="flex flex-col gap-5 p-3">
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-3 pb-1.5 text-[0.68rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            {grupo.titulo}
          </p>
          <ul className="flex flex-col gap-0.5">
            {grupo.secciones.map((s) => {
              const esActiva = activa === s.href;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={esActiva ? "page" : undefined}
                    className={`group relative flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[0.86rem] font-medium transition-colors duration-100 ${
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
                    {s.label}
                    {s.aviso && (
                      <span
                        className="h-1.5 w-1.5 flex-none rounded-full bg-brand"
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

  if (variante === "columna") {
    return (
      <div className="hidden w-[15rem] flex-none lg:block">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto py-3">
          {lista}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* --- celular: botón y cajón --- */}
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
            {lista}
          </div>
        </div>
      )}

    </>
  );
}
