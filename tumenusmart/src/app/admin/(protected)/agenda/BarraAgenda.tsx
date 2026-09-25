"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ESTADOS_CITA,
  VISTAS_AGENDA,
  fechaVecina,
  urlAgenda,
  type EstadoCita,
  type ParametrosAgenda,
} from "@/lib/agenda";
import { AvatarPersonal } from "./AvatarPersonal";

/**
 * La barra de arriba de la Agenda: ir a hoy, moverse entre períodos, elegir la
 * vista (Día, Semana, Mes), elegir a quién del personal se mira y filtrar por
 * estado del turno.
 *
 * Todo lo que se elige queda en la dirección de la página, así se puede volver
 * atrás, recargar o compartir el link y se ve lo mismo.
 *
 * Es responsive de verdad: en pantalla ancha va todo en una fila; en el celular
 * se parte en dos, y los menús se abren como una hoja desde abajo, con botones
 * grandes para el dedo.
 */

// ---------------------------------------------------------------------------
//  Íconos (chicos, sueltos: no hay otros iguales en el panel)
// ---------------------------------------------------------------------------

function Icono({ children, tam = 16 }: { children: ReactNode; tam?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none"
    >
      {children}
    </svg>
  );
}

const IconoIzquierda = () => (
  <Icono>
    <path d="m15 18-6-6 6-6" />
  </Icono>
);
const IconoDerecha = () => (
  <Icono>
    <path d="m9 18 6-6-6-6" />
  </Icono>
);
const IconoAbajo = () => (
  <Icono tam={14}>
    <path d="m6 9 6 6 6-6" />
  </Icono>
);
const IconoCheck = ({ tam = 15 }: { tam?: number }) => (
  <Icono tam={tam}>
    <path d="M20 6 9 17l-5-5" />
  </Icono>
);
const IconoCerrar = () => (
  <Icono>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icono>
);
const IconoCalendario = () => (
  <Icono>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Icono>
);
const IconoPersonal = () => (
  <Icono>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Icono>
);
const IconoFiltro = () => (
  <Icono>
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </Icono>
);

// ---------------------------------------------------------------------------
//  Botones
// ---------------------------------------------------------------------------

/** Base de todos los botones de la barra: 40px de alto en el celular (para el dedo), 36 en pantalla ancha. */
const BOTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-[0.85rem] font-semibold " +
  "transition-colors duration-150 active:scale-[0.97] sm:h-9";
const BOTON_NEUTRO = `${BOTON} border-linea bg-superficie text-tinta hover:border-brand hover:text-brand`;
/** Azul: navegar. Es el mismo criterio que el resto del panel. */
const BOTON_HOY = `${BOTON} border-azul/35 bg-azul-luz text-azul-oscuro hover:border-azul hover:bg-azul hover:text-white`;

const ITEM_MENU =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[0.88rem] font-medium " +
  "text-tinta transition-colors hover:bg-papel-hundido";
const ITEM_MENU_ACTIVO = "bg-brand-light/60 text-brand-texto";

/**
 * Un botón que abre un menú. En pantalla ancha el menú cuelga debajo del
 * botón; en el celular sube como una hoja desde abajo con un velo detrás, y
 * tiene su propio "cerrar". Se cierra con Escape y al tocar afuera.
 */
