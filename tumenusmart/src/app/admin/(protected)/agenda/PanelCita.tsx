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
import { claveSumarDias } from "@/lib/calendario";
import { FormularioCita } from "./FormularioCita";

/** Cuántos días después se propone la nueva cita al tocar "Reservar de nuevo". */
const DIAS_PARA_VOLVER = 7;

/**
 * Una cita nueva con los datos de otra ("Reservar de nuevo"): el mismo cliente, quien
 * atiende y los servicios, con los precios de hoy, para el mismo día y hora de la
 * semana siguiente. Nada de lo cobrado ni el descuento pasan a la nueva.
 */
function comoNueva(c: DetalleCita, servicios: ServicioOpcion[]): DetalleCita {
  const catalogo = new Map(servicios.map((s) => [s.id, s] as const));
  return {
    ...c,
    id: "",
    codigo: "",
    estado: "proxima",
    origen: "panel",
    fecha: claveSumarDias(c.fecha, DIAS_PARA_VOLVER),
    // Un servicio que ya no existe no se puede volver a reservar.
    servicios: c.servicios
      .filter((s) => s.servicioId !== null)
      .map((s, i) => ({
        ...s,
        clave: `copia-${i}-${s.servicioId}`,
        citaServicioId: null,
        precio: (s.servicioId ? catalogo.get(s.servicioId)?.precio : undefined) ?? s.precio,
      })),
    nota: "",
    extras: [],
    descuentoMonto: 0,
    descuentoPorcentaje: null,
    cobro: null,
  };
}

/**
 * El detalle de la cita: un panel que entra desde la derecha al tocar un turno del
 * calendario. Tiene su propia cabecera de color (con las pestañas Editar cita y
 * Actividad) y sirve además para anotar una cita nueva.
 *
 * Está abierto mientras la dirección de la agenda lleve `?cita=…`; al cerrarlo se saca
 * ese dato de la dirección (por eso sobrevive a recargar la página).
 */
export function PanelCita({
  cita,
  servicios,
  personal,
  caja,
  actividad,
  parametros,
  hoy,
}: {
  /** La cita abierta, o null para una cita nueva. */
  cita: DetalleCita | null;
  servicios: ServicioOpcion[];
  personal: PersonalDeCita[];
  caja: EstadoCaja;
  actividad: Movimiento[];
  parametros: ParametrosAgenda;
  hoy: string;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [copia, setCopia] = useState<DetalleCita | null>(null);

  // El panel se dibuja recién en el navegador (va en un portal): así la primera pantalla
  // que llega del servidor y la del navegador coinciden siempre.
  useEffect(() => {
    setMontado(true);
  }, []);

  const cerrar = useCallback(() => {
    router.replace(urlAgenda(parametros), { scroll: false });
  }, [router, parametros]);

  if (!montado) return null;

  return (
    <PanelLateral
      titulo={cita && !copia ? `Cita ${cita.codigo}` : "Nueva cita"}
      onCerrar={cerrar}
      ancho="ancho"
      sinCabecera
    >
      <FormularioCita
        key={copia ? "copia" : (cita?.id ?? "nueva")}
        cita={copia ? null : cita}
        inicial={copia ?? cita}
        servicios={servicios}
        personal={personal}
        caja={caja}
        actividad={actividad}
        parametros={parametros}
        hoy={hoy}
        onCerrar={cerrar}
        onReservarDeNuevo={(c) => setCopia(comoNueva(c, servicios))}
      />
    </PanelLateral>
  );
}
