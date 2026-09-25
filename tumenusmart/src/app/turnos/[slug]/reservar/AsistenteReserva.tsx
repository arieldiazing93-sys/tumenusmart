"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { diaLargo, horaDeMinutos } from "@/lib/agenda";
import { formatearGuarani } from "@/lib/format";
import { aMinutos } from "@/lib/horario-trabajo";
import type { CampoFormulario } from "@/lib/pagina-reservas";
import {
  DATOS_CLIENTE_VACIOS,
  validarDatosCliente,
  type CategoriaPublica,
  type CitaCreada,
  type DatosCliente,
  type PersonalPublico,
  type ServicioPublico,
} from "@/lib/reserva-cliente";
import { textoDuracion } from "@/lib/servicios-agenda";
import { crearCitaPublica } from "../actions";
import { CitaConfirmada } from "./CitaConfirmada";
import { PasoDatos } from "./PasoDatos";
import { PasoFechaHora } from "./PasoFechaHora";
import { PasoProfesional } from "./PasoProfesional";
import { PasoServicios } from "./PasoServicios";

type Paso = 1 | 2 | 3 | 4;

const TITULOS: Record<Paso, string> = {
  1: "Elegí tus servicios",
  2: "Elegí el profesional",
  3: "Elegí día y hora",
  4: "Tus datos",
};

/**
 * La reserva paso a paso, como una app: 1) servicios, 2) profesional, 3) día y
 * hora, 4) datos del cliente. Arriba, una barra de avance; abajo, el botón de
 * siempre a la vista. Cada paso vuelve a empezar desde donde corresponde si se
 * cambia algo anterior (otro servicio cambia quién puede hacerlo y las horas).
 *
 * Al confirmar se crea la cita y se pasa a la pantalla final, donde el cliente
 * manda el aviso por WhatsApp al negocio.
 */
