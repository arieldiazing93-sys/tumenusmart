import type { Prisma } from "@prisma/client";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Aviso, BotonEnlace, Cabecera, Tabla, Td, Th, Tr, Vacio } from "@/components/ui";
import { diaLargo, horaDeMinutos, partesLocales } from "@/lib/agenda";
import { calcularComision, nombreCompleto } from "@/lib/agenda-personal";
import { claveSumarDias } from "@/lib/calendario";
import { formatearGuarani } from "@/lib/format";
import { detallePagos } from "@/lib/pago-venta";
import { diaEnTexto, limitesEnAsuncion } from "@/lib/rango-dias";
import { claveDiaAsuncion } from "@/lib/timezone";
import { AvatarPersonal } from "../../AvatarPersonal";
import { FiltroReporte, type AtajoReporte } from "./FiltroReporte";

export const dynamic = "force-dynamic";

/** Tope de filas del detalle: más que eso no se lee igual (los totales de arriba cuentan todo el período). */
const MAXIMO_FILAS = 500;
/** El período más largo que se puede pedir de una vez. */
const MAXIMO_DIAS = 366;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Un día "YYYY-MM-DD" que existe de verdad ("2026-02-30" no), o null. */
function diaValido(valor: string | undefined): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return claveSumarDias(valor, 0) === valor ? valor : null;
}

function textoPorcentaje(valor: number): string {
  return String(valor).replace(".", ",");
}

type Acumulado = { cantidad: number; cobrado: number; comision: number };

/**
 * El reporte de movimiento del personal: los trabajos que terminó cada persona (citas cobradas,
 * tanto las que tenían reserva como las cobradas en el mostrador a alguien sin reserva) y lo que le
 * toca de comisión, en el período que se elija. Se elige a quién —una persona o todo el personal—
 * y las fechas, y recién al tocar "Ver reporte" se arma. Es del dueño (ve comisiones).
 *
 * Cuenta por el día del trabajo, igual que Citas y la vista de cada persona. Cada trabajo usa el
 * porcentaje que tenía quien lo hizo AL COBRARLO; los cobrados antes de existir la comisión usan el
 * que tiene ahora.
 */
