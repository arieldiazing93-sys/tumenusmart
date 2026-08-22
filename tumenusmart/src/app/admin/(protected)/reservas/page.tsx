import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  ZONA_NEGOCIO,
  claveDiaAsuncion,
  fechaAsuncionDesdeTexto,
  inicioDeMesEnAsuncion,
  inicioDeMesSiguienteEnAsuncion,
} from "@/lib/timezone";
import {
  parsearMes,
  claveMes,
  mesAnterior,
  mesSiguiente,
  construirGrillaMes,
  NOMBRES_MES,
  DIAS_SEMANA,
} from "@/lib/calendario";
import { etiquetaTurno, etiquetaMotivo } from "@/lib/reservas";
import { EstadoReservaSelect } from "./EstadoReservaSelect";

export const dynamic = "force-dynamic";

export default async function AdminReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; dia?: string }>;
}) {
  const { mes: mesParam, dia: diaParam } = await searchParams;
  const hoyClave = claveDiaAsuncion(new Date());
  const { anio, mes } = parsearMes(mesParam, hoyClave);

  const refMes = fechaAsuncionDesdeTexto(`${claveMes(anio, mes)}-01`)!;
  const gte = inicioDeMesEnAsuncion(refMes);
  const lt = inicioDeMesSiguienteEnAsuncion(refMes);

  const reservas = await prisma.reservation.findMany({
    where: { fecha: { gte, lt } },
    orderBy: [{ fecha: "asc" }, { horario: "asc" }],
  });

  const porDia = new Map<string, typeof reservas>();
  for (const r of reservas) {
    const clave = claveDiaAsuncion(r.fecha);
    const lista = porDia.get(clave) ?? [];
    lista.push(r);
    porDia.set(clave, lista);
  }

  const celdas = construirGrillaMes(anio, mes);
  const diaSeleccionado = diaParam ?? null;
  const reservasDelDia = diaSeleccionado ? porDia.get(diaSeleccionado) ?? [] : [];

  const anterior = mesAnterior(anio, mes);
  const siguiente = mesSiguiente(anio, mes);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-neutral-900">Reservas</h1>
        <Link
          href="/admin/reservas/horarios"
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:border-brand hover:text-brand"
        >
          ⚙ Horarios
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/admin/reservas?mes=${claveMes(anterior.anio, anterior.mes)}`}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-brand hover:text-brand"
        >
          ‹ Anterior
        </Link>
        <span className="font-semibold text-neutral-800">
          {NOMBRES_MES[mes]} {anio}
        </span>
        <Link
          href={`/admin/reservas?mes=${claveMes(siguiente.anio, siguiente.mes)}`}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:border-brand hover:text-brand"
        >
          Siguiente ›
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-neutral-500">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {celdas.map((c) => {
          const lista = porDia.get(c.fecha) ?? [];
          const esHoy = c.fecha === hoyClave;
          const seleccionada = c.fecha === diaSeleccionado;
          return (
            <Link
              key={c.fecha}
              href={`/admin/reservas?mes=${claveMes(anio, mes)}&dia=${c.fecha}`}
              className={`flex min-h-[60px] flex-col items-center justify-start rounded-lg border p-1.5 text-sm ${
                !c.enMes
                  ? "border-transparent text-neutral-300"
                  : seleccionada
                    ? "border-brand bg-brand-light"
                    : "border-neutral-200 bg-white hover:border-brand"
              } ${esHoy ? "font-bold text-brand" : ""}`}
            >
              <span>{c.dia}</span>
              {lista.length > 0 && (
                <span className="mt-1 rounded-full bg-brand px-1.5 text-[10px] font-medium text-white">
                  {lista.length}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-semibold text-neutral-800">
          {diaSeleccionado
            ? `Reservas del ${new Date(fechaAsuncionDesdeTexto(diaSeleccionado)!).toLocaleDateString(
                "es-PY",
                { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA_NEGOCIO }
              )}`
            : "Elegí un día del calendario para ver el detalle"}
        </h2>

        {diaSeleccionado && reservasDelDia.length === 0 && (
          <p className="text-sm text-neutral-400">No hay reservas para este día.</p>
        )}

        <div className="flex flex-col gap-2">
          {reservasDelDia.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-neutral-900">
                  {r.horario} · {etiquetaTurno(r.turno)} — {r.personas}{" "}
                  {r.personas === 1 ? "persona" : "personas"}
                </p>
                <p className="text-sm text-neutral-600">
                  {r.clienteNombre} · {r.clienteTelefono}
                </p>
                {r.clienteEmail && <p className="text-sm text-neutral-500">{r.clienteEmail}</p>}
                <p className="text-sm text-neutral-500">Motivo: {etiquetaMotivo(r.motivo)}</p>
              </div>
              <EstadoReservaSelect id={r.id} estado={r.estado} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
