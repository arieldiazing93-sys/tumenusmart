import { pantallaConPermiso } from "@/lib/auth";
import { Volver } from "@/components/Volver";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { agregarTramoHorario } from "../actions";
import {
  NOMBRES_DIA,
  DIAS_ORDENADOS,
  calcularEstadoAtencion,
} from "@/lib/horario-atencion";
import { EliminarTramoBoton } from "./EliminarTramoBoton";

export const dynamic = "force-dynamic";

export default async function HorariosAtencionPage() {
  await pantallaConPermiso("configuracion.editar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const tramos = await prisma.horarioAtencion.findMany({
    orderBy: [{ diaSemana: "asc" }, { abre: "asc" }],
  });

  const estado = calcularEstadoAtencion(tramos);
  const sinConfigurar = tramos.length === 0;

  return (
    <div>
      <div className="mb-4">
        <Volver href="/admin/configuracion" texto="Volver a configuración" />
      </div>

      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">Horario de atención</h1>
      <p className="mb-6 text-sm text-tinta-media">
        Cargá los tramos en los que el local toma pedidos. Un día sin tramos queda{" "}
        <strong>cerrado</strong> — así se marca el día de descanso. Podés cargar dos tramos
        el mismo día si trabajás con turno partido (mediodía y noche).
      </p>

      <div
        className={`mb-6 rounded-lg border p-4 ${
          sinConfigurar
            ? "border-linea bg-white"
            : estado.abierto
              ? "border-exito/30 bg-exito-luz"
              : "border-aviso/30 bg-aviso-luz"
        }`}
      >
        {sinConfigurar ? (
          <p className="text-sm text-tinta-media">
            Todavía no cargaste ningún horario, así que el menú <strong>acepta pedidos a
            cualquier hora</strong>. Cargá los tramos de abajo para que se respete tu horario real.
          </p>
        ) : (
          <p className="text-sm font-medium">
            {estado.abierto ? (
              <span className="text-exito">🟢 Ahora mismo el local figura como ABIERTO</span>
            ) : (
              <span className="text-aviso">
                🔴 Ahora mismo figura como CERRADO
                {estado.proximaApertura ? ` — abre ${estado.proximaApertura}` : ""}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-linea bg-white">
        <div className="hidden border-b border-linea bg-papel-suave px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta-media sm:flex">
          <span className="w-28 flex-none">Día</span>
          <span className="flex-1">Horarios</span>
          <span className="w-64 flex-none">Agregar tramo</span>
        </div>

        <div className="divide-y divide-linea-fina">
          {DIAS_ORDENADOS.map((dia) => {
            const delDia = tramos.filter((t) => t.diaSemana === dia);
            const cerrado = delDia.length === 0;
            return (
              <div
                key={dia}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap ${
                  cerrado ? "bg-papel-suave/60" : ""
                }`}
              >
                <span className="w-28 flex-none font-medium text-tinta">
                  {NOMBRES_DIA[dia]}
                </span>

                <div className="flex min-w-[160px] flex-1 flex-wrap items-center gap-1.5">
                  {cerrado ? (
                    <span className="rounded-full bg-linea px-2.5 py-0.5 text-xs font-medium text-tinta-media">
                      Cerrado
                    </span>
                  ) : (
                    delDia.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-linea px-2.5 py-1 text-sm"
                      >
                        {t.abre}–{t.cierra}
                        {t.cierra <= t.abre && (
                          <span className="text-[10px] text-tinta-suave">+1 día</span>
                        )}
                        <EliminarTramoBoton id={t.id} />
                      </span>
                    ))
                  )}
                </div>

                <form
                  action={agregarTramoHorario}
                  className="flex w-full flex-none items-center gap-1.5 sm:w-64"
                >
                  <input type="hidden" name="diaSemana" value={dia} />
                  <input
                    type="time"
                    name="abre"
                    required
                    aria-label={`Hora de apertura del ${NOMBRES_DIA[dia]}`}
                    className="w-full rounded-lg border border-linea px-2 py-1.5 text-sm"
                  />
                  <span className="text-tinta-suave">–</span>
                  <input
                    type="time"
                    name="cierra"
                    required
                    aria-label={`Hora de cierre del ${NOMBRES_DIA[dia]}`}
                    className="w-full rounded-lg border border-linea px-2 py-1.5 text-sm"
                  />
                  <button
                    type="submit"
                    aria-label={`Agregar tramo al ${NOMBRES_DIA[dia]}`}
                    className="flex-none rounded-lg bg-noche-panel px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-noche-panel"
                  >
                    +
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-6 text-xs text-tinta-suave">
        Si el local cierra después de medianoche (ej: de 19:00 a 01:00), cargá el tramo tal
        cual — el sistema entiende que el cierre cae al día siguiente.
      </p>
    </div>
  );
}
