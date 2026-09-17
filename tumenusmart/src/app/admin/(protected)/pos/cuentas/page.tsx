import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, clasesBoton, Pastilla, Tabla, Th, Td, Tr, Vacio } from "@/components/ui";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { etiquetaFormaPagoPos, FORMAS_PAGO_POS } from "@/lib/turno-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
];

export default async function CuentasPosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string; formaPago?: string }>;
}) {
  // Vive en "Día a día": cualquier cajero que puede vender también tiene
  // que poder buscar una cuenta y cancelarla si hizo falta.
  await pantallaConPermiso("pos.vender");

  const { fecha, desde, hasta, formaPago } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "hoy";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("hoy", undefined, undefined)!;

  function hrefFecha(nuevaFecha: FiltroFecha) {
    const params = new URLSearchParams();
    params.set("fecha", nuevaFecha);
    if (formaPago) params.set("formaPago", formaPago);
    return `/admin/pos/cuentas?${params.toString()}`;
  }

  function hrefFormaPago(valor: string | null) {
    const params = new URLSearchParams();
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    if (valor) params.set("formaPago", valor);
    return `/admin/pos/cuentas?${params.toString()}`;
  }

  function querystringActual() {
    const params = new URLSearchParams();
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    if (formaPago) params.set("formaPago", formaPago);
    return params.toString();
  }

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const ventas = await db.ventaPos.findMany({
    where: { creadoEn: { gte: rango.gte, lt: rango.lt }, formaPago: formaPago || undefined },
    orderBy: { creadoEn: "desc" },
    select: {
      id: true,
      numero: true,
      total: true,
      formaPago: true,
      registradoPor: true,
      creadoEn: true,
      cancelada: true,
      clienteNombre: true,
    },
  });

  // Las canceladas no suman: no son plata que haya entrado a la caja.
  const totalGeneral = ventas.filter((v) => !v.cancelada).reduce((s, v) => s + Number(v.total), 0);

  return (
    <div>
      <Cabecera
        titulo="Cuentas del mostrador"
        bajada="Histórico de ventas cerradas por Punto de Venta."
        acciones={
          <>
            <a
              href={`/admin/pos/cuentas/exportar?${querystringActual()}`}
              className={clasesBoton("principal", "sm")}
            >
              Descargar Excel
            </a>
            <a
              href={`/admin/pos/cuentas/imprimir?${querystringActual()}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
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

        <form
          method="get"
          action="/admin/pos/cuentas"
          className={`flex flex-wrap items-center gap-1.5 rounded-full border px-2 py-1 text-sm ${
            fechaActiva === "rango" ? "border-brand bg-brand-light" : "border-linea"
          }`}
        >
          <input type="hidden" name="fecha" value="rango" />
          {formaPago && <input type="hidden" name="formaPago" value={formaPago} />}
          <input
            type="datetime-local"
            name="desde"
            defaultValue={fechaActiva === "rango" ? desde : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <span className="text-tinta-suave">–</span>
          <input
            type="datetime-local"
            name="hasta"
            defaultValue={fechaActiva === "rango" ? hasta : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <button
            type="submit"
            className="rounded-full bg-noche-panel px-3 py-1 text-xs font-medium text-white hover:bg-noche-panel"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Link
          href={hrefFormaPago(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            !formaPago
              ? "border-tinta bg-tinta text-white"
              : "border-linea text-tinta-media hover:border-tinta/40"
          }`}
        >
          Todas las formas
        </Link>
        {FORMAS_PAGO_POS.map((f) => (
          <Link
            key={f.valor}
            href={hrefFormaPago(f.valor)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              formaPago === f.valor
                ? "border-tinta bg-tinta text-white"
                : "border-linea text-tinta-media hover:border-tinta/40"
            }`}
          >
            {f.etiqueta}
          </Link>
        ))}
      </div>

      {ventas.length === 0 ? (
        <Vacio
          titulo="No hay cuentas en este período"
          detalle="Las ventas cerradas por Punto de Venta van a aparecer acá."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Cuenta</Th>
              <Th>Hora</Th>
              <Th>Cliente</Th>
              <Th>Forma de pago</Th>
              <Th>Cajero</Th>
              <Th>Estado</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <Tr key={v.id}>
                <Td>
                  <Link
                    href={`/admin/pos/venta/${v.id}`}
                    className="font-medium text-azul-oscuro hover:underline"
                  >
                    {formatearNumero(v.numero)}
                  </Link>
                </Td>
                <Td>
                  {v.creadoEn.toLocaleString("es-PY", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: ZONA_NEGOCIO,
                  })}
                </Td>
                <Td>{v.clienteNombre ?? "—"}</Td>
                <Td>{etiquetaFormaPagoPos(v.formaPago)}</Td>
                <Td>{v.registradoPor}</Td>
                <Td>
                  <Pastilla color={v.cancelada ? "peligro" : "exito"}>
                    {v.cancelada ? "Cancelada" : "Activa"}
                  </Pastilla>
                </Td>
                <Td
                  className={`cifra text-right font-medium ${
                    v.cancelada ? "text-tinta-suave line-through" : "text-tinta"
                  }`}
                >
                  {formatearGuarani(Number(v.total))}
                </Td>
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <Td colSpan={6} className="text-right font-medium">
                Total (sin canceladas)
              </Td>
              <Td className="cifra text-right font-semibold text-tinta">
                {formatearGuarani(totalGeneral)}
              </Td>
            </tr>
          </tfoot>
        </Tabla>
      )}
    </div>
  );
}
