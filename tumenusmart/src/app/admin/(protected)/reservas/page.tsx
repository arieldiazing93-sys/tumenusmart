import { BotonEnlace, Cabecera } from "@/components/ui";
import Link from "next/link";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import {
  ZONA_NEGOCIO,
  claveDiaAsuncion,
  fechaAsuncionDesdeTexto,
  inicioDeMesEnAsuncion,
  inicioDeMesSiguienteEnAsuncion,
} from "@/lib/timezone";
import {
  claveMes,
  construirGrillaMes,
  claveSumarDias,
  diasDeLaSemana,
  NOMBRES_MES,
  DIAS_SEMANA,
} from "@/lib/calendario";
import { etiquetaTurno, etiquetaMotivo } from "@/lib/reservas";
import { formatearNumero } from "@/lib/format";
import { linkWhatsappCliente } from "@/lib/whatsapp";
import type { Reservation } from "@prisma/client";
import { calcularDisponibilidad } from "@/lib/cupos-reserva";
import { EstadoReservaSelect } from "./EstadoReservaSelect";
import { NotaReservaField } from "./NotaReservaField";

export const dynamic = "force-dynamic";

type Vista = "dia" | "semana" | "mes";
type ReservaFila = Reservation;

const VISTAS: { value: Vista; label: string }[] = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];

