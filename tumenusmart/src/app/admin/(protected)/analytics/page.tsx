import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularClientesDelRango, calcularDistribucionFrecuencia } from "@/lib/clientes-analytics";
import { calcularProgresoFidelidad } from "@/lib/fidelidad";
import { Cabecera, Cifra, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { linkWhatsappCliente } from "@/lib/whatsapp";
import { CanjearFidelidadBoton } from "./CanjearFidelidadBoton";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "30dias", label: "Últimos 30 días" },
  { value: "45dias", label: "Últimos 45 días" },
  { value: "60dias", label: "Últimos 60 días" },
];

const TOPE_TABLA = 100;

function fechaCorta(valor: Date): string {
  return valor.toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  await pantallaConPermiso("analytics.ver");

  const { fecha } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "30dias";
  const rango =
    calcularRangoFecha(fechaActiva, undefined, undefined) ??
    calcularRangoFecha("30dias", undefined, undefined)!;

  const storeId = await idLocalActual();
  const [clientes, store] = await Promise.all([
    calcularClientesDelRango(storeId, rango),
    prisma.store.findUnique({
      where: { id: storeId },
      select: { fidelizacionActiva: true, fidelizacionUmbral: true, fidelizacionPremio: true },
    }),
  ]);
  const distribucion = calcularDistribucionFrecuencia(clientes);
  const top = clientes.slice(0, TOPE_TABLA);

  const fidelizacionActiva = store?.fidelizacionActiva ?? false;
  const umbral = store?.fidelizacionUmbral ?? 10;
  const premio = store?.fidelizacionPremio ?? "";
  const progresoFidelidad = fidelizacionActiva
    ? await calcularProgresoFidelidad(storeId, umbral)
    : null;

  return (
    <div>
      <Cabecera
        titulo="Analytics"
        bajada="Quiénes son tus clientes más frecuentes en el período que elijas, para saber a quién cuidar primero."
        acciones={
          <a
            href={`/admin/analytics/imprimir?fecha=${fechaActiva}`}
            target="_blank"
            rel="noopener noreferrer"
            className={clasesBoton("navegar", "sm")}
          >
            Ver reporte / PDF
          </a>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={`/admin/analytics?fecha=${f.value}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra
          rotulo="Pidieron 1 vez"
          valor={String(distribucion.unaVez)}
          detalle="Todavía no volvieron"
        />
        <Cifra
          rotulo="Pidieron 2-3 veces"
          valor={String(distribucion.dosATres)}
          detalle="Empezando a volver"
        />
        <Cifra
          rotulo="Pidieron 4 o más veces"
          valor={String(distribucion.cuatroOMas)}
          detalle="Tu base fiel"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-tinta">
          Top {Math.min(TOPE_TABLA, clientes.length)} clientes por cantidad de pedidos
        </h2>
        {clientes.length > TOPE_TABLA && (
          <p className="text-xs text-tinta-suave">
            Mostrando los {TOPE_TABLA} primeros de {clientes.length} clientes en el período
          </p>
        )}
      </div>

      {top.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay pedidos en este período.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-linea bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-linea bg-papel-suave text-xs uppercase tracking-wide text-tinta-media">
              <tr>
                <th className="px-3 py-2 w-8">#</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Teléfono</th>
                <th className="px-3 py-2 text-right">Pedidos</th>
                <th className="px-3 py-2 text-right">Gasto total</th>
                <th className="px-3 py-2 text-right">Último pedido</th>
                {fidelizacionActiva && (
                  <th className="px-3 py-2 text-right">
                    Fidelización
                    <span className="block text-[0.65rem] normal-case text-tinta-suave">
                      pedidos entregados de siempre
                    </span>
                  </th>
                )}
                <th className="px-3 py-2 text-center">Escribir</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c, i) => {
                const progreso = progresoFidelidad?.get(c.telefono);
                return (
                <tr key={c.telefono} className="border-b border-linea-fina last:border-0">
                  <td className="px-3 py-2 font-semibold text-tinta-suave">{i + 1}</td>
                  <td className="px-3 py-2 font-medium text-tinta">{c.nombre}</td>
                  <td className="px-3 py-2 text-tinta-media">{c.telefono}</td>
                  <td className="px-3 py-2 text-right font-semibold text-tinta">{c.pedidos}</td>
                  <td className="cifra px-3 py-2 text-right text-tinta-media">
                    {formatearGuarani(Math.round(c.gastado))}
                  </td>
                  <td className="px-3 py-2 text-right text-tinta-suave">
                    {fechaCorta(c.ultimoPedido)}
                  </td>
                  {fidelizacionActiva && (
                    <td className="px-3 py-2 text-right">
                      {progreso ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="cifra text-tinta-media">
                            {progreso.progreso}/{umbral}
                          </span>
                          {progreso.listo && (
                            <CanjearFidelidadBoton telefono={c.telefono} premio={premio} />
                          )}
                        </div>
                      ) : (
                        <span className="cifra text-tinta-suave">0/{umbral}</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center">
                    {/* Sin mensaje precargado a propósito: el dueño decide qué
                        escribirle, no el sistema. */}
                    <a
                      href={linkWhatsappCliente(c.telefono, "")}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Escribirle a ${c.nombre} por WhatsApp`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 text-base text-[#128C7E] hover:bg-[#25D366]/20"
                    >
                      💬
                    </a>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
