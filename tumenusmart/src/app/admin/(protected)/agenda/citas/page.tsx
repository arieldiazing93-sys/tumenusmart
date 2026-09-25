import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera, Pastilla, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import {
  VISTAS_AGENDA,
  diaLargo,
  fechaVecina,
  horaDeMinutos,
  parsearFecha,
  parsearVista,
  partesLocales,
  tituloAgenda,
  urlCita,
  type VistaAgenda,
} from "@/lib/agenda";
import { nombreCompleto } from "@/lib/agenda-personal";
import { claveSumarDias, diasDeLaSemana } from "@/lib/calendario";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { detallePagos } from "@/lib/pago-venta";
import { limitesEnAsuncion } from "@/lib/rango-dias";
import { claveDiaAsuncion } from "@/lib/timezone";
import { AvatarPersonal } from "../AvatarPersonal";

export const dynamic = "force-dynamic";

/** Tope de filas de la lista: más que eso no se lee igual (se filtra por fecha). */
const MAXIMO_CITAS = 500;

/** Un botón de la barra: 36px de alto, igual que los del calendario. */
const BOTON =
  "inline-flex h-9 items-center justify-center rounded-lg border px-3 text-[0.85rem] font-semibold transition-colors duration-150";
const BOTON_NEUTRO = `${BOTON} border-linea bg-superficie text-tinta hover:border-brand hover:text-brand`;
/** Azul: navegar (mismo criterio que el resto del panel). */
const BOTON_HOY = `${BOTON} border-azul/35 bg-azul-luz px-4 text-azul-oscuro hover:border-azul hover:bg-azul hover:text-white`;

/** Un día "YYYY-MM-DD" que existe de verdad ("2026-02-30" no), o null. */
function diaValido(valor: string | undefined): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return claveSumarDias(valor, 0) === valor ? valor : null;
}

/** El primer y el último día del período que se está mirando: el día, la semana (lunes a domingo) o el mes. */
function limitesDelPeriodo(vista: VistaAgenda, fecha: string): { desde: string; hasta: string } {
  if (vista === "dia") return { desde: fecha, hasta: fecha };
  if (vista === "semana") {
    const dias = diasDeLaSemana(fecha);
    return { desde: dias[0], hasta: dias[6] };
  }
  return { desde: `${fecha.slice(0, 7)}-01`, hasta: claveSumarDias(fechaVecina("mes", fecha, 1), -1) };
}

/** "2026-09-12" → "12/09/2026". */
function fechaCorta(clave: string): string {
  return clave.split("-").reverse().join("/");
}

/**
 * Citas: las citas confirmadas, es decir, las que ya se cobraron en la caja. Una cita
 * aparece acá recién cuando se la cobra desde el detalle del calendario (y desaparece
 * si ese cobro se anula).
 *
 * El período se elige como en el calendario —Día, Semana o Mes, con Hoy y las flechas— o
 * con un rango desde–hasta. Cada persona del personal tiene su vista de trabajo: una
 * pastilla con lo que confirmó en el período (cuántas citas y cuánto cobró); al tocarla,
 * la lista pasa a mostrar solo el trabajo asignado a esa persona. Una cita queda
 * asignada a quien la atendió, y como una cita cobrada no se puede modificar, esa
 * asignación ya no cambia.
 *
 * Todo lo que se elige (período, personal) vive en la dirección de la página.
 */
