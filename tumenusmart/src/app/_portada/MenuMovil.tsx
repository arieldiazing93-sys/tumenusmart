"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconoCerrar, IconoMenu } from "./Iconos";

export type EnlaceMenu = { href: string; texto: string };

/**
 * El menú de la portada en pantallas donde la barra no entra.
 *
 * Es lo único de la portada que necesita JavaScript: el resto de la página se
 * sirve ya armada. Se cierra al tocar un enlace (si no, taparía la sección a la
 * que acaba de saltar) y con Escape.
 */
export default function MenuMovil({ enlaces }: { enlaces: EnlaceMenu[] }) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  return (
    <div className="xl:hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="menu-portada"
        aria-label={abierto ? "Cerrar el menú" : "Abrir el menú"}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-linea bg-superficie text-tinta transition-colors hover:bg-papel-suave"
      >
        {abierto ? <IconoCerrar tam={18} /> : <IconoMenu tam={18} />}
      </button>

      {abierto ? (
        <nav
          id="menu-portada"
          aria-label="Secciones de la página"
          className="absolute inset-x-0 top-full border-b border-linea bg-papel shadow-media"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-5 py-2 sm:px-8">
            {enlaces.map((e) => (
              <li key={e.href}>
                <a
                  href={e.href}
                  onClick={() => setAbierto(false)}
                  className="flex h-12 items-center border-b border-linea-fina text-[1rem] font-medium text-tinta"
                >
                  {e.texto}
                </a>
              </li>
            ))}
            <li>
              <Link href="/admin/login" className="flex h-12 items-center text-[1rem] font-semibold text-brand">
                Iniciar sesión
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
