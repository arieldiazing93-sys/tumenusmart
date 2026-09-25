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
import { AvatarPersonal } from "../AvatarPersonal";

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

/** La tarjeta de una persona (o de todo el equipo) de arriba: blanca, y con borde azul la que está elegida. */
const TARJETA =
  "flex min-w-0 items-center gap-3 rounded-xl border bg-superficie p-3 transition-colors hover:border-azul/50";

/**
 * Citas: las citas confirmadas, es decir, las que ya se cobraron en la caja. Una cita
 * aparece acá recién cuando se la cobra desde el detalle del calendario (y desaparece
 * si ese cobro se anula).
 *
 * Cada persona del personal tiene su vista de trabajo: una tarjeta con lo que confirmó
 * en el período (cuántas citas y cuánto cobró). Al tocarla, la lista pasa a mostrar solo
 * el trabajo asignado a esa persona. Una cita queda asignada a quien la atendió, y como
 * una cita cobrada no se puede modificar, esa asignación ya no cambia.
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
    orderBy: [{ activo: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, apellido: true, fotoUrl: true, activo: true },
  });
  // Un id que no es de este local simplemente no filtra a nadie: se ve a todo el personal.
  const personalElegido = equipo.find((p) => p.id === personal) ?? null;

  function href(cambios: { fecha?: FiltroFecha; personal?: string | null }) {
    const params = new URLSearchParams();
    const f = cambios.fecha ?? fechaActiva;
    params.set("fecha", f);
    if (f === "rango" && desde) params.set("desde", desde);
    if (f === "rango" && hasta) params.set("hasta", hasta);
    const p = cambios.personal === undefined ? (personalElegido?.id ?? null) : cambios.personal;
    if (p) params.set("personal", p);
    return `/admin/agenda/citas?${params.toString()}`;
  }

  // Todas las citas confirmadas del período, de todo el equipo: de acá salen las tarjetas de cada persona;
  // la lista de abajo es lo mismo, pero solo de la persona elegida si hay una.
  const confirmadas = await db.cita.findMany({
    where: {
      inicio: { gte: rango.gte, lt: rango.lt },
      // Confirmada = cobrada en caja (y ese cobro no se anuló).
      ventaPos: { is: { cancelada: false } },
    },
    orderBy: [{ inicio: "desc" }, { id: "asc" }],
    take: MAXIMO_CITAS,
    select: {
      id: true,
      personalId: true,
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

  const trabajoPorPersona = new Map<string, { cantidad: number; cobrado: number }>();
  for (const c of confirmadas) {
    const previo = trabajoPorPersona.get(c.personalId) ?? { cantidad: 0, cobrado: 0 };
    trabajoPorPersona.set(c.personalId, {
      cantidad: previo.cantidad + 1,
      cobrado: previo.cobrado + Number(c.ventaPos?.total ?? 0),
    });
  }
  const totalEquipo = [...trabajoPorPersona.values()].reduce(
    (t, p) => ({ cantidad: t.cantidad + p.cantidad, cobrado: t.cobrado + p.cobrado }),
    { cantidad: 0, cobrado: 0 }
  );

  const citas = personalElegido ? confirmadas.filter((c) => c.personalId === personalElegido.id) : confirmadas;
  const cobrado = citas.reduce((suma, c) => suma + Number(c.ventaPos?.total ?? 0), 0);
  const promedio = citas.length > 0 ? cobrado / citas.length : 0;

  // Se muestran los activos y quien esté inactivo pero tenga trabajo en el período.
  const tarjetas = equipo.filter((p) => p.activo || trabajoPorPersona.has(p.id));
  // Con el trabajo de una sola persona a la vista, su nombre en cada fila sobra.
  const columnas = personalElegido ? 8 : 9;

  return (
    <div>
      <Cabecera
        titulo={personalElegido ? `Trabajo de ${nombreCompleto(personalElegido)}` : "Citas"}
        bajada={
          personalElegido
            ? "Las citas que ya cobró y quedaron confirmadas a su nombre."
            : "Las citas confirmadas: las que ya se cobraron en la caja. Para cobrar una, tocala en el calendario."
        }
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
          {personalElegido && <input type="hidden" name="personal" value={personalElegido.id} />}
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

      {/* ---------- la vista de trabajo de cada persona ---------- */}
      {equipo.length > 1 && (
        <ul aria-label="Trabajo por persona" className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <li>
            <Link
              href={href({ personal: null })}
              aria-current={personalElegido ? undefined : "true"}
              className={`${TARJETA} ${personalElegido ? "border-linea" : "border-azul bg-azul-luz/40 ring-1 ring-azul/20"}`}
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-papel-hundido text-tinta-media"
              >
                <svg
                  viewBox="0 0 24 24"
                  width={18}
                  height={18}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.9rem] font-semibold text-tinta">Todo el equipo</span>
                <span className="cifra block truncate text-[0.76rem] text-tinta-media">
                  {totalEquipo.cantidad} {totalEquipo.cantidad === 1 ? "cita" : "citas"} · {formatearGuarani(totalEquipo.cobrado)}
                </span>
              </span>
            </Link>
          </li>
          {tarjetas.map((p, i) => {
            const trabajo = trabajoPorPersona.get(p.id) ?? { cantidad: 0, cobrado: 0 };
            const elegida = personalElegido?.id === p.id;
            return (
              <li key={p.id}>
                <Link
                  href={href({ personal: p.id })}
                  aria-current={elegida ? "true" : undefined}
                  className={`${TARJETA} ${elegida ? "border-azul bg-azul-luz/40 ring-1 ring-azul/20" : "border-linea"}`}
                >
                  <AvatarPersonal nombre={nombreCompleto(p)} fotoUrl={p.fotoUrl} indice={i} className="h-10 w-10 text-[0.8rem]" />
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9rem] font-semibold text-tinta">{nombreCompleto(p)}</span>
                    <span className="cifra block truncate text-[0.76rem] text-tinta-media">
                      {trabajo.cantidad} {trabajo.cantidad === 1 ? "cita" : "citas"} · {formatearGuarani(trabajo.cobrado)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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
          titulo={
            personalElegido
              ? `${nombreCompleto(personalElegido)} no tiene citas confirmadas en este período`
              : "Todavía no hay citas confirmadas en este período"
          }
          detalle="Una cita aparece acá cuando la cobrás: abrila en el calendario, elegí cómo paga y tocá Cobrar. Queda asignada a quien la atendió."
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
              {!personalElegido && <Th>Personal</Th>}
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
                  {!personalElegido && <Td>{nombreCompleto(c.personal)}</Td>}
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
              <Td colSpan={columnas - 2} className="text-right font-medium">
                Total cobrado
              </Td>
              <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(cobrado)}</Td>
              <Td>{null}</Td>
            </tr>
          </tfoot>
        </Tabla>
      )}

      {confirmadas.length >= MAXIMO_CITAS && (
        <p className="mt-3 text-center text-[0.8rem] text-tinta-suave">
          Se muestran las últimas {MAXIMO_CITAS} citas del período: acotá las fechas para ver el resto.
        </p>
      )}
    </div>
  );
}
