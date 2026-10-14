import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { limitesEnAsuncion } from "@/lib/rango-dias";
import { claveDiaAsuncion } from "@/lib/timezone";
import { diaDeLaSemana, diaLargo, horaDeMinutos, parsearFecha, partesLocales } from "@/lib/agenda";
import { claveSumarDias } from "@/lib/calendario";
import {
  DEPORTES_CANCHA,
  estadoLiberaHorario,
  etiquetaDeDeporte,
  limpiarDuraciones,
  normalizarDeporte,
  normalizarPaso,
  urlCanchas,
  urlReservaCancha,
  type ParametrosCanchas,
} from "@/lib/canchas";
import { cargarHorarioCanchas } from "@/lib/canchas-publicas";
import { formatearGuarani } from "@/lib/format";
import { Cabecera, clasesBoton } from "@/components/ui";
import { GrillaCanchas, type ColumnaCancha, type ReservaGrilla } from "./GrillaCanchas";
import { formatearNumero } from "@/lib/format";
import { detallePagos } from "@/lib/pago-venta";
import { cargarEstadoCaja } from "../agenda/cargar-cita";
import { PanelReservaCancha, type CanchaDelPanel, type DetalleReservaCancha } from "./PanelReservaCancha";

export const dynamic = "force-dynamic";

/** Tope de reservas que se dibujan de una vez en un día. */
const MAXIMO_RESERVAS = 500;

const PASTILLA = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8rem] font-medium transition-colors";
const PASTILLA_ACTIVA = `${PASTILLA} border-azul bg-azul-luz text-azul-oscuro`;
const PASTILLA_INACTIVA = `${PASTILLA} border-linea text-tinta-media hover:border-azul/40 hover:text-tinta`;

/** Las respuestas a los campos del formulario que quedaron guardadas en la reserva, sin nada raro. */
function leerExtras(valor: unknown): { etiqueta: string; valor: string }[] {
  if (!Array.isArray(valor)) return [];
  const salida: { etiqueta: string; valor: string }[] = [];
  for (const e of valor) {
    if (!e || typeof e !== "object") continue;
    const { etiqueta, valor: v } = e as { etiqueta?: unknown; valor?: unknown };
    if (typeof etiqueta === "string" && typeof v === "string" && v) salida.push({ etiqueta, valor: v });
  }
  return salida;
}

/**
 * El calendario de la Reserva de canchas: un día, con una columna por cancha y las reservas como bloques. Se mira por
 * tipo de cancha y se puede mostrar o esconder lo cancelado.
 *
 * Todo lo que se elige (día, tipo, canceladas) vive en la dirección de la página: `?fecha=2026-10-16&tipo=padel`.
 * Tocar una reserva agrega `&reserva=<id>` y abre su detalle a la derecha; tocar un hueco vacío agrega
 * `&reserva=nueva&cancha=<id>&hora=18:30` y abre una reserva nueva ya con esa cancha y esa hora.
 */
