import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, clasesBoton, Tabla, Th, Td, Tr, Vacio, BotonEnlace } from "@/components/ui";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
];

function totalDeclarado(t: {
  declaradoEfectivo: unknown;
  declaradoTransferencia: unknown;
  declaradoTarjetaDebito: unknown;
  declaradoTarjetaCredito: unknown;
}): number {
  return (
    Number(t.declaradoEfectivo ?? 0) +
    Number(t.declaradoTransferencia ?? 0) +
    Number(t.declaradoTarjetaDebito ?? 0) +
    Number(t.declaradoTarjetaCredito ?? 0)
  );
}

function totalCalculado(t: {
  calculadoEfectivo: unknown;
  calculadoTransferencia: unknown;
  calculadoTarjetaDebito: unknown;
  calculadoTarjetaCredito: unknown;
}): number {
  return (
    Number(t.calculadoEfectivo ?? 0) +
    Number(t.calculadoTransferencia ?? 0) +
    Number(t.calculadoTarjetaDebito ?? 0) +
    Number(t.calculadoTarjetaCredito ?? 0)
  );
}

export default async function TurnosPosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "7dias";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("7dias", undefined, undefined)!;

  function hrefFecha(nuevaFecha: FiltroFecha) {
    return `/admin/pos/turnos?fecha=${nuevaFecha}`;
  }
  function querystringActual() {
    const params = new URLSearchParams();
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    return params.toString();
  }

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const turnos = await db.turnoPos.findMany({
    where: { estado: "cerrado", cerradoEn: { gte: rango.gte, lt: rango.lt } },
    orderBy: { cerradoEn: "desc" },
    select: {
      id: true,
      abiertoPor: true,
      cerradoPor: true,
      estacion: { select: { nombre: true } },
      abiertoEn: true,
      cerradoEn: true,
      cantidadVentas: true,
      declaradoEfectivo: true,
      declaradoTransferencia: true,
      declaradoTarjetaDebito: true,
      declaradoTarjetaCredito: true,
      calculadoEfectivo: true,
      calculadoTransferencia: true,
      calculadoTarjetaDebito: true,
      calculadoTarjetaCredito: true,
    },
  });

  return (
    <div>
      <Cabecera
        titulo="Cierres de turno"
        bajada="Histórico de aperturas y cierres de caja del Punto de Venta."
        acciones={
          <>
            <a
              href={`/admin/pos/turnos/exportar?${querystringActual()}`}
              className={clasesBoton("principal", "sm")}
            >
              Descargar Excel
            </a>
            <a
              href={`/admin/pos/turnos/imprimir?${querystringActual()}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={hrefFecha(f.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value && fechaActiva !== "rango"
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {turnos.length === 0 ? (
        <Vacio
          titulo="No hay turnos cerrados en este período"
          detalle="Los cierres de caja del Punto de Venta van a aparecer acá."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Cajero</Th>
              <Th>Estación</Th>
              <Th>Abrió</Th>
              <Th>Cerró</Th>
              <Th className="text-right">Ventas</Th>
              <Th className="text-right">Sistema</Th>
              <Th className="text-right">Declarado</Th>
              <Th className="text-right">Diferencia</Th>
              <Th className="text-right">
                <span className="sr-only">Acción</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {turnos.map((t) => {
              const declarado = totalDeclarado(t);
              const calculado = totalCalculado(t);
              const diferencia = declarado - calculado;
              return (
                <Tr key={t.id}>
                  <Td>
                    <Link
                      href={`/admin/pos/turnos/${t.id}`}
                      className="font-medium text-azul-oscuro hover:underline"
                    >
                      {t.cerradoPor ?? t.abiertoPor}
                    </Link>
                  </Td>
                  <Td>{t.estacion.nombre}</Td>
                  <Td>
                    {t.abiertoEn.toLocaleString("es-PY", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: ZONA_NEGOCIO,
                    })}
                  </Td>
                  <Td>
                    {t.cerradoEn
                      ? t.cerradoEn.toLocaleString("es-PY", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: ZONA_NEGOCIO,
                        })
                      : "—"}
                  </Td>
                  <Td className="text-right">{t.cantidadVentas ?? 0}</Td>
                  <Td className="cifra text-right">{formatearGuarani(calculado)}</Td>
                  <Td className="cifra text-right font-medium text-tinta">
                    {formatearGuarani(declarado)}
                  </Td>
                  <Td
                    className={`cifra text-right font-medium ${
                      diferencia === 0 ? "text-tinta-suave" : diferencia > 0 ? "text-exito" : "text-peligro"
                    }`}
                  >
                    {diferencia === 0 ? "—" : formatearGuarani(diferencia)}
                  </Td>
                  <Td className="text-right">
                    <BotonEnlace href={`/admin/pos/turnos/${t.id}`} tono="navegar" tam="sm">
                      Ver
                    </BotonEnlace>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
