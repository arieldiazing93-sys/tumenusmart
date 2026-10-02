"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Tarjeta, clasesBoton } from "@/components/ui";
import { ALMUERZO_MAXIMO_MIN, MINUTOS_ENTRE_MARCAS_MAXIMO } from "@/lib/asistencia";
import { guardarReglasMarcacion } from "./actions";

/**
 * Las reglas del celular fijo:
 *
 * - El horario de almuerzo: con él el sistema decide solo, sin preguntarle nada a nadie, si lo que marca alguien que
 *   ya entró es la salida a almorzar (dentro del horario) o la salida del día (fuera de él). Así quien pasa el día
 *   afuera (un soporte técnico, una visita) y vuelve a la tarde solo marca su salida, y quien se olvida de marcar el
 *   almuerzo no rompe la secuencia: el reporte deja vacías las columnas que no se marcaron.
 * - El tiempo mínimo entre una marcación y la siguiente de la misma persona.
 */
export function ReglasMarcacion({
  minutosEntreMarcas,
  almuerzoDesde,
  almuerzoHasta,
  almuerzoMaxMin,
}: {
  minutosEntreMarcas: number;
  almuerzoDesde: string;
  almuerzoHasta: string;
  almuerzoMaxMin: number;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [entre, setEntre] = useState(String(minutosEntreMarcas));
  const [desde, setDesde] = useState(almuerzoDesde);
  const [hasta, setHasta] = useState(almuerzoHasta);
  const [maximo, setMaximo] = useState(String(almuerzoMaxMin));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function cambio<T>(poner: (v: T) => void) {
    return (v: T) => {
      poner(v);
      setGuardado(false);
    };
  }

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    iniciar(async () => {
      const resultado = await guardarReglasMarcacion({
        minutosEntreMarcas: Number(entre),
        almuerzoDesde: desde,
        almuerzoHasta: hasta,
        almuerzoMaxMin: Number(maximo),
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
      router.refresh();
    });
  }

  return (
    <Tarjeta className="campos-grises flex flex-col gap-4 !border-2 !border-azul/50">
      <div>
        <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Reglas de marcación</h2>
        <p className="mt-0.5 text-[0.84rem] leading-snug text-tinta-media">
          El personal no elige qué marca: el sistema lo decide según lo último que marcó y la hora. Estas reglas le dicen
          cómo.
        </p>
      </div>

      <form onSubmit={guardar} className="flex flex-col gap-4">
        <div className="rounded-xl border border-linea p-3">
          <p className="text-[0.86rem] font-semibold text-tinta">Horario de almuerzo</p>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Quien ya entró y marca <strong className="text-tinta">dentro de este horario</strong> queda con la salida a
            almorzar; si marca <strong className="text-tinta">fuera de él</strong>, queda con la salida del día. Así, quien
            pasó el día afuera y vuelve a la tarde marca solo su salida, sin que nadie le pregunte nada. Después de salir a
            almorzar, la próxima marcación es la vuelta, salvo que ya haya pasado el máximo: ahí es la salida (se fue sin
            volver o se olvidó de marcar la vuelta).
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo etiqueta="Desde">
              <Entrada type="time" value={desde} onChange={(e) => cambio(setDesde)(e.target.value)} required />
            </Campo>
            <Campo etiqueta="Hasta">
              <Entrada type="time" value={hasta} onChange={(e) => cambio(setHasta)(e.target.value)} required />
            </Campo>
            <Campo etiqueta="Máximo de almuerzo (min)">
              <Entrada
                type="number"
                min={10}
                max={ALMUERZO_MAXIMO_MIN}
                step={5}
                inputMode="numeric"
                value={maximo}
                onChange={(e) => cambio(setMaximo)(e.target.value)}
                required
              />
            </Campo>
          </div>
        </div>

        <div className="rounded-xl border border-linea p-3">
          <p className="text-[0.86rem] font-semibold text-tinta">Tiempo entre marcaciones</p>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Cuánto tiene que esperar una persona entre una marcación y la siguiente suya. Evita marcar dos veces por error y
            que alguien marque entrada y salida seguidas. Con 5 minutos, quien marca la entrada a las 08:00 recién puede
            volver a marcar a partir de las 08:05. Con 0 no hay espera.
          </p>
          <div className="mt-3 w-40">
            <Campo etiqueta="Minutos">
              <Entrada
                type="number"
                min={0}
                max={MINUTOS_ENTRE_MARCAS_MAXIMO}
                step={1}
                inputMode="numeric"
                value={entre}
                onChange={(e) => cambio(setEntre)(e.target.value)}
                required
              />
            </Campo>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal", "md")}>
            {pendiente ? "Guardando…" : "Guardar las reglas"}
          </button>
          {guardado && <span className="text-[0.84rem] font-semibold text-exito">¡Guardado!</span>}
        </div>
        {error && <MensajeError>{error}</MensajeError>}
      </form>
    </Tarjeta>
  );
}
