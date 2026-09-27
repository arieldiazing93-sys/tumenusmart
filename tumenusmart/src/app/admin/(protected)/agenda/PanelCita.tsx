"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelLateral } from "@/components/PanelLateral";
import { urlAgenda, type ParametrosAgenda } from "@/lib/agenda";
import type {
  ActividadCita as Movimiento,
  DetalleCita,
  EstadoCaja,
  PersonalDeCita,
  ServicioOpcion,
} from "@/lib/agenda-cita";
import { ActividadCita } from "./ActividadCita";
import { FormularioCita } from "./FormularioCita";

/**
 * El detalle de la cita: un panel que entra desde la derecha al tocar un turno del
 * calendario. Tiene dos pestañas —Editar cita (que también cobra) y Actividad— y sirve
 * además para anotar una cita nueva.
 *
 * Está abierto mientras la dirección de la agenda lleve `?cita=…`; al cerrarlo se saca
 * ese dato de la dirección (por eso sobrevive a recargar la página).
 */
export function PanelCita({
  cita,
  servicios,
  personal,
  caja,
  negocio,
  actividad,
  parametros,
  hoy,
}: {
  /** La cita abierta, o null para una cita nueva. */
  cita: DetalleCita | null;
  servicios: ServicioOpcion[];
  personal: PersonalDeCita[];
  caja: EstadoCaja;
  /** El nombre del negocio, para el mensaje de WhatsApp al cliente. */
  negocio: string;
  actividad: Movimiento[];
  parametros: ParametrosAgenda;
  hoy: string;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [pestana, setPestana] = useState<"editar" | "actividad">("editar");

  // El panel se dibuja recién en el navegador (va en un portal): así la primera pantalla
  // que llega del servidor y la del navegador coinciden siempre.
  useEffect(() => {
    setMontado(true);
  }, []);

  const cerrar = useCallback(() => {
    router.replace(urlAgenda(parametros), { scroll: false });
  }, [router, parametros]);

  if (!montado) return null;

  const esNueva = cita === null;

  return (
    <PanelLateral
      titulo={cita ? `Cita ${cita.codigo}` : "Nueva cita"}
      onCerrar={cerrar}
      ancho="ancho"
      // Las pestañas van en la barra de arriba, junto a la X: así no hace falta una fila para el título y otra
      // para ellas. (El código de la cita está en la primera fila del formulario.)
      encabezado={
        esNueva ? undefined : (
          <div role="tablist" aria-label="Secciones de la cita" className="flex gap-1">
            {(
              [
                { valor: "editar", etiqueta: "Editar cita" },
                { valor: "actividad", etiqueta: "Actividad" },
              ] as const
            ).map((p) => (
              <button
                key={p.valor}
                type="button"
                role="tab"
                aria-selected={pestana === p.valor}
                onClick={() => setPestana(p.valor)}
                className={`-mb-px flex items-center border-b-2 px-3 py-3 text-[0.86rem] font-semibold transition-colors ${
                  pestana === p.valor
                    ? "border-azul text-azul-oscuro"
                    : "border-transparent text-tinta-media hover:text-tinta"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        )
      }
    >
      {/* El formulario se queda armado aunque se mire la otra pestaña: no se pierde lo escrito. */}
      <div className={pestana === "editar" || esNueva ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <FormularioCita
          key={cita?.id ?? "nueva"}
          cita={cita}
          inicial={cita}
          servicios={servicios}
          personal={personal}
          caja={caja}
          negocio={negocio}
          parametros={parametros}
          hoy={hoy}
          onCerrar={cerrar}
        />
      </div>
      {!esNueva && pestana === "actividad" && <ActividadCita actividad={actividad} />}
    </PanelLateral>
  );
}
