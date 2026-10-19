"use client";

import { useEffect, useState } from "react";
import { FirmaPlataforma } from "@/components/FirmaPlataforma";
import Link from "next/link";
import { IconoWhatsapp } from "@/components/iconos";
import { textoDuracionCancha, type ReservaCreada } from "@/lib/canchas";
import { formatearGuarani } from "@/lib/format";
import { marcarReservaCanchaEnviada } from "../actions";

/** "9:41", "0:05". */
function textoTiempo(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

/**
 * La pantalla final: la reserva ya se creó. Si el negocio pide el aviso por WhatsApp, el botón abre WhatsApp con el
 * resumen ya escrito; al tocarlo, si la reserva estaba esperando ese aviso, pasa a verse en el calendario del complejo.
 *
 * Mientras el cliente no toque el botón, se lo llama a la acción: el botón salta y, si el aviso es necesario para que la
 * reserva se vea, arriba hay una advertencia con una cuenta regresiva (una reserva que espera el aviso solo reserva el
 * horario unos minutos). Si el tiempo se acaba sin que se toque, la reserva se cancela (el servidor la borra) y esta
 * pantalla lo dice y ofrece reservar de nuevo, para que nadie crea que tiene una cancha que el complejo nunca vio.
 */
export function ReservaConfirmada({
  slug,
  negocio,
  reserva,
}: {
  slug: string;
  negocio: string;
  reserva: ReservaCreada;
}) {
  const [enviado, setEnviado] = useState(false);
  // Cuándo se vence la reserva, medido con el reloj de este teléfono a partir de que apareció la pantalla.
  const [limite] = useState(() => (reserva.venceEnSegundos == null ? null : Date.now() + reserva.venceEnSegundos * 1000));
  const [ahora, setAhora] = useState(() => Date.now());
  // El servidor dijo que ya no se puede confirmar (se venció justo al tocar el botón).
  const [rechazada, setRechazada] = useState(false);

  const restante = limite == null ? null : Math.max(0, Math.ceil((limite - ahora) / 1000));
  const vencida = !enviado && (rechazada || restante === 0);
  // Falta el aviso y sin él el complejo no ve la reserva: la advertencia y el botón que salta llaman a hacerlo.
  const pendienteDeEnvio = !!reserva.enlaceWhatsapp && reserva.esperaEnvio && !enviado && !vencida;

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
          El aviso por WhatsApp no llegó a tiempo, así que tu reserva se canceló y el horario quedó libre. Si querés esa
          cancha, reservá de nuevo y mandá el aviso enseguida.
        </p>

        <Link
          href={`/canchas/${slug}/reservar`}
          className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-brand text-[1rem] font-semibold text-white shadow-alta transition-all hover:bg-brand-dark active:scale-[0.98]"
        >
          Reservar de nuevo
        </Link>

        <Link
          href={`/canchas/${slug}`}
          className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-superficie text-[0.95rem] font-semibold text-tinta shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-[0.98]"
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
        className="flex h-20 w-20 animate-[entradaExito_0.5s_cubic-bezier(0.22,0.7,0.3,1)_both] items-center justify-center rounded-full bg-brand text-white shadow-media ring-8 ring-brand-light"
      >
        <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>

      <h2 className="mt-5 text-[1.5rem] font-semibold tracking-titular text-tinta">¡Reserva creada!</h2>
      {pendienteDeEnvio ? (
        // Todo el texto va en el color de aviso (que no cambia con el tema claro u oscuro de la página) para que se lea
        // igual sobre el fondo ámbar.
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
            <span className="font-bold">Falta un paso.</span> Es necesario que le envíes el aviso por WhatsApp a {negocio}{" "}
            para que vea tu reserva y te la confirme.
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
          {reserva.enlaceWhatsapp
            ? enviado
              ? `${negocio} ya tiene tu reserva y te la va a confirmar. Si no se abrió WhatsApp, tocá el botón de nuevo.`
              : `Avisale a ${negocio} por WhatsApp para que te confirme la reserva.`
            : `${negocio} ya tiene tu reserva y te la va a confirmar.`}
        </p>
      )}

      {/* La reserva como una entrada: arriba la cancha con el color del negocio, abajo el día, la hora y el total. */}
      <div className="mt-6 w-full overflow-hidden rounded-2xl bg-superficie text-left shadow-media ring-1 ring-linea">
        <div className="flex items-center justify-between gap-3 bg-brand px-5 py-3.5 text-white">
          <div className="min-w-0">
            <p className="truncate text-[1.1rem] font-semibold tracking-titular">{reserva.canchaNombre}</p>
            <p className="cifra text-[0.72rem] font-semibold uppercase tracking-rotulo text-white/80">
              Reserva {reserva.codigo}
            </p>
          </div>
          <span aria-hidden="true" className="text-[1.8rem]">
            ⚽
          </span>
        </div>
        <div className="p-5">
          <p className="text-[1.2rem] font-semibold capitalize tracking-titular text-tinta">{reserva.fechaTexto}</p>
          <p className="cifra text-[1.5rem] font-bold text-brand-texto">
            {reserva.horaInicio} – {reserva.horaFin}
          </p>
          <p className="text-[0.88rem] text-tinta-media">{textoDuracionCancha(reserva.duracionMin)} de juego</p>
          <div className="mt-4 flex items-center justify-between border-t border-dashed border-linea pt-4">
            <span className="text-[0.95rem] font-semibold text-tinta">Total</span>
            <span className="cifra text-[1.15rem] font-bold text-tinta">{formatearGuarani(reserva.total)}</span>
          </div>
        </div>
      </div>

      {reserva.enlaceWhatsapp && (
        // El que salta es este contenedor y no el botón: así el botón conserva su propio efecto al apretarlo. Deja de
        // saltar apenas se lo toca.
        <div className={`mt-6 w-full ${enviado ? "" : "animate-llamar"}`}>
          <a
            href={reserva.enlaceWhatsapp}
            target="_blank"
            rel="noopener noreferrer"
            // La reserva pasa a verse en el calendario del complejo en cuanto se toca el botón, si todavía está a tiempo.
            onClick={() => {
              setEnviado(true);
              void marcarReservaCanchaEnviada(slug, reserva.reservaId)
                .then((r) => {
                  if (!r.ok && r.vencida) {
                    setEnviado(false);
                    setRechazada(true);
                  }
                })
                .catch(() => {
                  // Sin conexión con el servidor: el cliente igual llega a WhatsApp, y el complejo tiene el mensaje.
                });
            }}
            // El verde de WhatsApp (el mismo en todo el sistema), no el color del negocio: es lo que el cliente reconoce de una.
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] text-[1rem] font-semibold text-white shadow-alta transition-all hover:opacity-90 active:scale-[0.98]"
          >
            <IconoWhatsapp tam={20} />
            {enviado ? "Volver a abrir WhatsApp" : "Enviar por WhatsApp"}
          </a>
        </div>
      )}

      <Link
        href={`/canchas/${slug}`}
        className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-superficie text-[0.95rem] font-semibold text-tinta shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-[0.98]"
      >
        Volver a la página
      </Link>

      <FirmaPlataforma className="mt-7" tam="medio" />
    </div>
  );
}