function Desplegable({
  titulo,
  etiqueta,
  icono,
  activo = false,
  insignia = 0,
  alinear = "derecha",
  ancho = "sm:w-64",
  children,
}: {
  /** Encabezado de la hoja en el celular. */
  titulo: string;
  etiqueta: string;
  icono?: ReactNode;
  /** El botón se tiñe de naranja para avisar que hay algo elegido. */
  activo?: boolean;
  insignia?: number;
  alinear?: "izquierda" | "derecha";
  ancho?: string;
  children: (cerrar: () => void) => ReactNode;
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
    <div ref={raiz} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className={`${BOTON} w-full ${
          activo
            ? "border-brand bg-brand-light text-brand-texto"
            : "border-linea bg-superficie text-tinta hover:border-brand hover:text-brand"
        }`}
      >
        {icono}
        <span className="min-w-0 truncate">{etiqueta}</span>
        {insignia > 0 && (
          <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-brand px-1 text-[0.68rem] font-bold text-white">
            {insignia}
          </span>
        )}
        <IconoAbajo />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40 bg-tinta/40 sm:hidden" onClick={() => setAbierto(false)} aria-hidden="true" />
          <div
            role="menu"
            className={`fixed inset-x-3 bottom-3 z-50 max-h-[75dvh] overflow-y-auto rounded-2xl border border-linea bg-superficie p-2 shadow-alta sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-1.5 sm:max-h-[26rem] sm:rounded-xl ${ancho} ${
              alinear === "derecha" ? "sm:right-0" : "sm:left-0"
            }`}
          >
            <div className="mb-1 flex items-center justify-between px-2 pt-1 sm:hidden">
              <p className="text-[0.95rem] font-semibold text-tinta">{titulo}</p>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-media hover:bg-papel-hundido"
              >
                <IconoCerrar />
              </button>
            </div>
            {children(() => setAbierto(false))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  La barra
// ---------------------------------------------------------------------------

type Miembro = { id: string; nombre: string; fotoUrl: string | null };

export function BarraAgenda({
  parametros,
  hoy,
  titulo,
  personal,
  vistaEnUrl,
}: {
  parametros: ParametrosAgenda;
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
  /** "21 sep – 27 sep", "Septiembre 2026"… */
  titulo: string;
  personal: Miembro[];
  /** false si la dirección no traía la vista: en el celular se abre en "Día". */
  vistaEnUrl: boolean;
}) {
  const router = useRouter();

  // En el celular una semana entera no entra: si nadie eligió vista, arranca en Día.
  const urlDia = urlAgenda(parametros, { vista: "dia" });
  useEffect(() => {
    if (vistaEnUrl) return;
    if (window.matchMedia("(max-width: 639px)").matches) router.replace(urlDia, { scroll: false });
  }, [vistaEnUrl, urlDia, router]);

  const indiceElegido = personal.findIndex((p) => p.id === parametros.personal);
  const elegido = indiceElegido >= 0 ? personal[indiceElegido] : null;

  // ---------- ir a hoy y moverse entre períodos ----------
  const navegacion = (
    <div className="flex items-center gap-2">
      <Link href={urlAgenda(parametros, { fecha: hoy })} scroll={false} className={`${BOTON_HOY} px-4`}>
        Hoy
      </Link>
      <Link
        href={urlAgenda(parametros, { fecha: fechaVecina(parametros.vista, parametros.fecha, -1) })}
        scroll={false}
        aria-label="Anterior"
        className={`${BOTON_NEUTRO} w-10 px-0 sm:w-9`}
      >
        <IconoIzquierda />
      </Link>
      <Link
        href={urlAgenda(parametros, { fecha: fechaVecina(parametros.vista, parametros.fecha, 1) })}
        scroll={false}
        aria-label="Siguiente"
        className={`${BOTON_NEUTRO} w-10 px-0 sm:w-9`}
      >
        <IconoDerecha />
      </Link>
    </div>
  );

  // ---------- Día / Semana / Mes: tres botones juntos, el elegido resaltado en azul ----------
  const vista = (
    <div role="tablist" aria-label="Ver por" className="flex rounded-lg bg-papel-hundido p-1">
      {VISTAS_AGENDA.map((v) => {
        const elegida = v.valor === parametros.vista;
        return (
          <Link
            key={v.valor}
            href={urlAgenda(parametros, { vista: v.valor })}
            scroll={false}
            role="tab"
            aria-selected={elegida}
            className={`flex h-9 flex-1 items-center justify-center rounded-md px-4 text-[0.85rem] font-semibold transition-colors duration-150 sm:h-8 ${
              elegida
                ? "bg-superficie text-azul-oscuro shadow-sm ring-1 ring-azul/25"
                : "text-tinta-media hover:text-tinta"
            }`}
          >
            {v.etiqueta}
          </Link>
        );
      })}
    </div>
  );

  // ---------- a quién se mira ----------
  const selectorPersonal = (
    <Desplegable
      titulo="Personal"
      etiqueta={elegido ? elegido.nombre : "Personal"}
      icono={<IconoPersonal />}
      activo={!!elegido}
    >
      {(cerrar) => (
        <>
          <Link
            href={urlAgenda(parametros, { personal: null })}
            scroll={false}
            onClick={cerrar}
            role="menuitemradio"
            aria-checked={!elegido}
            className={`${ITEM_MENU} ${!elegido ? ITEM_MENU_ACTIVO : ""}`}
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-papel-hundido text-tinta-media">
              <IconoPersonal />
            </span>
            <span className="flex-1">Todo el personal</span>
            {!elegido && <IconoCheck />}
          </Link>

          {personal.length === 0 ? (
            <p className="px-3 py-4 text-center text-[0.85rem] text-tinta-media">
              Todavía no hay personal cargado.
            </p>
          ) : (
            personal.map((p, i) => {
              const esElegido = p.id === parametros.personal;
              return (
                <Link
                  key={p.id}
                  href={urlAgenda(parametros, { personal: p.id })}
                  scroll={false}
                  onClick={cerrar}
                  role="menuitemradio"
                  aria-checked={esElegido}
                  className={`${ITEM_MENU} ${esElegido ? ITEM_MENU_ACTIVO : ""}`}
                >
                  <AvatarPersonal nombre={p.nombre} fotoUrl={p.fotoUrl} indice={i} className="h-7 w-7 text-[0.68rem]" />
                  <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                  {esElegido && <IconoCheck />}
                </Link>
              );
            })
          )}
        </>
      )}
    </Desplegable>
  );

  // ---------- filtrar por estado del turno ----------
  const filtro = (
    <Desplegable
      titulo="Filtrar por estado"
      etiqueta="Filtro"
      icono={<IconoFiltro />}
      activo={parametros.ocultar.length > 0}
      insignia={parametros.ocultar.length}
    >
      {() => (
        <>
          <p className="hidden px-2.5 pb-1 pt-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-tinta-suave sm:block">
            Mostrar turnos
          </p>
          {ESTADOS_CITA.map((e) => {
            const visible = !parametros.ocultar.includes(e.valor);
            const ocultar: EstadoCita[] = visible
              ? [...parametros.ocultar, e.valor]
              : parametros.ocultar.filter((o) => o !== e.valor);
            return (
              // No cierra el menú: se pueden tildar varios estados seguidos.
              <Link
                key={e.valor}
                href={urlAgenda(parametros, { ocultar })}
                scroll={false}
                role="menuitemcheckbox"
                aria-checked={visible}
                className={ITEM_MENU}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-md border ${
                    visible ? `${e.punto} border-transparent text-white` : "border-linea bg-superficie"
                  }`}
                >
                  {visible && <IconoCheck tam={13} />}
                </span>
                <span className="flex-1">{e.etiqueta}</span>
              </Link>
            );
          })}
          {parametros.ocultar.length > 0 && (
            <Link
              href={urlAgenda(parametros, { ocultar: [] })}
              scroll={false}
              className="mt-1 block rounded-lg px-3 py-2.5 text-center text-[0.84rem] font-semibold text-azul-oscuro transition-colors hover:bg-azul-luz"
            >
              Mostrar todos
            </Link>
          )}
        </>
      )}
    </Desplegable>
  );

  return (
    <>
      {/* Tablet y pantalla ancha: Hoy y las flechas, la vista, el título en el medio, y a la derecha Personal y
          Filtro. Si no entra todo en una fila (una tablet vertical), Personal y Filtro bajan a una segunda. */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {navegacion}
        <div className="flex-none">{vista}</div>
        <h2 className="flex min-w-[10rem] flex-1 items-center justify-center gap-2 px-2 text-[1.05rem] font-semibold tracking-titular text-tinta">
          <span className="text-azul">
            <IconoCalendario />
          </span>
          <span className="truncate">{titulo}</span>
        </h2>
        <div className="ml-auto w-44 flex-none">{selectorPersonal}</div>
        <div className="w-28 flex-none">{filtro}</div>
      </div>

      {/* Celular: arriba las flechas y el título; en el medio Día/Semana/Mes; abajo Personal y Filtro repartidos. */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex items-center gap-2">
          {navegacion}
          <h2 className="min-w-0 flex-1 truncate text-right text-[1rem] font-semibold tracking-titular text-tinta">
            {titulo}
          </h2>
        </div>
        {vista}
        <div className="grid grid-cols-2 gap-2">
          {selectorPersonal}
          {filtro}
        </div>
      </div>
    </>
  );
}
