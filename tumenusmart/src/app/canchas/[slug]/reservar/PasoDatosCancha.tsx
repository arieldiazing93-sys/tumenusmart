"use client";

import { etiquetaDeDeporte, textoDuracionCancha, type CanchaPublica } from "@/lib/canchas";
import { formatearGuarani } from "@/lib/format";
import type { CampoFormulario } from "@/lib/pagina-reservas";
import type { DatosCliente } from "@/lib/reserva-cliente";
import { IconoCalendario } from "@/app/turnos/[slug]/Iconos";
import { FormularioDatosCliente } from "@/app/turnos/[slug]/reservar/PasoDatos";

export type ResumenReserva = {
  cancha: CanchaPublica;
  fechaTexto: string;
  horaInicio: string;
  horaFin: string;
  duracionMin: number;
  total: number;
};

/**
 * Paso 3: el resumen de la reserva (qué cancha, cuándo, por cuánto tiempo y cuánto cuesta) y el formulario con los
 * datos del cliente. Muestra solo los campos que el negocio pidió, y marca como opcionales los que no son obligatorios.
 */
export function PasoDatosCancha({
  resumen,
  campos,
  datos,
  onCambiar,
}: {
  resumen: ResumenReserva;
  campos: CampoFormulario[];
  datos: DatosCliente;
  onCambiar: (parche: Partial<DatosCliente>) => void;
}) {
  const { cancha } = resumen;
  return (
    <div>
      <section aria-label="Resumen de la reserva" className="rounded-2xl bg-brand-light/70 p-4 ring-1 ring-brand/15">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-xl bg-superficie text-[1.5rem]"
          >
            {cancha.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cancha.fotoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              "⚽"
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[1.05rem] font-semibold tracking-titular text-tinta">{cancha.nombre}</p>
            <p className="truncate text-[0.84rem] text-tinta-media">
              {[etiquetaDeDeporte(cancha.deporte), cancha.superficie, cancha.techada ? "Techada" : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center gap-3 rounded-xl bg-superficie px-3.5 py-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-brand text-white"
          >
            <IconoCalendario tam={18} />
          </span>
          <div>
            <p className="text-[0.84rem] text-tinta-media">{resumen.fechaTexto}</p>
            <p className="cifra text-[1.05rem] font-bold text-tinta">
              {resumen.horaInicio} – {resumen.horaFin}
              <span className="ml-2 text-[0.84rem] font-medium text-tinta-media">
                {textoDuracionCancha(resumen.duracionMin)}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between border-t border-brand/20 pt-3.5">
          <span className="text-[0.95rem] font-semibold text-tinta">Precio total</span>
          <span className="cifra text-[1.25rem] font-bold text-tinta">{formatearGuarani(resumen.total)}</span>
        </div>
      </section>

      <FormularioDatosCliente campos={campos} datos={datos} onCambiar={onCambiar} />
    </div>
  );
}
