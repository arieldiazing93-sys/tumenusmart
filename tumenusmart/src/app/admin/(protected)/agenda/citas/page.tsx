import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera, Cifra, Pastilla, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { diaLargo, horaDeMinutos, partesLocales, urlCita } from "@/lib/agenda";
import { nombreCompleto } from "@/lib/agenda-personal";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { detallePagos } from "@/lib/pago-venta";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
  { value: "mesAnterior", label: "Mes anterior" },
];

/** Tope de filas de la lista: más que eso no se lee igual (se filtra por fecha). */
const MAXIMO_CITAS = 500;

/**
 * Citas: las citas confirmadas, es decir, las que ya se cobraron en la caja. Una cita
 * aparece acá recién cuando se la cobra desde el detalle del calendario (y desaparece
 * si ese cobro se anula).
 *
 * Todo lo que se filtra (fecha, personal) vive en la dirección de la página.
 */
export default async function CitasPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string; personal?: string }>;
}) {
  await pantallaConPermiso("agenda.ver");
  const db = prismaDelLocal(await idLocalActual());

  const { fecha, desde, hasta, personal } = await searchParams;
  const fechaActiva: FiltroFecha = FILTROS_FECHA.some((f) => f.value === fecha) || fecha === "rango"
    ? (fecha as FiltroFecha)
    : "mes";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const equipo = await db.miembroPersonal.findMany({
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, apellido: true },
  });
  // Un id que no es de este local simplemente no filtra a nadie: se ve a todo el personal.
  const personalElegido = equipo.find((p) => p.id === personal)?.id ?? null;

  function href(cambios: { fecha?: FiltroFecha; personal?: string | null }) {
    const params = new URLSearchParams();
    const f = cambios.fecha ?? fechaActiva;
    params.set("fecha", f);
    if (f === "rango" && desde) params.set("desde", desde);
    if (f === "rango" && hasta) params.set("hasta", hasta);
    const p = cambios.personal === undefined ? personalElegido : cambios.personal;
    if (p) params.set("personal", p);
    return `/admin/agenda/citas?${params.toString()}`;
  }

  const citas = await db.cita.findMany({
    where: {
      inicio: { gte: rango.gte, lt: rango.lt },
      // Confirmada = cobrada en caja (y ese cobro no se anuló).
      ventaPos: { is: { cancelada: false } },
      ...(personalElegido ? { personalId: personalElegido } : {}),
    },
    orderBy: [{ inicio: "desc" }, { id: "asc" }],
    take: MAXIMO_CITAS,
    select: {
      id: true,
      clienteNombre: true,
      inicio: true,
      serviciosTexto: true,
      personal: { select: { nombre: true, apellido: true } },
      ventaPos: {
        select: {
          numero: true,
          total: true,
          comprobanteTipo: true,
          facturaNumero: true,
          facturaAnulada: true,
          pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } },
        },
      },
    },
  });

  const cobrado = citas.reduce((suma, c) => suma + Number(c.ventaPos?.total ?? 0), 0);
  const promedio = citas.length > 0 ? cobrado / citas.length : 0;

  return (
    <div>
      <Cabecera
        titulo="Citas"
        bajada="Las citas confirmadas: las que ya se cobraron en la caja. Para cobrar una, tocala en el calendario."
        acciones={
          <BotonEnlace href="/admin/agenda" tono="navegar" tam="md">
            Ir al calendario
          </BotonEnlace>
        }
      />

      {/* ---------- filtros ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={href({ fecha: f.value })}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form
          method="get"
          action="/admin/agenda/citas"
          className={`flex flex-wrap items-center gap-1.5 rounded-full border px-2 py-1 text-sm ${
            fechaActiva === "rango" ? "border-brand bg-brand-light" : "border-linea"
          }`}
        >
          <input type="hidden" name="fecha" value="rango" />
          {personalElegido && <input type="hidden" name="personal" value={personalElegido} />}
          <input
            type="date"
            name="desde"
            aria-label="Desde"
            defaultValue={fechaActiva === "rango" ? desde : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <span className="text-tinta-suave">–</span>
          <input
            type="date"
            name="hasta"
            aria-label="Hasta"
            defaultValue={fechaActiva === "rango" ? hasta : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <button type="submit" className="rounded-full bg-noche-panel px-3 py-1 text-xs font-medium text-white">
            Filtrar
          </button>
        </form>
      </div>

      {equipo.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Link
            href={href({ personal: null })}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              !personalElegido
                ? "border-tinta bg-tinta text-white"
                : "border-linea text-tinta-media hover:border-tinta/40"
            }`}
          >
            Todo el personal
          </Link>
          {equipo.map((p) => (
            <Link
              key={p.id}
              href={href({ personal: p.id })}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                personalElegido === p.id
                  ? "border-tinta bg-tinta text-white"
                  : "border-linea text-tinta-media hover:border-tinta/40"
              }`}
            >
              {nombreCompleto(p)}
            </Link>
          ))}
        </div>
      )}

      {/* ---------- resumen ---------- */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra valor={citas.length} rotulo="Citas confirmadas" />
        <Cifra valor={formatearGuarani(cobrado)} rotulo="Cobrado" />
        <Cifra valor={formatearGuarani(promedio)} rotulo="Promedio por cita" />
      </div>

      {/* ---------- la lista ---------- */}
      {citas.length === 0 ? (
        <Vacio
          titulo="Todavía no hay citas confirmadas en este período"
          detalle="Una cita aparece acá cuando la cobrás: abrila en el calendario, elegí cómo paga y tocá Cobrar."
          accion={
            <Link href="/admin/agenda" className={clasesBoton("principal", "md")}>
              Ir al calendario
            </Link>
          }
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha y hora</Th>
              <Th>Cliente</Th>
              <Th>Servicios</Th>
              <Th>Personal</Th>
              <Th>Pago</Th>
              <Th>Comprobante</Th>
              <Th>Estado</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">
                <span className="sr-only">Acción</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {citas.map((c) => {
              const { dia, minutos } = partesLocales(c.inicio);
              const venta = c.ventaPos;
              return (
                <Tr key={c.id}>
                  <Td>
                    <span className="block font-medium text-tinta">{diaLargo(dia)}</span>
                    <span className="cifra text-[0.78rem] text-tinta-suave">{horaDeMinutos(minutos)}</span>
                  </Td>
                  <Td className="font-medium text-tinta">{c.clienteNombre}</Td>
                  <Td>{c.serviciosTexto ?? "—"}</Td>
                  <Td>{nombreCompleto(c.personal)}</Td>
                  <Td>
                    {venta ? detallePagos(venta.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) }))) : "—"}
                  </Td>
                  <Td>
                    {venta?.comprobanteTipo === "factura" && venta.facturaNumero ? (
                      <>
                        <span className="cifra text-[0.8rem]">{venta.facturaNumero}</span>
                        {venta.facturaAnulada && (
                          <span className="block text-[0.7rem] font-medium uppercase text-peligro">Anulada</span>
                        )}
                      </>
                    ) : (
                      <>
                        Ticket
                        {venta && <span className="block text-[0.7rem] text-tinta-suave">{formatearNumero(venta.numero)}</span>}
                      </>
                    )}
                  </Td>
                  <Td>
                    <Pastilla color="exito" punto>
                      Confirmada
                    </Pastilla>
                  </Td>
                  <Td className="cifra text-right font-medium text-tinta">
                    {formatearGuarani(Number(venta?.total ?? 0))}
                  </Td>
                  <Td className="text-right">
                    <BotonEnlace
                      href={urlCita({ vista: "dia", fecha: dia, personal: null, ocultar: [] }, c.id)}
                      tono="navegar"
                      tam="sm"
                    >
                      Ver
                    </BotonEnlace>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <Td colSpan={7} className="text-right font-medium">
                Total cobrado
              </Td>
              <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(cobrado)}</Td>
              <Td>{null}</Td>
            </tr>
          </tfoot>
        </Tabla>
      )}

      {citas.length >= MAXIMO_CITAS && (
        <p className="mt-3 text-center text-[0.8rem] text-tinta-suave">
          Se muestran las últimas {MAXIMO_CITAS} citas del período: acotá las fechas para ver el resto.
        </p>
      )}
    </div>
  );
}
