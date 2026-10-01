import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvatarPersonal } from "@/app/admin/(protected)/agenda/AvatarPersonal";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BuscarClienteFoto } from "./BuscarClienteFoto";
import {
  VISTAS_AGENDA,
  diaLargo,
  fechaVecina,
  horaDeMinutos,
  limitesDelPeriodo,
  parsearFecha,
  parsearVista,
  partesLocales,
  tituloAgenda,
  type VistaAgenda,
} from "@/lib/agenda";
import { calcularComision, montoDelTrabajo } from "@/lib/agenda-personal";
import { claveSumarDias } from "@/lib/calendario";
import { formatearGuarani } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { limitesEnAsuncion } from "@/lib/rango-dias";
import { claveDiaAsuncion, fechaAsuncionDesdeTexto } from "@/lib/timezone";

/** Los botones chicos de "Hoy" y las flechas, de un vistazo (mismo criterio que Citas del panel). */
const BOTON =
  "inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-[0.78rem] font-semibold transition-colors duration-150";
const BOTON_NEUTRO = `${BOTON} border-linea bg-superficie text-tinta`;
const BOTON_HOY = `${BOTON} border-azul/35 bg-azul-luz px-3 text-azul-oscuro`;

export const dynamic = "force-dynamic";

/** Cuántos días adelante ve (contando hoy): la semana. */
const DIAS_QUE_VE = 7;

// Es un enlace privado de cada persona: que no aparezca en los buscadores.
export const metadata: Metadata = {
  title: "Mi trabajo",
  robots: { index: false, follow: false },
};

/**
 * La vista de trabajo de una persona del personal (una barbera, un colorista…): lo que tiene que hacer HOY y en
 * los próximos días de la semana, para que sepa qué le toca. Son las citas que ya se cobraron a su nombre, o sea,
 * las que quedaron confirmadas: si un cliente pagó su turno para dentro de dos o tres días, aparece en ese día.
 * Es el mismo criterio que la pantalla del repartidor (/repartidor/[id]): no hay usuario ni contraseña; el enlace
 * lleva el id de la persona (imposible de adivinar) y el dueño se lo pasa por WhatsApp desde Personal.
 *
 * Solo lee, y todo queda atado al local de ESA persona: aunque el enlace circule, nunca muestra citas de otro
 * negocio ni de otra persona. Se actualiza sola cada medio minuto, así una cita cobrada en la caja aparece acá sin
 * recargar. Lo de días pasados no se muestra: es una vista de lo que hay que hacer, no un historial.
 *
 * Más abajo, "Tus números" deja ver cómo le fue en un período (Día, Semana o Mes, con Hoy y flechas, igual que el
 * calendario del panel): cuántos clientes atendió, cuánto cobró, cuánto le tocó de comisión y cuántas citas se le
 * cancelaron. Ese período sí mira para atrás (es un historial), a diferencia de "Hoy"/"Próximos días" de arriba.
 */