export default async function CanchasCalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; tipo?: string; canceladas?: string; reserva?: string; cancha?: string; hora?: string }>;
}) {
  await pantallaConPermiso("canchas.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const sp = await searchParams;
  const ahora = new Date();
  const hoy = claveDiaAsuncion(ahora);
  const fecha = parsearFecha(sp.fecha, hoy);
  const tipoPedido = DEPORTES_CANCHA.find((d) => d.valor === sp.tipo)?.valor ?? null;
  const parametros: ParametrosCanchas = { fecha, tipo: tipoPedido, canceladas: sp.canceladas === "1" };

  const [canchasDb, horarios] = await Promise.all([
    db.cancha.findMany({ orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
    cargarHorarioCanchas(prisma, storeId),
  ]);

  const reservasDb = await db.reservaCancha.findMany({
    where: {
      inicio: limitesEnAsuncion({ desde: fecha, hasta: fecha }),
      // Una reserva pedida por la web que espera el aviso por WhatsApp todavía no se ve.
      visible: true,
      ...(parametros.canceladas ? {} : { estado: { not: "cancelada" } }),
    },
    orderBy: [{ inicio: "asc" }, { id: "asc" }],
    take: MAXIMO_RESERVAS,
    select: {
      id: true,
      canchaId: true,
      clienteNombre: true,
      inicio: true,
      fin: true,
      estado: true,
      precio: true,
      duracionMin: true,
      origen: true,
      ventaPosId: true,
    },
  });

  const reservas: ReservaGrilla[] = reservasDb.map((r) => ({
    id: r.id,
    canchaId: r.canchaId,
    clienteNombre: r.clienteNombre,
    inicio: r.inicio,
    fin: r.fin,
    estado: r.estado,
    precio: Number(r.precio),
    duracionMin: r.duracionMin,
    origen: r.origen,
    cobrada: r.ventaPosId !== null,
  }));

  // Los tipos que hay (para filtrar) y las columnas: las canchas activas del tipo elegido, más las inactivas que ese día
  // tienen reservas (para no esconder una reserva que existe).
  const tiposPresentes = DEPORTES_CANCHA.filter((d) => canchasDb.some((c) => c.activa && normalizarDeporte(c.deporte) === d.valor));
  const conReservas = new Set(reservas.map((r) => r.canchaId));
  const columnas: ColumnaCancha[] = canchasDb
    .filter((c) => (c.activa || conReservas.has(c.id)) && (!tipoPedido || normalizarDeporte(c.deporte) === tipoPedido))
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tipo: etiquetaDeDeporte(c.deporte),
      activa: c.activa,
    }));
  const idsVisibles = new Set(columnas.map((c) => c.id));
  const reservasVisibles = reservas.filter((r) => idsVisibles.has(r.canchaId));

  // El resumen del día: lo que de verdad ocupa cancha (sin canceladas ni inasistencias).
  const vigentes = reservasVisibles.filter((r) => !estadoLiberaHorario(r.estado));
  const totalDelDia = vigentes.reduce((suma, r) => suma + r.precio, 0);
  const porConfirmar = vigentes.filter((r) => r.estado === "pendiente").length;

  const horarioDelDia = horarios.find((h) => h.diaSemana === diaDeLaSemana(fecha)) ?? null;

  // El panel de la derecha: el detalle de la reserva tocada, o una reserva nueva.
  let panel: React.ReactNode = null;
  if (sp.reserva) {
    const canchasPanel: CanchaDelPanel[] = canchasDb.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      deporte: normalizarDeporte(c.deporte),
      superficie: c.superficie,
      techada: c.techada,
      descripcion: c.descripcion,
      fotoUrl: c.fotoUrl,
      precioHora: Number(c.precioHora),
      precioNocturnoHora: c.precioNocturnoHora == null ? null : Number(c.precioNocturnoHora),
      nocheDesde: c.nocheDesde,
      duraciones: limpiarDuraciones(c.duraciones),
      pasoMin: normalizarPaso(c.pasoMin),
      activa: c.activa,
    }));
    const local = await localActual();

    if (sp.reserva === "nueva") {
      const canchaElegida = canchasPanel.find((c) => c.id === sp.cancha && c.activa)?.id ?? null;
      const hora = sp.hora && /^([01]\d|2[0-3]):[0-5]\d$/.test(sp.hora) ? sp.hora : null;
      if (canchasPanel.some((c) => c.activa)) {
        panel = (
          <PanelReservaCancha
            key="nueva"
            reserva={null}
            canchas={canchasPanel}
            precarga={{ canchaId: canchaElegida, hora, fecha }}
            parametros={parametros}
            negocio={local.nombre}
          />
        );
      }
    } else {
      const fila = await db.reservaCancha.findFirst({
        where: { id: sp.reserva },
        select: {
          id: true,
          canchaId: true,
          canchaNombre: true,
          clienteNombre: true,
          clienteTelefono: true,
          clienteEmail: true,
          nota: true,
          extras: true,
          inicio: true,
          duracionMin: true,
          estado: true,
          precio: true,
          origen: true,
          ventaPos: {
            select: {
              id: true,
              numero: true,
              total: true,
              cancelada: true,
              comprobanteTipo: true,
              facturaNumero: true,
              facturaAnulada: true,
              pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } },
            },
          },
        },
      });
      // Una dirección con una reserva que ya no existe simplemente no abre nada.
      if (fila) {
        const i = partesLocales(fila.inicio);
        // Una venta cancelada ya no cuenta: la reserva vuelve a estar sin cobrar.
        const cobrada = fila.ventaPos && !fila.ventaPos.cancelada ? fila.ventaPos : null;
        const caja = cobrada ? ({ listo: false, motivo: "sin_turno" } as const) : await cargarEstadoCaja(db, storeId);
        const detalle: DetalleReservaCancha = {
          id: fila.id,
          codigo: fila.id.slice(-6).toUpperCase(),
          canchaId: fila.canchaId,
          canchaNombre: fila.canchaNombre,
          clienteNombre: fila.clienteNombre,
          clienteTelefono: fila.clienteTelefono,
          clienteEmail: fila.clienteEmail,
          nota: fila.nota,
          extras: leerExtras(fila.extras),
          fecha: i.dia,
          hora: horaDeMinutos(i.minutos),
          duracionMin: fila.duracionMin,
          estado: fila.estado,
          precio: Number(fila.precio),
          origen: fila.origen,
          cobro: cobrada
            ? {
                ventaId: cobrada.id,
                numero: formatearNumero(cobrada.numero),
                pagoTexto: detallePagos(cobrada.pagos.map((p: { forma: string; monto: unknown }) => ({ forma: p.forma, monto: Number(p.monto) }))),
                total: Number(cobrada.total),
                comprobanteTipo: cobrada.comprobanteTipo,
                facturaNumero: cobrada.facturaNumero,
                facturaAnulada: cobrada.facturaAnulada,
              }
            : null,
        };
        panel = (
          <PanelReservaCancha
            key={fila.id}
            reserva={detalle}
            canchas={canchasPanel}
            precarga={{ canchaId: null, hora: null, fecha }}
            caja={caja}
            parametros={parametros}
            negocio={local.nombre}
          />
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Cabecera
        titulo="Calendario de canchas"
        bajada="Las reservas de cada cancha, hora por hora. Tocá una reserva para ver su detalle, o un hueco vacío para anotar una nueva."
        compacta
        acciones={
          <Link href={urlReservaCancha(parametros, "nueva")} scroll={false} className={clasesBoton("nuevo", "sm")}>
            + Nueva reserva
          </Link>
        }
      />

      {/* ---------- el día, y de un día al otro ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={urlCanchas(parametros, { fecha: claveSumarDias(fecha, -1) })}
            scroll={false}
            aria-label="Día anterior"
            className={clasesBoton("suave", "sm")}
          >
            ‹
          </Link>
          <Link
            href={urlCanchas(parametros, { fecha: hoy })}
            scroll={false}
            aria-current={fecha === hoy ? "date" : undefined}
            className={clasesBoton(fecha === hoy ? "navegar" : "suave", "sm")}
          >
            Hoy
          </Link>
          <Link
            href={urlCanchas(parametros, { fecha: claveSumarDias(fecha, 1) })}
            scroll={false}
            aria-label="Día siguiente"
            className={clasesBoton("suave", "sm")}
          >
            ›
          </Link>
        </div>
        <p className="text-[0.95rem] font-semibold capitalize text-tinta">{diaLargo(fecha)}</p>

        {/* Ir a otro día: un formulario común (sin JavaScript), igual que los filtros de los reportes. */}
        <form method="get" action="/admin/canchas" className="ml-auto flex items-center gap-1.5">
          {parametros.tipo && <input type="hidden" name="tipo" value={parametros.tipo} />}
          {parametros.canceladas && <input type="hidden" name="canceladas" value="1" />}
          <input
            type="date"
            name="fecha"
            defaultValue={fecha}
            aria-label="Ir a un día"
            className="cifra h-9 rounded-lg border border-linea bg-superficie px-2 text-[0.84rem] text-tinta"
          />
          <button type="submit" className={clasesBoton("navegar", "sm")}>
            Ir
          </button>
        </form>
      </div>

      {/* ---------- el tipo de cancha y lo cancelado ---------- */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tiposPresentes.length > 1 && (
          <nav aria-label="Tipo de cancha" className="flex flex-wrap gap-1.5">
            <Link
              href={urlCanchas(parametros, { tipo: null })}
              scroll={false}
              aria-current={parametros.tipo ? undefined : "page"}
              className={parametros.tipo ? PASTILLA_INACTIVA : PASTILLA_ACTIVA}
            >
              Todas
            </Link>
            {tiposPresentes.map((t) => (
              <Link
                key={t.valor}
                href={urlCanchas(parametros, { tipo: t.valor })}
                scroll={false}
                aria-current={parametros.tipo === t.valor ? "page" : undefined}
                className={parametros.tipo === t.valor ? PASTILLA_ACTIVA : PASTILLA_INACTIVA}
              >
                {t.etiqueta}
              </Link>
            ))}
          </nav>
        )}
        <Link
          href={urlCanchas(parametros, { canceladas: !parametros.canceladas })}
          scroll={false}
          aria-pressed={parametros.canceladas}
          className={`${parametros.canceladas ? PASTILLA_ACTIVA : PASTILLA_INACTIVA} ml-auto`}
        >
          {parametros.canceladas ? "Mostrando canceladas" : "Ver canceladas"}
        </Link>
      </div>

      {/* ---------- el resumen del día ---------- */}
      <p className="text-[0.82rem] text-tinta-media">
        <span className="font-semibold text-tinta">
          {vigentes.length === 1 ? "1 reserva" : `${vigentes.length} reservas`}
        </span>
        {" · "}
        <span className="cifra font-semibold text-tinta">{formatearGuarani(totalDelDia)}</span>
        {porConfirmar > 0 && (
          <>
            {" · "}
            <span className="font-semibold text-aviso">{porConfirmar === 1 ? "1 por confirmar" : `${porConfirmar} por confirmar`}</span>
          </>
        )}
      </p>

      {/* ---------- el calendario ---------- */}
      {columnas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-12 text-center">
          <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">Todavía no hay canchas para mostrar</p>
          <p className="mx-auto mt-1.5 max-w-md text-[0.85rem] leading-snug text-tinta-media">
            Cargá las canchas de tu complejo para empezar a recibir reservas.
          </p>
          <div className="mt-4 flex justify-center">
            <Link href="/admin/canchas/lista" className={clasesBoton("nuevo", "md")}>
              Cargar canchas
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-azul/50 bg-superficie">
          <GrillaCanchas
            canchas={columnas}
            reservas={reservasVisibles}
            dia={fecha}
            hoy={hoy}
            ahora={ahora}
            horario={horarioDelDia}
            parametros={parametros}
          />
        </div>
      )}

      {panel}
    </div>
  );
}
