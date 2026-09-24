import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { estadoSuscripcion, type EstadoSuscripcion } from "@/lib/suscripcion";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

export default async function ImprimirCarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  // Mismo chequeo que la pantalla de Cartera: no es un permiso de local, es
  // "sos vos, el dueño de TuMenuSmart" — un admin de un local no tiene que
  // poder abrir este informe de cobranza de los demás.
  const sesion = await sesionActual();
  if (!sesion || sesion.rol !== "superadmin") redirect("/admin/pedidos");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva = fecha ?? "mes";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;
  const ahora = new Date();

  const [locales, pagos] = await Promise.all([
    prisma.store.findMany({
      orderBy: { nombre: "asc" },
      select: {
        nombre: true,
        slug: true,
        estado: true,
        vencimiento: true,
        titularNombre: true,
        titularTelefono: true,
        razonSocial: true,
        ruc: true,
        asesor: { select: { nombre: true } },
      },
    }),
    prisma.pago.findMany({
      where: { fecha: { gte: rango.gte, lt: rango.lt } },
      orderBy: { fecha: "desc" },
      include: { store: { select: { nombre: true, slug: true, asesor: { select: { nombre: true } } } } },
    }),
  ]);

  const cuenta = (clase: EstadoSuscripcion["clase"]) =>
    locales.filter((l) => estadoSuscripcion(l, ahora, ZONA_NEGOCIO).clase === clase).length;

  const totalRecaudado = pagos.reduce((s, p) => s + Number(p.monto), 0);

  const SIN_ASESOR = "Sin asignar";

  const localesPorAsesor = new Map<string, number>();
  for (const l of locales) {
    const nombre = l.asesor?.nombre ?? SIN_ASESOR;
    localesPorAsesor.set(nombre, (localesPorAsesor.get(nombre) ?? 0) + 1);
  }
  const filasAsesorLocales = [...localesPorAsesor].sort((a, b) => b[1] - a[1]);

  const recaudadoPorAsesor = new Map<string, number>();
  for (const p of pagos) {
    const nombre = p.store.asesor?.nombre ?? SIN_ASESOR;
    recaudadoPorAsesor.set(nombre, (recaudadoPorAsesor.get(nombre) ?? 0) + Number(p.monto));
  }
  const filasAsesorRecaudado = [...recaudadoPorAsesor].sort((a, b) => b[1] - a[1]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };

  const filasKpi: [string, string][] = [
    ["Locales totales", String(locales.length)],
    ["Vencidos", String(cuenta("vencido"))],
    ["Por vencer", String(cuenta("por_vencer"))],
    ["Al día", String(cuenta("al_dia"))],
    ["Suspendidos a mano", String(cuenta("suspendido"))],
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 border-b border-linea pb-6">
        <h1 className="text-2xl font-bold text-tinta">Cartera de locales</h1>
        <p className="mt-1 text-sm text-tinta-media">
          Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
          {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
        </p>
      </div>

      <h2 className="mb-3 font-semibold text-tinta">Estado de hoy</h2>
      <table className="mb-10 w-full border-collapse text-sm">
        <tbody>
          {filasKpi.map(([etiqueta, valor]) => (
            <tr key={etiqueta} className="border-b border-linea">
              <td className="py-2 text-tinta-media">{etiqueta}</td>
              <td className="py-2 text-right font-semibold text-tinta">{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/*
        Foto de HOY de cada local con sus datos de contacto/facturación —
        los mismos cuatro campos del titular que se ven y se editan en el modal
        "Ver" de Cartera, que solo se podían consultar local por local.
      */}
      <h2 className="mb-3 font-semibold text-tinta">Locales</h2>
      <table className="mb-10 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
            <th className="py-1.5">Local</th>
            <th className="py-1.5">Estado</th>
            <th className="py-1.5">Vence</th>
            <th className="py-1.5">Asesor</th>
            <th className="py-1.5">Titular</th>
            <th className="py-1.5">Teléfono titular</th>
            <th className="py-1.5">Razón social</th>
            <th className="py-1.5">RUC</th>
          </tr>
        </thead>
        <tbody>
          {locales.map((l) => (
            <tr key={l.slug} className="border-b border-linea-fina">
              <td className="py-1.5">{l.nombre}</td>
              <td className="py-1.5 text-tinta-media">
                {estadoSuscripcion(l, ahora, ZONA_NEGOCIO).etiqueta}
              </td>
              <td className="py-1.5 text-tinta-media">
                {l.vencimiento ? l.vencimiento.toLocaleDateString("es-PY", opcionesFecha) : "—"}
              </td>
              <td className="py-1.5 text-tinta-media">{l.asesor?.nombre ?? SIN_ASESOR}</td>
              <td className="py-1.5 text-tinta-media">{l.titularNombre ?? "—"}</td>
              <td className="py-1.5 text-tinta-media">{l.titularTelefono ?? "—"}</td>
              <td className="py-1.5 text-tinta-media">{l.razonSocial ?? "—"}</td>
              <td className="py-1.5 text-tinta-media">{l.ruc ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-10 grid grid-cols-2 gap-8">
        <div>
          <h2 className="mb-3 font-semibold text-tinta">Locales por asesor</h2>
          {filasAsesorLocales.length === 0 ? (
            <p className="text-sm text-tinta-suave">Sin datos.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {filasAsesorLocales.map(([nombre, cantidad]) => (
                  <tr key={nombre} className="border-b border-linea">
                    <td className="py-1.5 text-tinta-media">{nombre}</td>
                    <td className="py-1.5 text-right font-semibold text-tinta">{cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2 className="mb-3 font-semibold text-tinta">Recaudado en el período por asesor</h2>
          {filasAsesorRecaudado.length === 0 ? (
            <p className="text-sm text-tinta-suave">Sin pagos en este período.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <tbody>
                {filasAsesorRecaudado.map(([nombre, monto]) => (
                  <tr key={nombre} className="border-b border-linea">
                    <td className="py-1.5 text-tinta-media">{nombre}</td>
                    <td className="cifra py-1.5 text-right font-semibold text-tinta">
                      {formatearGuarani(monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h2 className="mb-3 font-semibold text-tinta">Pagos cobrados en el período</h2>
      {pagos.length === 0 ? (
        <p className="text-sm text-tinta-suave">No se registraron pagos en este período.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">Local</th>
              <th className="py-1.5">Asesor</th>
              <th className="py-1.5 text-right">Monto</th>
              <th className="py-1.5 text-right">Meses</th>
              <th className="py-1.5 text-right">Cubre hasta</th>
              <th className="py-1.5 text-right">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} className="border-b border-linea-fina">
                <td className="py-1.5">{p.store.nombre}</td>
                <td className="py-1.5 text-tinta-media">{p.store.asesor?.nombre ?? SIN_ASESOR}</td>
                <td className="cifra py-1.5 text-right">{formatearGuarani(Number(p.monto))}</td>
                <td className="py-1.5 text-right">{p.meses}</td>
                <td className="py-1.5 text-right">
                  {p.cubreHasta.toLocaleDateString("es-PY", opcionesFecha)}
                </td>
                <td className="py-1.5 text-right">
                  {p.fecha.toLocaleDateString("es-PY", opcionesFecha)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-linea font-semibold text-tinta">
              <td className="py-2">Total recaudado</td>
              <td className="cifra py-2 text-right">{formatearGuarani(totalRecaudado)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