export function AsistenteReserva({
  slug,
  negocio,
  categorias,
  personal,
  campos,
  hoy,
}: {
  slug: string;
  negocio: string;
  categorias: CategoriaPublica[];
  personal: PersonalPublico[];
  campos: CampoFormulario[];
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
}) {
  const [paso, setPaso] = useState<Paso>(1);
  const [servicioIds, setServicioIds] = useState<string[]>([]);
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [cliente, setCliente] = useState<DatosCliente>(DATOS_CLIENTE_VACIOS);
  const [error, setError] = useState<string | null>(null);
  const [horarioOcupado, setHorarioOcupado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [cita, setCita] = useState<CitaCreada | null>(null);

  const todos = useMemo(
    () => categorias.flatMap((c) => c.servicios.map((s) => ({ ...s, categoria: c.nombre }))),
    [categorias]
  );
  const elegidos = servicioIds
    .map((id) => todos.find((s) => s.id === id))
    .filter((s): s is ServicioPublico & { categoria: string } => !!s);
  const duracion = elegidos.reduce((suma, s) => suma + s.duracionMin, 0);
  const total = elegidos.reduce((suma, s) => suma + s.precio, 0);
  const profesional = personal.find((p) => p.id === personalId) ?? null;

  // ---------- cambios que arrastran a los pasos siguientes ----------

  function cambiarServicios(ids: string[]) {
    setServicioIds(ids);
    setPersonalId(null);
    setFecha(null);
    setHora(null);
  }

  function elegirProfesional(id: string, sugerida?: { fecha: string; hora: string }) {
    if (id !== personalId) {
      setPersonalId(id);
      setFecha(null);
      setHora(null);
    }
    if (sugerida) {
      setFecha(sugerida.fecha);
      setHora(sugerida.hora);
    }
  }

  function elegirHora(f: string, h: string) {
    setFecha(f);
    setHora(h);
    setError(null);
    setHorarioOcupado(false);
  }

  // ---------- navegación ----------

  const puedeContinuar =
    paso === 1 ? elegidos.length > 0 : paso === 2 ? !!personalId : paso === 3 ? !!fecha && !!hora : true;

  function siguiente() {
    if (!puedeContinuar || paso === 4) return;
    setPaso((paso + 1) as Paso);
    window.scrollTo({ top: 0 });
  }

  function atras() {
    if (paso === 1) return;
    setError(null);
    setPaso((paso - 1) as Paso);
    window.scrollTo({ top: 0 });
  }

  function elegirOtraHora() {
    setHora(null);
    setFecha(null);
    setHorarioOcupado(false);
    setError(null);
    setPaso(3);
    window.scrollTo({ top: 0 });
  }

  async function confirmar() {
    if (!personalId || !fecha || !hora) return;
    // La misma revisión que hace el servidor, para avisar al toque.
    const revision = validarDatosCliente(campos, cliente);
    if (!revision.ok) {
      setError(revision.error);
      return;
    }
    setError(null);
    setHorarioOcupado(false);
    setEnviando(true);
    try {
      const resultado = await crearCitaPublica(slug, { servicioIds, personalId, fecha, hora, cliente });
      if (!resultado.ok) {
        setError(resultado.error);
        setHorarioOcupado(resultado.horarioOcupado === true);
        return;
      }
      setCita(resultado.cita);
      window.scrollTo({ top: 0 });
    } catch {
      setError("No se pudo crear la cita. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  // ---------- pantalla final ----------

  if (cita) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-papel px-4 pb-10 pt-6 sm:border-x sm:border-linea">
        <CitaConfirmada slug={slug} negocio={negocio} cita={cita} />
      </div>
    );
  }

  const BOTON =
    "flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[0.95rem] font-semibold text-white " +
    "transition-colors hover:bg-brand-dark active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-papel sm:border-x sm:border-linea">
      {/* ---------- arriba: volver, título y avance ---------- */}
      <header className="sticky top-0 z-20 bg-papel/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="relative flex h-10 items-center justify-center">
          {paso === 1 ? (
            <Link
              href={`/turnos/${slug}`}
              aria-label="Volver a la página"
              className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full text-[1.4rem] text-tinta transition-colors hover:bg-papel-hundido"
            >
              ‹
            </Link>
          ) : (
            <button
              type="button"
              onClick={atras}
              aria-label="Volver al paso anterior"
              className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full text-[1.4rem] text-tinta transition-colors hover:bg-papel-hundido"
            >
              ‹
            </button>
          )}
          <h1 className="text-[1rem] font-semibold tracking-titular text-tinta">{TITULOS[paso]}</h1>
        </div>
        <div
          className="mt-2 grid grid-cols-4 gap-2"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={paso}
          aria-label={`Paso ${paso} de 4`}
        >
          {[1, 2, 3, 4].map((n) => (
            <span
              key={n}
              className={`h-1 rounded-full transition-colors duration-200 ${n <= paso ? "bg-brand" : "bg-brand-light"}`}
            />
          ))}
        </div>
      </header>

      {/* ---------- el paso ---------- */}
      <main className="flex-1 px-4 pb-44 pt-2">
        {paso === 1 && <PasoServicios categorias={categorias} elegidos={servicioIds} onCambiar={cambiarServicios} />}

        {paso === 2 && (
          <PasoProfesional
            slug={slug}
            servicios={elegidos}
            personal={personal}
            personalId={personalId}
            onElegir={elegirProfesional}
          />
        )}

        {paso === 3 && personalId && (
          <PasoFechaHora
            slug={slug}
            servicioIds={servicioIds}
            personalId={personalId}
            hoy={hoy}
            fecha={fecha}
            hora={hora}
            onElegir={elegirHora}
          />
        )}

        {paso === 4 && profesional && fecha && hora && (
          <PasoDatos
            resumen={{
              profesional,
              fechaTexto: diaLargo(fecha),
              horaInicio: hora,
              horaFin: horaDeMinutos(aMinutos(hora) + duracion),
              servicios: elegidos.map((s) => ({
                categoria: s.categoria,
                nombre: s.nombre,
                duracionMin: s.duracionMin,
                precio: s.precio,
              })),
              total,
            }}
            campos={campos}
            datos={cliente}
            onCambiar={(parche) => {
              setCliente((c) => ({ ...c, ...parche }));
              setError(null);
            }}
          />
        )}
      </main>

      {/* ---------- abajo: el botón, siempre a la vista ---------- */}
      <footer className="fixed bottom-0 left-1/2 z-20 w-full max-w-xl -translate-x-1/2 border-t border-linea bg-papel/95 backdrop-blur sm:border-x">
        <div className="px-4 pb-4 pt-3">
          {paso === 1 && elegidos.length > 0 && (
            <p className="cifra mb-2 text-center text-[0.8rem] text-tinta-media">
              {elegidos.length === 1 ? "1 servicio" : `${elegidos.length} servicios`} · {textoDuracion(duracion)} ·{" "}
              {formatearGuarani(total)}
            </p>
          )}

          {paso === 4 ? (
            <>
              {error && (
                <div role="alert" className="mb-2.5 rounded-lg bg-peligro-luz px-3 py-2 text-[0.84rem] font-medium text-peligro">
                  {error}
                  {horarioOcupado && (
                    <button type="button" onClick={elegirOtraHora} className="ml-2 font-semibold underline">
                      Elegir otra hora
                    </button>
                  )}
                </div>
              )}
              <p className="mb-2.5 text-center text-[0.72rem] leading-snug text-tinta-suave">
                Al confirmar la cita, aceptás que {negocio} use tus datos para gestionar tu turno.
              </p>
              <button type="button" onClick={confirmar} disabled={enviando} className={BOTON}>
                {enviando ? "Creando tu cita…" : "Confirmar cita"}
              </button>
            </>
          ) : (
            <button type="button" onClick={siguiente} disabled={!puedeContinuar} className={BOTON}>
              Continuar
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