export default async function TrabajoDelPersonalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string; fecha?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const miembro = await prisma.miembroPersonal.findUnique({
    where: { id },
    select: {
      id: true,
      storeId: true,
      nombre: true,
      apellido: true,
      profesion: true,
      fotoUrl: true,
      activo: true,
      comisionPorcentaje: true,
      comisionProductoPorcentaje: true,
    },
  });
  // Quien ya no trabaja en el local (inactivo) deja de ver lo suyo con el mismo enlace.
  if (!miembro || !miembro.activo) notFound();
  const storeId = miembro.storeId;
  const comisionActual = miembro.comisionPorcentaje == null ? null : Number(miembro.comisionPorcentaje);
  const comisionProductoActual =
    miembro.comisionProductoPorcentaje == null ? null : Number(miembro.comisionProductoPorcentaje);

  const hoy = claveDiaAsuncion(new Date());
  const manana = claveSumarDias(hoy, 1);
  const inicioHoy = fechaAsuncionDesdeTexto(hoy) as Date;
  const finSemana = fechaAsuncionDesdeTexto(claveSumarDias(hoy, DIAS_QUE_VE)) as Date;

  const vista = parsearVista(sp.vista) ?? "dia";
  const fechaPedida = parsearFecha(sp.fecha, hoy);
  const periodo = limitesDelPeriodo(vista, fechaPedida);
  const rangoPeriodo = limitesEnAsuncion(periodo);

  const [store, confirmadas, trabajosPeriodo, ventasProductoPeriodo, canceladasPeriodo] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { nombre: true } }),
    prisma.cita.findMany({
      where: {
        storeId,
        personalId: id,
        // Confirmada = cobrada en la caja (y ese cobro no se anuló).
        ventaPos: { is: { cancelada: false } },
        // Desde el comienzo de hoy hasta el final del séptimo día.
        inicio: { gte: inicioHoy, lt: finSemana },
      },
      orderBy: [{ inicio: "asc" }, { id: "asc" }],
      take: 400,
      select: {
        id: true,
        clienteNombre: true,
        inicio: true,
        serviciosTexto: true,
        // Lo que valen sus servicios (sin los productos que se haya llevado el cliente en la misma cuenta).
        precio: true,
        ventaPos: { select: { total: true } },
      },
    }),
    // "Tus números": los trabajos ya cobrados del período elegido (Día/Semana/Mes), para el total y la comisión.
    prisma.cita.findMany({
      where: {
        storeId,
        personalId: id,
        ventaPos: { is: { cancelada: false } },
        inicio: rangoPeriodo,
      },
      select: { comisionPorcentaje: true, precio: true, ventaPos: { select: { total: true } } },
    }),
    // La comisión de producto es otra fuente (VentaPos, no Cita) y cuenta por el día de la venta, no el de
    // un turno — mismo criterio que el reporte de personal del panel (ver src/lib/reporte-personal.ts).
    prisma.ventaPos.findMany({
      where: { storeId, personalId: id, cancelada: false, creadoEn: rangoPeriodo },
      select: { comisionProductoPorcentaje: true, comisionProductoBase: true },
    }),
    // Las citas que se le cancelaron en ese mismo período (sin importar si ya se habían cobrado por adelantado).
    prisma.cita.count({
      where: { storeId, personalId: id, estado: "cancelada", inicio: rangoPeriodo },
    }),
  ]);

  let cobradoPeriodo = 0;
  let comisionPeriodo = 0;
  for (const c of trabajosPeriodo) {
    const total = montoDelTrabajo(c.precio, c.ventaPos?.total);
    const porcentaje = c.comisionPorcentaje == null ? comisionActual : Number(c.comisionPorcentaje);
    cobradoPeriodo += total;
    comisionPeriodo += calcularComision(total, porcentaje);
  }

  let comisionProductoPeriodo = 0;
  for (const v of ventasProductoPeriodo) {
    const base = v.comisionProductoBase == null ? 0 : Number(v.comisionProductoBase);
    const porcentaje = v.comisionProductoPorcentaje == null ? comisionProductoActual : Number(v.comisionProductoPorcentaje);
    comisionProductoPeriodo += calcularComision(base, porcentaje);
  }

  const cifrasPeriodo = [
    { rotulo: "Clientes atendidos", valor: String(trabajosPeriodo.length), tono: "neutro" as const },
    { rotulo: "Cobrado", valor: formatearGuarani(cobradoPeriodo), tono: "neutro" as const },
    { rotulo: "Comisión servicio", valor: formatearGuarani(comisionPeriodo), tono: "exito" as const },
    { rotulo: "Comisión producto", valor: formatearGuarani(comisionProductoPeriodo), tono: "exito" as const },
    {
      rotulo: "Canceladas",
      valor: String(canceladasPeriodo),
      // Sin cancelaciones no hay nada que avisar: la tarjeta queda neutra, no en rojo.
      tono: canceladasPeriodo > 0 ? ("peligro" as const) : ("neutro" as const),
    },
  ];
  // El fondo de cada tarjeta dice de qué se trata de un vistazo: ni tan fuerte como un
  // cartel de aviso, ni tan débil que no se note al lado de las otras tres.
  const TONOS_TARJETA = {
    neutro: { tarjeta: "border-linea bg-papel-hundido", valor: "text-tinta", rotulo: "text-tinta-suave" },
    exito: { tarjeta: "border-exito/40 bg-exito-tinte", valor: "text-exito", rotulo: "text-exito/75" },
    peligro: { tarjeta: "border-peligro/40 bg-peligro-tinte", valor: "text-peligro", rotulo: "text-peligro/75" },
  } as const;

  /** La dirección de esta misma página con esos cambios; lo que no se cambia se mantiene. */
  function hrefPeriodo(cambios: { vista?: VistaAgenda; fecha?: string }) {
    const params = new URLSearchParams();
    params.set("vista", cambios.vista ?? vista);
    params.set("fecha", cambios.fecha ?? fechaPedida);
    return `/personal/${id}?${params.toString()}`;
  }

  const trabajos = confirmadas.map((c) => {
    const { dia, minutos } = partesLocales(c.inicio);
    return {
      id: c.id,
      dia,
      hora: horaDeMinutos(minutos),
      cliente: c.clienteNombre,
      servicios: c.serviciosTexto,
      total: montoDelTrabajo(c.precio, c.ventaPos?.total),
    };
  });

  const deHoy = trabajos.filter((t) => t.dia === hoy);
  // Los días que siguen, en orden, cada uno con sus trabajos (ya vienen ordenados por hora).
  const proximos = new Map<string, typeof trabajos>();
  for (const t of trabajos) {
    if (t.dia === hoy) continue;
    proximos.set(t.dia, [...(proximos.get(t.dia) ?? []), t]);
  }
  const cantidadProximos = trabajos.length - deHoy.length;
  const deManana = proximos.get(manana)?.length ?? 0;

  const nombreNegocio = store?.nombre ?? "";
  const cifras = [
    { rotulo: "Hoy", valor: deHoy.length },
    { rotulo: "Mañana", valor: deManana },
    { rotulo: "Esta semana", valor: trabajos.length },
  ];

  const plural = (n: number) => (n === 1 ? "trabajo confirmado" : "trabajos confirmados");
  const mensaje =
    deHoy.length > 0
      ? `Hoy tenés ${deHoy.length} ${plural(deHoy.length)}.${
          cantidadProximos > 0 ? ` Y ${cantidadProximos} más en los próximos días.` : ""
        }`
      : cantidadProximos > 0
        ? `Hoy no tenés trabajos confirmados. En los próximos días tenés ${cantidadProximos}.`
        : "Todavía no tenés trabajos confirmados. Cuando se cobre una cita tuya, aparece acá.";

  return (
    <main className="mx-auto min-h-screen max-w-md bg-superficie px-4 py-6">
      <AutoRefresh segundos={30} />

      <header className="flex items-center gap-3">
        <AvatarPersonal
          nombre={`${miembro.nombre} ${miembro.apellido ?? ""}`.trim()}
          fotoUrl={miembro.fotoUrl}
          className="h-14 w-14 text-[1.1rem]"
        />
        <div className="min-w-0">
          <h1 className="truncate text-[1.25rem] font-semibold tracking-titular text-tinta">Hola, {miembro.nombre} 👋</h1>
          <p className="truncate text-[0.85rem] text-tinta-media">
            {[miembro.profesion, nombreNegocio].filter(Boolean).join(" · ") || "Tu trabajo confirmado"}
          </p>
        </div>
      </header>

      <p className="mt-5 text-[0.9rem] text-tinta-media">{mensaje}</p>

      <ul className="mt-3 grid grid-cols-3 gap-2">
        {cifras.map((c) => (
          <li key={c.rotulo} className="rounded-xl border border-linea bg-superficie px-3 py-3 text-center">
            <p className="cifra text-[1.5rem] font-semibold leading-none text-tinta">{c.valor}</p>
            <p className="mt-1.5 text-[0.7rem] font-medium text-tinta-suave">{c.rotulo}</p>
          </li>
        ))}
      </ul>

      <BuscarClienteFoto personalId={id} />

      {deHoy.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[0.8rem] font-semibold uppercase tracking-wide text-tinta-suave">Hoy</h2>
          <ul className="flex flex-col gap-2">
            {deHoy.map((t) => (
              <li key={t.id} className="rounded-xl border border-linea border-l-4 border-l-exito bg-superficie p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[0.95rem] font-semibold text-tinta">{t.cliente}</p>
                    {t.servicios && <p className="text-[0.82rem] leading-snug text-tinta-media">{t.servicios}</p>}
                  </div>
                  <span className="cifra flex-none text-[0.85rem] text-tinta-suave">{t.hora}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[0.8rem]">
                  <span className="font-medium text-exito">✓ Confirmado</span>
                  <span className="cifra font-semibold text-tinta">{formatearGuarani(t.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proximos.size > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[0.8rem] font-semibold uppercase tracking-wide text-tinta-suave">Próximos días</h2>
          <div className="flex flex-col gap-3">
            {[...proximos.entries()].map(([dia, lista]) => (
              <div key={dia}>
                <p className="mb-1 text-[0.8rem] font-semibold text-tinta-media">
                  {dia === manana ? `Mañana · ${diaLargo(dia)}` : diaLargo(dia)}
                </p>
                <ul className="flex flex-col overflow-hidden rounded-xl border border-linea">
                  {lista.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 border-b border-linea-fina bg-superficie px-3 py-2.5 text-[0.85rem] last:border-b-0"
                    >
                      <span className="min-w-0 truncate">
                        <span className="cifra text-tinta-suave">{t.hora}</span>{" "}
                        <span className="font-medium text-tinta">{t.cliente}</span>
                        {t.servicios && <span className="text-tinta-media"> · {t.servicios}</span>}
                      </span>
                      <span className="cifra flex-none font-semibold text-tinta">{formatearGuarani(t.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-[0.8rem] font-semibold uppercase tracking-wide text-tinta-suave">Tus números</h2>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={hrefPeriodo({ fecha: hoy })} className={BOTON_HOY}>
            Hoy
          </Link>
          <Link
            href={hrefPeriodo({ fecha: fechaVecina(vista, fechaPedida, -1) })}
            aria-label="Período anterior"
            className={`${BOTON_NEUTRO} w-8 px-0`}
          >
            ‹
          </Link>
          <Link
            href={hrefPeriodo({ fecha: fechaVecina(vista, fechaPedida, 1) })}
            aria-label="Período siguiente"
            className={`${BOTON_NEUTRO} w-8 px-0`}
          >
            ›
          </Link>
          <div role="tablist" aria-label="Ver por" className="ml-auto flex rounded-lg bg-papel-hundido p-0.5">
            {VISTAS_AGENDA.map((v) => (
              <Link
                key={v.valor}
                href={hrefPeriodo({ vista: v.valor })}
                role="tab"
                aria-selected={v.valor === vista}
                className={`flex h-7 items-center justify-center rounded-md px-2.5 text-[0.76rem] font-semibold transition-colors duration-150 ${
                  v.valor === vista ? "bg-superficie text-azul-oscuro shadow-sm" : "text-tinta-media"
                }`}
              >
                {v.etiqueta}
              </Link>
            ))}
          </div>
        </div>

        <p className="mt-2.5 text-[0.85rem] font-medium text-tinta">{tituloAgenda(vista, fechaPedida)}</p>

        <ul className="mt-2.5 grid grid-cols-2 gap-2">
          {cifrasPeriodo.map((c) => {
            const t = TONOS_TARJETA[c.tono];
            return (
              <li key={c.rotulo} className={`min-w-0 rounded-xl border px-3 py-3 ${t.tarjeta}`}>
                <p className={`cifra truncate text-[1.05rem] font-semibold leading-none ${t.valor}`} title={c.valor}>
                  {c.valor}
                </p>
                <p className={`mt-1.5 truncate text-[0.72rem] font-medium ${t.rotulo}`}>{c.rotulo}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-8 text-center text-[0.72rem] text-tinta-suave">Se actualiza sola. Solo ves lo tuyo.</p>
    </main>
  );
}