export default async function ReportePersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ personal?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());
  const sp = await searchParams;

  const hoy = claveDiaAsuncion(new Date());
  const primerDiaMes = `${hoy.slice(0, 7)}-01`;
  const ultimoDiaMesAnterior = claveSumarDias(primerDiaMes, -1);
  const atajos: AtajoReporte[] = [
    { etiqueta: "Hoy", desde: hoy, hasta: hoy },
    { etiqueta: "Últimos 7 días", desde: claveSumarDias(hoy, -6), hasta: hoy },
    { etiqueta: "Este mes", desde: primerDiaMes, hasta: hoy },
    { etiqueta: "Mes anterior", desde: `${ultimoDiaMesAnterior.slice(0, 7)}-01`, hasta: ultimoDiaMesAnterior },
  ];

  const equipo = await db.miembroPersonal.findMany({
    orderBy: [{ activo: "desc" }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, apellido: true, fotoUrl: true, activo: true, comisionPorcentaje: true },
  });
  const personas = equipo.map((p, indice) => ({
    id: p.id,
    nombre: nombreCompleto(p),
    fotoUrl: p.fotoUrl,
    activo: p.activo,
    indice,
    comision: p.comisionPorcentaje == null ? null : Number(p.comisionPorcentaje),
  }));
  const personaPorId = new Map(personas.map((p) => [p.id, p] as const));

  // Un id que no es de este local simplemente no filtra a nadie: se ve a todo el personal.
  const personalElegido = personaPorId.get(sp.personal ?? "") ?? null;

  // El reporte solo se arma cuando llegan las dos fechas (o sea, después de tocar "Ver reporte").
  let desde = diaValido(sp.desde);
  let hasta = diaValido(sp.hasta);
  if (desde !== null && hasta !== null && desde > hasta) [desde, hasta] = [hasta, desde];
  const periodo = desde !== null && hasta !== null ? { desde, hasta } : null;
  const dias = periodo ? Math.round((Date.parse(periodo.hasta) - Date.parse(periodo.desde)) / DIA_MS) + 1 : 0;
  const demasiadoLargo = dias > MAXIMO_DIAS;

  // Un trabajo terminado = una cita cobrada cuyo cobro no se anuló (con reserva o de mostrador).
  const donde: Prisma.CitaWhereInput | null =
    periodo && !demasiadoLargo
      ? {
          ...(personalElegido ? { personalId: personalElegido.id } : {}),
          inicio: limitesEnAsuncion(periodo),
          ventaPos: { is: { cancelada: false } },
        }
      : null;

  const [todos, detalle] = donde
    ? await Promise.all([
        // Todo el período, con lo mínimo: de acá salen los totales.
        db.cita.findMany({
          where: donde,
          select: { personalId: true, comisionPorcentaje: true, ventaPos: { select: { total: true } } },
        }),
        // Lo más reciente, con el detalle de cada trabajo.
        db.cita.findMany({
          where: donde,
          orderBy: [{ inicio: "desc" }, { id: "asc" }],
          take: MAXIMO_FILAS,
          select: {
            id: true,
            personalId: true,
            clienteNombre: true,
            inicio: true,
            serviciosTexto: true,
            origen: true,
            comisionPorcentaje: true,
            ventaPos: { select: { total: true, pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } } } },
          },
        }),
      ])
    : [[], []];

  /** El porcentaje de un trabajo: el que tenía al cobrarlo o, si no tenía, el que tiene la persona ahora. */
  function porcentajeDe(personalId: string, guardado: unknown): number | null {
    if (guardado != null) return Number(guardado);
    return personaPorId.get(personalId)?.comision ?? null;
  }

  const porPersona = new Map<string, Acumulado>();
  const general: Acumulado = { cantidad: 0, cobrado: 0, comision: 0 };
  const sinComision = new Set<string>();
  for (const c of todos) {
    const total = Number(c.ventaPos?.total ?? 0);
    const porcentaje = porcentajeDe(c.personalId, c.comisionPorcentaje);
    if (porcentaje === null) sinComision.add(c.personalId);
    const comision = calcularComision(total, porcentaje);
    const previo = porPersona.get(c.personalId) ?? { cantidad: 0, cobrado: 0, comision: 0 };
    porPersona.set(c.personalId, {
      cantidad: previo.cantidad + 1,
      cobrado: previo.cobrado + total,
      comision: previo.comision + comision,
    });
    general.cantidad += 1;
    general.cobrado += total;
    general.comision += comision;
  }
  const promedio = general.cantidad > 0 ? general.cobrado / general.cantidad : 0;
  const hayMas = general.cantidad > detalle.length;
  const nombresSinComision = personas.filter((p) => sinComision.has(p.id)).map((p) => p.nombre);

  const filas = detalle.map((c) => {
    const { dia, minutos } = partesLocales(c.inicio);
    const total = Number(c.ventaPos?.total ?? 0);
    const porcentaje = porcentajeDe(c.personalId, c.comisionPorcentaje);
    return {
      id: c.id,
      personal: personaPorId.get(c.personalId)?.nombre ?? "—",
      dia,
      hora: horaDeMinutos(minutos),
      cliente: c.clienteNombre,
      servicios: c.serviciosTexto,
      sinReserva: c.origen === "mostrador",
      pago: c.ventaPos ? detallePagos(c.ventaPos.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) }))) : "—",
      total,
      porcentaje,
      comision: calcularComision(total, porcentaje),
    };
  });
  const columnas = personalElegido ? 7 : 8;

  const resumen = [
    { rotulo: general.cantidad === 1 ? "Trabajo" : "Trabajos", valor: String(general.cantidad), tono: "neutro" },
    { rotulo: "Cobrado", valor: formatearGuarani(general.cobrado), tono: "neutro" },
    { rotulo: "Promedio por trabajo", valor: formatearGuarani(promedio), tono: "neutro" },
    { rotulo: "Comisión", valor: formatearGuarani(general.comision), tono: "exito" },
  ];

  const urlDe = (personalId: string) =>
    periodo
      ? `/admin/agenda/personal/reporte?personal=${personalId}&desde=${periodo.desde}&hasta=${periodo.hasta}`
      : "/admin/agenda/personal/reporte";

  return (
    <div>
      <Cabecera
        titulo="Reporte de personal"
        bajada="El movimiento de cada persona: los trabajos que terminó (con reserva o cobrados en el mostrador) y lo que le toca de comisión. Elegí a quién y el período, y tocá Ver reporte."
        acciones={
          <BotonEnlace href="/admin/agenda/personal" tono="navegar" tam="md">
            Volver a Personal
          </BotonEnlace>
        }
      />

      <FiltroReporte
        personal={personas.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }))}
        valores={{
          personal: personalElegido?.id ?? "todos",
          desde: periodo?.desde ?? primerDiaMes,
          hasta: periodo?.hasta ?? hoy,
        }}
        atajos={atajos}
      />

      {!periodo ? (
        <Vacio
          titulo="Elegí a quién y el período"
          detalle="Después tocá Ver reporte: vas a ver los trabajos que terminó y lo que le toca de comisión."
        />
      ) : demasiadoLargo ? (
        <Aviso titulo="El período es muy largo">
          Elegí hasta {MAXIMO_DIAS} días por vez (un año) para armar el reporte.
        </Aviso>
      ) : (
        <>
          <h2 className="mb-2.5 text-[1rem] font-semibold tracking-titular text-tinta">
            {personalElegido ? personalElegido.nombre : "Todo el personal"}
            <span className="font-normal text-tinta-media">
              {" "}
              · {periodo.desde === periodo.hasta ? diaEnTexto(periodo.desde) : `${diaEnTexto(periodo.desde)} – ${diaEnTexto(periodo.hasta)}`}
            </span>
          </h2>

          <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {resumen.map((r) => (
              <div
                key={r.rotulo}
                className={`rounded-lg px-3 py-2.5 ${r.tono === "exito" ? "bg-exito-luz" : "bg-papel-suave"}`}
              >
                <dt className={`text-[0.7rem] font-medium ${r.tono === "exito" ? "text-exito" : "text-tinta-suave"}`}>
                  {r.rotulo}
                </dt>
                <dd
                  className={`cifra mt-0.5 truncate text-[1.05rem] font-semibold ${r.tono === "exito" ? "text-exito" : "text-tinta"}`}
                >
                  {r.valor}
                </dd>
              </div>
            ))}
          </dl>

          {nombresSinComision.length > 0 && (
            <div className="mb-3">
              <Aviso>
                {nombresSinComision.join(", ")} {nombresSinComision.length === 1 ? "todavía no tiene" : "todavía no tienen"} una
                comisión cargada, así que no se le calcula. Poné el porcentaje en Personal → Editar.
              </Aviso>
            </div>
          )}

          {general.cantidad === 0 ? (
            <Vacio
              titulo={
                personalElegido
                  ? `${personalElegido.nombre} no tiene trabajos terminados en este período`
                  : "No hay trabajos terminados en este período"
              }
              detalle="Un trabajo cuenta cuando se cobra: una cita cobrada en el calendario, o una venta del mostrador asignada a esa persona."
            />
          ) : (
            <>
              {/* ---------- por persona (solo cuando se mira a todo el personal) ---------- */}
              {!personalElegido && (
                <div className="mb-4">
                  <Tabla>
                    <thead>
                      <tr>
                        <Th>Personal</Th>
                        <Th className="text-right">Trabajos</Th>
                        <Th className="text-right">Cobrado</Th>
                        <Th className="text-right">Comisión</Th>
                        <Th className="text-right">
                          <span className="sr-only">Acción</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {personas
                        .filter((p) => p.activo || porPersona.has(p.id))
                        .map((p) => {
                          const suma = porPersona.get(p.id) ?? { cantidad: 0, cobrado: 0, comision: 0 };
                          return (
                            <Tr key={p.id}>
                              <Td>
                                <span className="flex items-center gap-2.5">
                                  <AvatarPersonal nombre={p.nombre} fotoUrl={p.fotoUrl} indice={p.indice} />
                                  <span className="min-w-0">
                                    <span className="block truncate font-medium text-tinta">{p.nombre}</span>
                                    <span className="block text-[0.72rem] text-tinta-suave">
                                      {p.comision != null ? `Comisión ${textoPorcentaje(p.comision)}%` : "Sin comisión"}
                                    </span>
                                  </span>
                                </span>
                              </Td>
                              <Td className="cifra text-right">{suma.cantidad}</Td>
                              <Td className="cifra text-right">{formatearGuarani(suma.cobrado)}</Td>
                              <Td className="cifra text-right font-medium text-exito">{formatearGuarani(suma.comision)}</Td>
                              <Td className="text-right">
                                {suma.cantidad > 0 && (
                                  <BotonEnlace href={urlDe(p.id)} tono="navegar" tam="sm">
                                    Ver su trabajo
                                  </BotonEnlace>
                                )}
                              </Td>
                            </Tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <Td className="text-right font-medium">Total</Td>
                        <Td className="cifra text-right font-semibold text-tinta">{general.cantidad}</Td>
                        <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(general.cobrado)}</Td>
                        <Td className="cifra text-right font-semibold text-exito">{formatearGuarani(general.comision)}</Td>
                        <Td>{null}</Td>
                      </tr>
                    </tfoot>
                  </Tabla>
                </div>
              )}

              {/* ---------- el detalle de cada trabajo ---------- */}
              <p className="mb-1.5 text-[0.82rem] font-semibold text-tinta">Detalle de trabajos</p>
              <Tabla>
                <thead>
                  <tr>
                    <Th>Fecha y hora</Th>
                    {!personalElegido && <Th>Personal</Th>}
                    <Th>Cliente</Th>
                    <Th>Servicios</Th>
                    <Th>Pago</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">%</Th>
                    <Th className="text-right">Comisión</Th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <Tr key={f.id}>
                      <Td>
                        <span className="block font-medium text-tinta">{diaLargo(f.dia)}</span>
                        <span className="cifra text-[0.78rem] text-tinta-suave">{f.hora}</span>
                      </Td>
                      {!personalElegido && <Td>{f.personal}</Td>}
                      <Td className="font-medium text-tinta">
                        {f.cliente}
                        {f.sinReserva && <span className="block text-[0.7rem] font-normal text-tinta-suave">Sin reserva</span>}
                      </Td>
                      <Td>{f.servicios ?? "—"}</Td>
                      <Td>{f.pago}</Td>
                      <Td className="cifra text-right font-medium text-tinta">{formatearGuarani(f.total)}</Td>
                      <Td className="cifra text-right">{f.porcentaje != null ? `${textoPorcentaje(f.porcentaje)}%` : "—"}</Td>
                      <Td className="cifra text-right font-medium text-exito">
                        {f.porcentaje != null ? formatearGuarani(f.comision) : "—"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
                {!hayMas && (
                  <tfoot>
                    <tr>
                      <Td colSpan={columnas - 3} className="text-right font-medium">
                        Total
                      </Td>
                      <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(general.cobrado)}</Td>
                      <Td>{null}</Td>
                      <Td className="cifra text-right font-semibold text-exito">{formatearGuarani(general.comision)}</Td>
                    </tr>
                  </tfoot>
                )}
              </Tabla>

              {hayMas && (
                <p className="mt-3 text-center text-[0.8rem] text-tinta-suave">
                  Se muestran los últimos {MAXIMO_FILAS} trabajos del período. Los totales de arriba cuentan todos: acotá las
                  fechas para ver el detalle completo.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
