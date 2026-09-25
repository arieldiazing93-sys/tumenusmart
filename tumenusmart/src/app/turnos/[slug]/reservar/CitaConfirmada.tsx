"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import type { CitaCreada } from "@/lib/reserva-cliente";
import { IconoWhatsapp } from "@/components/iconos";
import { marcarCitaEnviada } from "../actions";

/** "9:41", "0:05". */
function textoTiempo(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/**
 * La pantalla final: la cita ya se creó. Si el negocio pide el aviso por WhatsApp,
 * el botón abre WhatsApp con el resumen ya escrito; al tocarlo, si la cita
 * estaba esperando ese aviso, pasa a verse en el calendario del negocio.
 *
 * Mientras el cliente no toque el botón, se lo llama a la acción: el botón salta tres veces cada tanto
 * y, si el aviso es necesario para que la cita se vea, arriba hay una advertencia en color de aviso.
 *
 * Esa advertencia lleva una cuenta regresiva: una reserva que espera el aviso solo reserva el horario un rato.
 * Si el tiempo se acaba sin que se toque el botón, la reserva se cancela (el servidor la borra) y esta pantalla
 * lo dice y ofrece reservar de nuevo, para que nadie crea que tiene un turno que el negocio nunca vio.
 */
export function CitaConfirmada({
  slug,
  negocio,
  cita,
}: {
  slug: string;
  negocio: string;
  cita: CitaCreada;
}) {
  const [enviado, setEnviado] = useState(false);
  // Cuándo se vence la reserva, medido con el reloj de este teléfono a partir de que apareció la pantalla.
  const [limite] = useState(() => (cita.venceEnSegundos == null ? null : Date.now() + cita.venceEnSegundos * 1000));
  const [ahora, setAhora] = useState(() => Date.now());
  // El servidor dijo que ya no se puede confirmar (se venció justo al tocar el botón).
  const [rechazada, setRechazada] = useState(false);

  const restante = limite == null ? null : Math.max(0, Math.ceil((limite - ahora) / 1000));
  const vencida = !enviado && (rechazada || restante === 0);
  // Falta el aviso y sin él el negocio no ve la cita: la advertencia y el botón que salta llaman a hacerlo.
  const pendienteDeEnvio = !!cita.enlaceWhatsapp && cita.esperaEnvio && !enviado && !vencida;

  // Solo corre el reloj mientras hay una cuenta regresiva a la vista.
  const cuentaRegresiva = pendienteDeEnvio && limite != null;
  useEffect(() => {
    if (!cuentaRegresiva) return;
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, [cuentaRegresiva]);

  if (vencida) {
    return (
      <div className="flex flex-col items-center px-1 pt-4 text-center">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-aviso/40 bg-aviso-luz text-aviso"
        >
          <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>

        <h2 className="mt-4 text-[1.3rem] font-semibold tracking-titular text-tinta">Se venció el tiempo</h2>
        <p className="mt-1.5 max-w-sm text-[0.92rem] leading-snug text-tinta-media">
          El aviso por WhatsApp no llegó a tiempo, así que tu reserva se canceló y el horario quedó libre. Si querés ese
          turno, reservá de nuevo y mandá el aviso enseguida.
        </p>

        <Link
          href={`/turnos/${slug}/reservar`}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[0.95rem] font-semibold text-white transition-colors hover:bg-brand-dark active:scale-[0.99]"
        >
          Reservar de nuevo
        </Link>

        <Link
          href={`/turnos/${slug}`}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-linea bg-superficie text-[0.92rem] font-semibold text-tinta transition-colors hover:border-brand"
        >
          Volver a la página
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center px-1 pt-4 text-center">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white"
      >
        <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>

      <h2 className="mt-4 text-[1.3rem] font-semibold tracking-titular text-tinta">¡Cita creada!</h2>
      {pendienteDeEnvio ? (
        // Todo el texto va en el color de aviso (que no cambia con el tema claro u oscuro de la página) para
        // que se lea igual sobre el fondo ámbar.
        <div className="mt-3 flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-aviso/40 bg-aviso-luz px-3.5 py-3 text-left">
          <svg
            viewBox="0 0 24 24"
            width={20}
            height={20}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 flex-none text-aviso"
          >
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <p className="text-[0.9rem] leading-snug text-aviso">
            <span className="font-bold">Falta un paso.</span> Es necesario que le envíes el aviso por WhatsApp a{" "}
            {negocio} para que vea tu cita y te la confirme.
            {restante != null && (
              <>
                {" "}
                Tenés <span className="cifra font-bold">{textoTiempo(restante)}</span> para hacerlo: si no, la reserva se
                cancela y el horario se libera.
              </>
            )}
          </p>
        </div>
      ) : (
        <p className="mt-1.5 max-w-sm text-[0.92rem] leading-snug text-tinta-media">
          {cita.enlaceWhatsapp
            ? enviado
              ? `${negocio} ya tiene tu cita y te la va a confirmar. Si no se abrió WhatsApp, tocá el botón de nuevo.`
              : `Avisale a ${negocio} por WhatsApp para que te confirme la cita.`
            : `${negocio} ya tiene tu cita y te la va a confirmar.`}
        </p>
      )}

      <div className="mt-6 w-full rounded-xl border border-linea bg-superficie p-4 text-left">
        <p className="text-[0.78rem] text-tinta-suave">Cita {cita.codigo}</p>
        <p className="mt-1 text-[1rem] font-semibold text-tinta">{cita.fechaTexto}</p>
        <p className="cifra text-[0.95rem] text-tinta-media">
          {cita.horaInicio} – {cita.horaFin}
        </p>
        <p className="mt-2 text-[0.88rem] text-tinta-media">Con {cita.profesional}</p>
        <div className="mt-3 flex items-center justify-between border-t border-linea pt-3">
          <span className="text-[0.9rem] font-semibold text-tinta">Total</span>
          <span className="cifra text-[1rem] font-bold text-tinta">{formatearGuarani(cita.total)}</span>
        </div>
      </div>

      {cita.enlaceWhatsapp && (
        // El que salta es este contenedor y no el botón: así el botón conserva su propio efecto al apretarlo.
        // Deja de saltar apenas se lo toca.
        <div className={`mt-6 w-full ${enviado ? "" : "animate-llamar"}`}>
          <a
            href={cita.enlaceWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            // La cita pasa a verse en el calendario del negocio en cuanto se toca el botón, si todavía está a tiempo.
            onClick={() => {
              setEnviado(true);
              void marcarCitaEnviada(slug, cita.citaId)
                .then((r) => {
                  if (!r.ok && r.vencida) {
                    setEnviado(false);
                    setRechazada(true);
                  }
                })
                .catch(() => {
                  // Sin conexión con el servidor: el cliente igual llega a WhatsApp, y el negocio tiene el mensaje.
                });
            }}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-brand text-[0.95rem] font-semibold text-white shadow-media transition-colors hover:bg-brand-dark active:scale-[0.99]"
          >
            <IconoWhatsapp tam={20} />
            {enviado ? "Volver a abrir WhatsApp" : "Enviar por WhatsApp"}
          </a>
        </div>
      )}

      <Link
        href={`/turnos/${slug}`}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-linea bg-superficie text-[0.92rem] font-semibold text-tinta transition-colors hover:border-brand"
      >
        Volver a la página
      </Link>

      <Link
        href="/"
        className="-mr-[0.14em] mt-7 inline-block py-1.5 text-center font-mono text-[0.82rem] font-semibold uppercase leading-tight tracking-[0.14em] text-tinta-media transition-colors hover:text-tinta hover:underline"
      >
        Desarrollado por tumenusmart.com
      </Link>
    </div>
  );
}