export default async function CitasPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; fecha?: string; desde?: string; hasta?: string; personal?: string }>;
}) {
  await pantallaConPermiso("agenda.ver");
  const db = prismaDelLocal(await idLocalActual());

  const sp = await searchParams;
  const hoy = claveDiaAsuncion(new Date());
  const vista = parsearVista(sp.vista) ?? "mes";
  const fecha = parsearFecha(sp.fecha, hoy);

  // Un rango desde–hasta manda sobre Día/Semana/Mes mientras esté puesto.
  const desdeRango = diaValido(sp.desde);
  const hastaRango = diaValido(sp.hasta);
  const enRango = !!desdeRango && !!hastaRango && desdeRango <= hastaRango;
  const periodo = enRango
    ? { desde: desdeRango as string, hasta: hastaRango as string }
    : limitesDelPeriodo(vista, fecha);
  const titulo = enRango ? `${fechaCorta(periodo.desde)} – ${fechaCorta(periodo.hasta)}` : tituloAgenda(vista, fecha);

  const equipo = await db.miembroPersonal.findMany({
    orderBy: [{ activo: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, apellido: true, fotoUrl: true, activo: true },
  });
  // Un id que no es de este local simplemente no filtra a nadie: se ve a todo el personal.
  const personalElegido = equipo.find((p) => p.id === sp.personal) ?? null;

  /** La dirección de esta pantalla con esos cambios; lo que no se cambia se mantiene. */
  function href(cambios: { vista?: VistaAgenda; fecha?: string; personal?: string | null }) {
    const params = new URLSearchParams();
    // Cambiar de persona no saca el rango; cambiar de vista o de día sí (vuelve a Día/Semana/Mes).
    const conservarRango = enRango && cambios.vista === undefined && cambios.fecha === undefined;
    if (conservarRango) {
      params.set("desde", periodo.desde);
      params.set("hasta", periodo.hasta);
    } else {
      params.set("vista", cambios.vista ?? vista);
      params.set("fecha", cambios.fecha ?? fecha);
    }
    const p = cambios.personal === undefined ? (personalElegido?.id ?? null) : cambios.personal;
    if (p) params.set("personal", p);
    return `/admin/agenda/citas?${params.toString()}`;
  }

  // Todas las citas confirmadas del período, de todo el equipo: de acá salen las pastillas de cada persona;
  // la lista de abajo es lo mismo, pero solo de la persona elegida si hay una.
  const confirmadas = await db.cita.findMany({
    where: {
      inicio: limitesEnAsuncion(periodo),
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

  const resumen = [
    { rotulo: citas.length === 1 ? "Cita confirmada" : "Citas confirmadas", valor: String(citas.length) },
    { rotulo: "Cobrado", valor: formatearGuarani(cobrado) },
    { rotulo: "Promedio por cita", valor: formatearGuarani(promedio) },
  ];

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

      {/* ---------- el período: Hoy y flechas, Día/Semana/Mes, y un rango desde–hasta ---------- */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Link href={href({ fecha: hoy })} className={BOTON_HOY}>
            Hoy
          </Link>
          {!enRango && (
            <>
              <Link
                href={href({ fecha: fechaVecina(vista, fecha, -1) })}
                aria-label="Anterior"
                className={`${BOTON_NEUTRO} w-9 px-0`}
              >
                ‹
              </Link>
              <Link
                href={href({ fecha: fechaVecina(vista, fecha, 1) })}
                aria-label="Siguiente"
                className={`${BOTON_NEUTRO} w-9 px-0`}
              >
                ›
              </Link>
            </>
          )}
        </div>

        <div role="tablist" aria-label="Ver por" className="flex rounded-lg bg-papel-hundido p-1">
          {VISTAS_AGENDA.map((v) => {
            const elegida = !enRango && v.valor === vista;
            return (
              <Link
                key={v.valor}
                href={href({ vista: v.valor })}
                role="tab"
                aria-selected={elegida}
                className={`flex h-7 items-center justify-center rounded-md px-3.5 text-[0.85rem] font-semibold transition-colors duration-150 ${
                  elegida ? "bg-superficie text-azul-oscuro shadow-sm ring-1 ring-azul/25" : "text-tinta-media hover:text-tinta"
                }`}
              >
                {v.etiqueta}
              </Link>
            );
          })}
        </div>

        <h2 className="min-w-[8rem] flex-1 truncate px-1 text-[1rem] font-semibold tracking-titular text-tinta">
          {titulo}
        </h2>

        <form
          method="get"
          action="/admin/agenda/citas"
          className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 ${
            enRango ? "border-azul/40 bg-azul-luz/40" : "border-linea"
          }`}
        >
          {personalElegido && <input type="hidden" name="personal" value={personalElegido.id} />}
          <input
            type="date"
            name="desde"
            aria-label="Desde"
            defaultValue={enRango ? periodo.desde : ""}
            required
            className="h-7 rounded-md border border-linea px-1.5 text-xs"
          />
          <span className="text-tinta-suave">–</span>
          <input
            type="date"
            name="hasta"
            aria-label="Hasta"
            defaultValue={enRango ? periodo.hasta : ""}
            required
            className="h-7 rounded-md border border-linea px-1.5 text-xs"
          />
          <button type="submit" className="h-7 rounded-md bg-noche-panel px-3 text-xs font-medium text-white">
            Filtrar
          </button>
        </form>
      </div>

      {/* ---------- la vista de trabajo de cada persona y el resumen, en una sola fila ---------- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {equipo.length > 1 && (
          <ul aria-label="Trabajo por persona" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            <li className="flex-none">
              <Link
                href={href({ personal: null })}
                aria-current={personalElegido ? undefined : "true"}
                className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[0.8rem] transition-colors ${
                  personalElegido ? "border-linea hover:border-azul/50" : "border-azul bg-azul-luz/40 ring-1 ring-azul/20"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-papel-hundido text-tinta-media"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width={15}
                    height={15}
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
                <span className="font-semibold text-tinta">Todo el equipo</span>
                <span className="cifra text-[0.72rem] text-tinta-suave">
                  {totalEquipo.cantidad} · {formatearGuarani(totalEquipo.cobrado)}
                </span>
              </Link>
            </li>
            {tarjetas.map((p, i) => {
              const trabajo = trabajoPorPersona.get(p.id) ?? { cantidad: 0, cobrado: 0 };
              const elegida = personalElegido?.id === p.id;
              return (
                <li key={p.id} className="flex-none">
                  <Link
                    href={href({ personal: p.id })}
                    aria-current={elegida ? "true" : undefined}
                    className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[0.8rem] transition-colors ${
                      elegida ? "border-azul bg-azul-luz/40 ring-1 ring-azul/20" : "border-linea hover:border-azul/50"
                    }`}
                  >
                    <AvatarPersonal
                      nombre={nombreCompleto(p)}
                      fotoUrl={p.fotoUrl}
                      indice={i}
                      className="h-7 w-7 text-[0.68rem]"
                    />
                    <span className="max-w-[9rem] truncate font-semibold text-tinta">{nombreCompleto(p)}</span>
                    <span className="cifra text-[0.72rem] text-tinta-suave">
                      {trabajo.cantidad} · {formatearGuarani(trabajo.cobrado)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <dl className="ml-auto flex flex-none items-stretch divide-x divide-linea overflow-hidden rounded-lg border border-linea bg-superficie">
          {resumen.map((r) => (
            <div key={r.rotulo} className="px-3 py-1">
              <dt className="text-[0.66rem] font-medium text-tinta-suave">{r.rotulo}</dt>
              <dd className="cifra text-[0.9rem] font-semibold leading-tight text-tinta">{r.valor}</dd>
            </div>
          ))}
        </dl>
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
