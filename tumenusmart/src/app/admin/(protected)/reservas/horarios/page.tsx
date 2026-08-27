import { pantallaConPermiso } from "@/lib/auth";
import { clasesBoton } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { crearHorario } from "../actions";
import { TURNOS } from "@/lib/reservas";
import { EliminarHorarioBoton } from "./EliminarHorarioBoton";
import { CapacidadField } from "./CapacidadField";

export const dynamic = "force-dynamic";

export default async function HorariosReservaPage() {
  await pantallaConPermiso("reservas.gestionar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const horarios = await prisma.horarioReserva.findMany({
    orderBy: [{ turno: "asc" }, { hora: "asc" }],
  });

  return (
    <div>
      <div className="mb-4">
        <Volver href="/admin/reservas" texto="Volver a reservas" />
      </div>
      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">Horarios de reservas</h1>
      <p className="mb-6 text-sm text-tinta-media">
        Cargá los horarios disponibles para cada turno — son los que ve el cliente al reservar
        mesa. El <strong>cupo</strong> es cuántas personas como máximo aceptás en ese horario:
        dejalo vacío si no querés poner límite.
      </p>

      <div className="flex flex-col gap-8">
        {TURNOS.map((turno) => {
          const delTurno = horarios.filter((h) => h.turno === turno.value);
          return (
            <div key={turno.value}>
              <h2 className="mb-3 font-semibold text-tinta">{turno.label}</h2>

              <div className="overflow-hidden rounded-lg border border-linea bg-white">
                <div className="flex border-b border-linea bg-papel-suave px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta-media">
                  <span className="w-24 flex-none">Horario</span>
                  <span className="flex-1">Cupo de personas</span>
                  <span className="w-10 flex-none" />
                </div>

                <div className="divide-y divide-linea-fina">
                  {delTurno.map((h) => (
                    <div key={h.id} className="flex items-center px-4 py-2.5">
                      <span className="w-24 flex-none font-medium text-tinta">
                        {h.hora}
                      </span>
                      <span className="flex flex-1 items-center gap-2">
                        <CapacidadField id={h.id} capacidad={h.capacidadPersonas} />
                        <span className="text-xs text-tinta-suave">
                          {h.capacidadPersonas == null
                            ? "sin límite"
                            : `hasta ${h.capacidadPersonas} personas`}
                        </span>
                      </span>
                      <span className="w-10 flex-none text-right">
                        <EliminarHorarioBoton id={h.id} />
                      </span>
                    </div>
                  ))}

                  {delTurno.length === 0 && (
                    <p className="px-4 py-3 text-sm text-tinta-suave">
                      Todavía no hay horarios para este turno.
                    </p>
                  )}

                  <form
                    action={crearHorario}
                    className="flex flex-wrap items-center gap-2 bg-papel-suave/60 px-4 py-3"
                  >
                    <input type="hidden" name="turno" value={turno.value} />
                    <input
                      type="time"
                      name="hora"
                      required
                      aria-label={`Nuevo horario de ${turno.label}`}
                      className="w-28 rounded-lg border border-linea px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      name="capacidadPersonas"
                      min={1}
                      placeholder="Cupo (opcional)"
                      aria-label="Cupo de personas del nuevo horario"
                      className="w-36 rounded-lg border border-linea px-2 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      className={clasesBoton("principal", "sm")}
                    >
                      Agregar horario
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
