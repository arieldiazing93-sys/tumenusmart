import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { agregarTramoHorario } from "../actions";
import {
  NOMBRES_DIA,
  DIAS_ORDENADOS,
  calcularEstadoAtencion,
} from "@/lib/horario-atencion";
import { EliminarTramoBoton } from "./EliminarTramoBoton";

export const dynamic = "force-dynamic";

export default async function HorariosAtencionPage() {
  const tramos = await prisma.horarioAtencion.findMany({
    orderBy: [{ diaSemana: "asc" }, { abre: "asc" }],
  });

  const estado = calcularEstadoAtencion(tramos);
  const sinConfigurar = tramos.length === 0;

  return (
    <div>
      <Link
        href="/admin/configuracion"
        className="mb-4 inline-block text-sm text-neutral-500 hover:text-brand"
      >
        ← Configuración
      </Link>

      <h1 className="mb-1 text-xl font-bold text-neutral-900">Horario de atención</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Cargá los tramos en los que el local toma pedidos. Un día sin tramos queda{" "}
        <strong>cerrado</strong> — así se marca el día de descanso. Podés cargar dos tramos
        el mismo día si trabajás con turno partido (mediodía y noche).
      </p>

      <div
        className={`mb-6 rounded-lg border p-4 ${
          sinConfigurar
            ? "border-neutral-200 bg-white"
            : estado.abierto
              ? "border-green-300 bg-green-50"
              : "border-amber-300 bg-amber-50"
        }`}
      >
        {sinConfigurar ? (
          <p className="text-sm text-neutral-600">
            Todavía no cargaste ningún horario, así que el menú <strong>acepta pedidos a
            cualquier hora</strong>. Cargá los tramos de abajo para que se respete tu horario real.
          </p>
        ) : (
          <p className="text-sm font-medium">
            {estado.abierto ? (
              <span className="text-green-800">🟢 Ahora mismo el local figura como ABIERTO</span>
            ) : (
              <span className="text-amber-900">
                🔴 Ahora mismo figura como CERRADO
                {estado.proximaApertura ? ` — abre ${estado.proximaApertura}` : ""}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {DIAS_ORDENADOS.map((dia) => {
          const delDia = tramos.filter((t) => t.diaSemana === dia);
          const cerrado = delDia.length === 0;
          return (
            <div
              key={dia}
              className={`rounded-lg border p-4 ${
                cerrado ? "border-neutral-200 bg-neutral-50" : "border-neutral-200 bg-white"
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-neutral-900">{NOMBRES_DIA[dia]}</p>
                {cerrado && (
                  <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                    Cerrado
                  </span>
                )}
              </div>

              {delDia.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {delDia.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm"
                    >
                      {t.abre} a {t.cierra}
                      {t.cierra <= t.abre && (
                        <span className="text-xs text-neutral-400">(del día siguiente)</span>
                      )}
                      <EliminarTramoBoton id={t.id} />
                    </div>
                  ))}
                </div>
              )}

              <form action={agregarTramoHorario} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="diaSemana" value={dia} />
                <label className="text-xs text-neutral-500">Abre</label>
                <input
                  type="time"
                  name="abre"
                  required
                  className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <label className="text-xs text-neutral-500">Cierra</label>
                <input
                  type="time"
                  name="cierra"
                  required
                  className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
                >
                  Agregar tramo
                </button>
              </form>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        Si el local cierra después de medianoche (ej: de 19:00 a 01:00), cargá el tramo tal
        cual — el sistema entiende que el cierre cae al día siguiente.
      </p>
    </div>
  );
}