function fechaLarga(clave: string): string {
  const fecha = fechaAsuncionDesdeTexto(clave);
  if (!fecha) return clave;
  const texto = fecha.toLocaleDateString("es-PY", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function fechaCorta(clave: string): string {
  const [, m, d] = clave.split("-");
  return `${d}/${m}`;
}

function TarjetaReserva({ r }: { r: ReservaFila }) {
  return (
    <div className="rounded-lg border border-linea bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-tinta">
            {formatearNumero(r.numero)} · {r.horario} · {etiquetaTurno(r.turno)} — {r.personas}{" "}
            {r.personas === 1 ? "persona" : "personas"}
          </p>
          <p className="text-sm text-tinta-media">
            {r.clienteNombre} · {r.clienteTelefono}
          </p>
          {r.clienteEmail && <p className="text-sm text-tinta-media">{r.clienteEmail}</p>}
          <p className="text-sm text-tinta-media">Motivo: {etiquetaMotivo(r.motivo)}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={linkWhatsappCliente(
              r.clienteTelefono,
              `Hola ${r.clienteNombre}, te escribimos por tu reserva ${formatearNumero(r.numero)} para el ${r.horario}.`
            )}
            target="_blank"
            rel="noopener noreferrer"
            title={`Escribirle a ${r.clienteNombre} por WhatsApp`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 text-base text-[#128C7E] hover:bg-[#25D366]/20"
          >
            💬
          </a>
          <EstadoReservaSelect id={r.id} estado={r.estado} />
        </div>
      </div>
      <NotaReservaField id={r.id} nota={r.nota} />
    </div>
  );
}

export default async function AdminReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; dia?: string }>;
}) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const { vista: vistaParam, dia: diaParam } = await searchParams;
  const hoyClave = claveDiaAsuncion(new Date());
  const vista: Vista = vistaParam === "dia" || vistaParam === "semana" ? vistaParam : "mes";
  const diaAncla = diaParam && /^\d{4}-\d{2}-\d{2}$/.test(diaParam) ? diaParam : hoyClave;

  function hrefVista(v: Vista, dia = diaAncla) {
    return `/admin/reservas?vista=${v}&dia=${dia}`;
  }

  // --- Rango de fechas a consultar, según la vista activa ---
  let gte: Date;
  let lt: Date;
  let semana: string[] = [];
  let anioMes = { anio: 0, mes: 0 };

  if (vista === "dia") {
    gte = fechaAsuncionDesdeTexto(diaAncla)!;
    lt = fechaAsuncionDesdeTexto(claveSumarDias(diaAncla, 1))!;
  } else if (vista === "semana") {
    semana = diasDeLaSemana(diaAncla);
    gte = fechaAsuncionDesdeTexto(semana[0])!;
    lt = fechaAsuncionDesdeTexto(claveSumarDias(semana[6], 1))!;
  } else {
    const [anioStr, mesStr] = diaAncla.split("-");
    anioMes = { anio: Number(anioStr), mes: Number(mesStr) - 1 };
    const refMes = fechaAsuncionDesdeTexto(`${anioStr}-${mesStr}-01`)!;
    gte = inicioDeMesEnAsuncion(refMes);
    lt = inicioDeMesSiguienteEnAsuncion(refMes);
  }

  // Solo entran al calendario las reservas que el cliente realmente envió
  // por WhatsApp. Las que quedaron a medio camino se cuentan aparte, para
  // que el encargado sepa que existen sin que le ensucien la agenda.
  const [reservas, sinEnviar, ocupacionDia] = await Promise.all([
    prisma.reservation.findMany({
      where: { fecha: { gte, lt }, enviadoWhatsapp: true },
      orderBy: [{ fecha: "asc" }, { horario: "asc" }],
    }),
    prisma.reservation.count({
      where: { fecha: { gte, lt }, enviadoWhatsapp: false },
    }),
    // La ocupación por horario solo tiene sentido mirando un día puntual.
    vista === "dia" ? calcularDisponibilidad(storeId, diaAncla) : Promise.resolve([]),
  ]);

  // Solo se muestran los horarios que tienen cupo definido o alguna reserva:
  // listar horarios vacíos y sin límite no le dice nada al encargado.
  const ocupacionVisible = ocupacionDia.filter(
    (o) => o.capacidad != null || o.ocupado > 0
  );

  const porDia = new Map<string, ReservaFila[]>();
  for (const r of reservas) {
    const clave = claveDiaAsuncion(r.fecha);
    const lista = porDia.get(clave) ?? [];
    lista.push(r);
    porDia.set(clave, lista);
  }

  return (
    <div>
      <Cabecera
        titulo="Reservas"
        bajada="Las mesas pedidas desde la carta. Imprimí el informe del día y dejáselo al encargado de turno."
        acciones={
          <>
            {/*
              El informe en naranja porque es la acción que se viene a hacer
              acá; Horarios en azul porque lleva a otra pantalla. Es la misma
              regla del resto del sistema: naranja avanza, azul navega.
            */}
            <BotonEnlace
              href={`/admin/reservas/imprimir?dia=${vista === "dia" ? diaAncla : hoyClave}`}
              tono="principal"
              tam="sm"
            >
              Informe del día
            </BotonEnlace>
            <BotonEnlace href="/admin/reservas/horarios" tono="navegar" tam="sm">
              Horarios
            </BotonEnlace>
          </>
        }
      />

      {sinEnviar > 0 && (
        <p className="mb-4 rounded-lg border border-linea bg-papel-suave px-3 py-2 text-xs text-tinta-media">
          {sinEnviar} {sinEnviar === 1 ? "persona empezó" : "personas empezaron"} una reserva en
          este período pero nunca la envió por WhatsApp, así que no figura en el calendario.
        </p>
      )}

      <div className="mb-6 flex gap-2">
        {VISTAS.map((v) => (
          <Link
            key={v.value}
            href={hrefVista(v.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              vista === v.value
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {vista === "dia" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={hrefVista("dia", claveSumarDias(diaAncla, -1))}
              className="rounded-lg border border-linea px-3 py-1.5 text-sm text-tinta-media hover:border-brand hover:text-brand"
            >
              ‹ Anterior
            </Link>
            <span className="font-semibold text-tinta">{fechaLarga(diaAncla)}</span>
            <Link
              href={hrefVista("dia", claveSumarDias(diaAncla, 1))}
              className="rounded-lg border border-linea px-3 py-1.5 text-sm text-tinta-media hover:border-brand hover:text-brand"
            >
              Siguiente ›
            </Link>
          </div>

          {ocupacionVisible.length > 0 && (
            <div className="mb-4 rounded-lg border border-linea bg-white p-4">
              <p className="mb-3 text-sm font-medium text-tinta-media">Ocupación del día</p>
              <div className="flex flex-col gap-2">
                {ocupacionVisible.map((o) => {
                  const lleno = o.lugaresLibres === 0;
                  const proporcion =
                    o.capacidad && o.capacidad > 0
                      ? Math.min(100, (o.ocupado / o.capacidad) * 100)
                      : 0;
                  return (
                    <div key={`${o.turno}-${o.hora}`} className="flex items-center gap-3">
                      <span className="w-14 flex-none text-sm font-medium text-tinta">
                        {o.hora}
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-papel-hundido">
                        {o.capacidad != null && (
                          <div
                            className={`h-2 rounded-full ${lleno ? "bg-peligro" : "bg-brand"}`}
                            style={{ width: `${proporcion}%` }}
                          />
                        )}
                      </div>
                      <span
                        className={`w-32 flex-none text-right text-sm ${
                          lleno ? "font-semibold text-peligro" : "text-tinta-media"
                        }`}
                      >
                        {o.capacidad == null
                          ? `${o.ocupado} personas`
                          : `${o.ocupado}/${o.capacidad}${lleno ? " · completo" : ""}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {(porDia.get(diaAncla) ?? []).map((r) => (
              <TarjetaReserva key={r.id} r={r} />
            ))}
            {(porDia.get(diaAncla) ?? []).length === 0 && (
              <p className="text-sm text-tinta-suave">No hay reservas para este día.</p>
            )}
          </div>
        </div>
      )}

      {vista === "semana" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={hrefVista("semana", claveSumarDias(diaAncla, -7))}
              className="rounded-lg border border-linea px-3 py-1.5 text-sm text-tinta-media hover:border-brand hover:text-brand"
            >
              ‹ Semana anterior
            </Link>
            <span className="font-semibold text-tinta">
              {fechaCorta(semana[0])} – {fechaCorta(semana[6])}
            </span>
            <Link
              href={hrefVista("semana", claveSumarDias(diaAncla, 7))}
              className="rounded-lg border border-linea px-3 py-1.5 text-sm text-tinta-media hover:border-brand hover:text-brand"
            >
              Semana siguiente ›
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {semana.map((clave, i) => {
              const lista = porDia.get(clave) ?? [];
              const esHoy = clave === hoyClave;
              return (
                <div
                  key={clave}
                  className={`rounded-lg border p-2 ${esHoy ? "border-brand" : "border-linea"}`}
                >
                  <Link
                    href={hrefVista("dia", clave)}
                    className={`mb-2 block text-center text-xs font-semibold ${
                      esHoy ? "text-brand" : "text-tinta-media"
                    } hover:underline`}
                  >
                    {DIAS_SEMANA[i]} {fechaCorta(clave)}
                  </Link>
                  <div className="flex flex-col gap-1.5">
                    {lista.map((r) => (
                      <div key={r.id} className="rounded-md bg-papel-suave p-2 text-xs">
                        <p className="font-medium text-tinta">
                          {r.horario} · {r.clienteNombre}
                        </p>
                        <p className="text-tinta-media">
                          {r.personas}p · {etiquetaMotivo(r.motivo)}
                        </p>
                      </div>
                    ))}
                    {lista.length === 0 && (
                      <p className="text-center text-[11px] text-tinta-suave">—</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vista === "mes" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={hrefVista(
                "mes",
                `${claveMes(
                  anioMes.mes === 0 ? anioMes.anio - 1 : anioMes.anio,
                  anioMes.mes === 0 ? 11 : anioMes.mes - 1
                )}-01`
              )}
              className="rounded-lg border border-linea px-3 py-1.5 text-sm text-tinta-media hover:border-brand hover:text-brand"
            >
              ‹ Anterior
            </Link>
            <span className="font-semibold text-tinta">
              {NOMBRES_MES[anioMes.mes]} {anioMes.anio}
            </span>
            <Link
              href={hrefVista(
                "mes",
                `${claveMes(
                  anioMes.mes === 11 ? anioMes.anio + 1 : anioMes.anio,
                  anioMes.mes === 11 ? 0 : anioMes.mes + 1
                )}-01`
              )}
              className="rounded-lg border border-linea px-3 py-1.5 text-sm text-tinta-media hover:border-brand hover:text-brand"
            >
              Siguiente ›
            </Link>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-tinta-media">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {construirGrillaMes(anioMes.anio, anioMes.mes).map((c) => {
              const lista = porDia.get(c.fecha) ?? [];
              const esHoy = c.fecha === hoyClave;
              const seleccionada = c.fecha === diaAncla;
              return (
                <Link
                  key={c.fecha}
                  href={hrefVista("mes", c.fecha)}
                  className={`flex min-h-[60px] flex-col items-center justify-start rounded-lg border p-1.5 text-sm ${
                    !c.enMes
                      ? "border-transparent text-tinta-suave"
                      : seleccionada
                        ? "border-brand bg-brand-light"
                        : "border-linea bg-white hover:border-brand"
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
            <h2 className="mb-3 font-semibold text-tinta">
              Reservas del {fechaLarga(diaAncla)}
            </h2>

            {(porDia.get(diaAncla) ?? []).length === 0 && (
              <p className="text-sm text-tinta-suave">No hay reservas para este día.</p>
            )}

            <div className="flex flex-col gap-2">
              {(porDia.get(diaAncla) ?? []).map((r) => (
                <TarjetaReserva key={r.id} r={r} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
