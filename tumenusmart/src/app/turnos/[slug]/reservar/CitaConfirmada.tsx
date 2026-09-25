"use client";

import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import type { CitaCreada } from "@/lib/reserva-cliente";
import { IconoWhatsapp } from "@/components/iconos";
import { marcarCitaEnviada } from "../actions";

/**
 * La pantalla final: la cita ya se creó. Si el negocio pide el aviso por WhatsApp,
 * el botón abre WhatsApp con el resumen ya escrito; al tocarlo, si la cita
 * estaba esperando ese aviso, pasa a verse en el calendario del negocio.
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
      <p className="mt-1.5 max-w-sm text-[0.92rem] leading-snug text-tinta-media">
        {cita.enlaceWhatsapp
          ? cita.esperaEnvio
            ? `Falta un paso: mandale el aviso por WhatsApp a ${negocio} para que vea tu cita y te la confirme.`
            : `Avisale a ${negocio} por WhatsApp para que te confirme la cita.`
          : `${negocio} ya tiene tu cita y te la va a confirmar.`}
      </p>

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
        <a
          href={cita.enlaceWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          // La cita pasa a verse en el calendario del negocio en cuanto se toca el botón.
          onClick={() => void marcarCitaEnviada(slug, cita.citaId)}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-brand text-[0.95rem] font-semibold text-white transition-colors hover:bg-brand-dark active:scale-[0.99]"
        >
          <IconoWhatsapp tam={20} />
          Enviar por WhatsApp
        </a>
      )}

      <Link
        href={`/turnos/${slug}`}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-linea bg-superficie text-[0.92rem] font-semibold text-tinta transition-colors hover:border-brand"
      >
        Volver a la página
      </Link>

      <Link href="/" className="mt-6 inline-block py-1 text-[0.72rem] text-tinta-suave transition-colors hover:text-tinta hover:underline">
        Desarrollado por tumenusmart.com
      </Link>
    </div>
  );
}
