import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { crearHorario } from "../actions";
import { TURNOS } from "@/lib/reservas";
import { EliminarHorarioBoton } from "./EliminarHorarioBoton";

export const dynamic = "force-dynamic";

export default async function HorariosReservaPage() {
  const horarios = await prisma.horarioReserva.findMany({
    orderBy: [{ turno: "asc" }, { hora: "asc" }],
  });

  return (
    <div>
      <Link href="/admin/reservas" className="mb-4 inline-block text-sm text-neutral-500 hover:text-brand">
        ← Reservas
      </Link>
      <h1 className="mb-1 text-xl font-bold text-neutral-900">Horarios de reservas</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Cargá los horarios disponibles para cada turno — son los que va a ver el cliente al reservar
        mesa desde el menú.
      </p>

      <div className="flex flex-col gap-8">
        {TURNOS.map((turno) => {
          const delTurno = horarios.filter((h) => h.turno === turno.value);
          return (
            <div key={turno.value}>
              <h2 className="mb-3 font-semibold text-neutral-800">{turno.label}</h2>

              <form action={crearHorario} className="mb-3 flex flex-wrap gap-2">
                <input type="hidden" name="turno" value={turno.value} />
                <input
                  type="time"
                  name="hora"
                  required
                  className="rounded-lg border border-neutral-300 px-3 py-2"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
                >
                  Agregar horario
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                {delTurno.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm"
                  >
                    {h.hora}
                    <EliminarHorarioBoton id={h.id} />
                  </div>
                ))}
                {delTurno.length === 0 && (
                  <p className="text-sm text-neutral-400">Todavía no hay horarios para este turno.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
