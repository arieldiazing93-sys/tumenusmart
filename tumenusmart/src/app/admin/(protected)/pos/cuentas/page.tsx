import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, clasesBoton, Pastilla, Tabla, Th, Td, Tr, Vacio, BotonEnlace } from "@/components/ui";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { nombreCompleto } from "@/lib/agenda-personal";
import { etiquetaFormaPagoPos, FORMAS_PAGO_POS, FORMA_PAGO_MIXTO } from "@/lib/turno-pos";
import { detallePagos, filtroPorFormaPago, montoCobradoConForma } from "@/lib/pago-venta";
import { cargarCuentasCanceladas, type CuentaCancelada } from "@/lib/cuentas-canceladas";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { FiltroFechaReporte } from "@/components/FiltroFechaReporte";

export const dynamic = "force-dynamic";

function FilaCuentaCancelada({ c }: { c: CuentaCancelada }) {
  return (
    <Tr>
      <Td>
        <Link href={c.href} className="font-medium text-azul-oscuro hover:underline">
          {c.titulo}
        </Link>
        <span className="mt-0.5 block text-[10px] font-medium uppercase text-tinta-suave">{c.etiqueta}</span>
      </Td>
      <Td>
        {c.cerradaEn
          ? c.cerradaEn.toLocaleString("es-PY", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: ZONA_NEGOCIO,
            })
          : "—"}
      </Td>
      <Td>—</Td>
      <Td>
        <span className="text-tinta-suave">Sin cobrar</span>
      </Td>
      <Td>
        {c.cerradaPor ?? "—"}
        <span className="mt-0.5 block text-[10px] text-tinta-suave">la canceló</span>
      </Td>
      <Td>
        {c.responsable}
        <span className="mt-0.5 block text-[10px] text-tinta-suave">{c.rolResponsable}</span>
      </Td>
      <Td>
        <Pastilla color="peligro">Cancelada</Pastilla>
        {c.motivoCierre && (
          <span className="mt-0.5 block max-w-[14rem] text-[10px] leading-snug text-tinta-media">
            Motivo: {c.motivoCierre}
          </span>
        )}
        {c.unoPorUno && (
          <span className="mt-0.5 block max-w-[14rem] text-[10px] leading-snug text-tinta-media">
            Productos cancelados de a uno
          </span>
        )}
      </Td>
      <Td className="cifra text-right font-medium text-tinta-suave line-through">{formatearGuarani(c.total)}</Td>
      <Td className="text-right">
        <BotonEnlace href={c.href} tono="navegar" tam="sm">
          Ver
        </BotonEnlace>
      </Td>
    </Tr>
  );
}

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
    where: { creadoEn: { gte: rango.gte, lt: rango.lt }, ...filtroPorFormaPago(formaPago) },
    orderBy: { creadoEn: "desc" },
    select: {
      id: true,
      numero: true,
      total: true,
      formaPago: true,
      pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } },
      registradoPor: true,
      creadoEn: true,
      cancelada: true,
      clienteNombre: true,
      comprobanteTipo: true,
      facturaNumero: true,
      // Las cuentas de mesa del servicio comedor llevan "Mesa 5 · Cuenta #0001": acá se muestra de qué mesa vino.
      nota: true,
      personal: { select: { nombre: true, apellido: true } },
    },
  });

  // Las cuentas (de mesa o de delivery) que se cancelaron antes de cobrarse no son ventas, pero NO pueden desaparecer: si alguien
  // imprimió la cuenta, el cliente pagó y después la cancelaron, esa plata no está en ninguna venta. Se muestran acá, con quién la
  // canceló y por qué. Solo cuando no se filtra por forma de pago (una cuenta sin cobrar no tiene forma de pago).
  // (La misma función la usan el Excel y el PDF de este historial, para que los tres muestren lo mismo.)
  const canceladasSinCobrar = formaPago ? [] : await cargarCuentasCanceladas(db, rango);

  // Todo junto, de la más reciente a la más vieja.
  const filas = [
    ...ventas.map((v) => ({ clave: v.id, fecha: v.creadoEn, venta: v, cuenta: null as CuentaCancelada | null })),
    ...canceladasSinCobrar.map((c) => ({
      clave: `${c.canal}-${c.id}`,
      fecha: c.cerradaEn ?? new Date(0),
      venta: null,
      cuenta: c as CuentaCancelada | null,
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  // Las canceladas no suman: no son plata que haya entrado a la caja. Filtrando
  // por una forma concreta se suma solo lo que se cobró CON esa forma (de una
  // venta dividida cuenta la parte, no la cuenta entera).
  const filtraPorUnaForma = !!formaPago && formaPago !== FORMA_PAGO_MIXTO;
  const totalGeneral = ventas
    .filter((v) => !v.cancelada)
    .reduce(
      (s, v) =>
        s +
        (filtraPorUnaForma ? montoCobradoConForma(v.pagos, formaPago ?? "") : Number(v.total)),
      0
    );

  return (
    <div>
      <Cabecera
        titulo="Historial de cuentas"
        bajada="Todas las cuentas que se cierran desde la caja: las ventas del mostrador, las cuentas de mesa del servicio comedor y las de delivery, más las cuentas que se cancelaron sin cobrar (con quién y por qué)."
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

      {/* El filtro de fechas (con hora): se adapta al celular (atajos que se deslizan, rango en dos campos lado a lado). */}
      <FiltroFechaReporte
        accion="/admin/pos/cuentas"
        opciones={FILTROS_FECHA}
        activa={fechaActiva}
        desde={desde}
        hasta={hasta}
        conservar={{ formaPago }}
        conHora
      />

      {/* Las formas de pago: en el celular, una fila que se desliza con el dedo. */}
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:mb-6 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
        <Link
          href={hrefFormaPago(null)}
          className={`flex-none whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
            !formaPago
              ? "border-tinta bg-tinta text-white"
              : "border-linea text-tinta-media hover:border-tinta/40"
          }`}
        >
          Todas las formas
        </Link>
        {[...FORMAS_PAGO_POS, { valor: FORMA_PAGO_MIXTO, etiqueta: "Mixto (dividido)" }].map((f) => (
          <Link
            key={f.valor}
            href={hrefFormaPago(f.valor)}
            className={`flex-none whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
              formaPago === f.valor
                ? "border-tinta bg-tinta text-white"
                : "border-linea text-tinta-media hover:border-tinta/40"
            }`}
          >
            {f.etiqueta}
          </Link>
        ))}
      </div>

      {filas.length === 0 ? (
        <Vacio
          titulo="No hay cuentas en este período"
          detalle="Las ventas cerradas (mostrador, comedor y delivery) y las cuentas canceladas sin cobrar van a aparecer acá."
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
              <Th>Personal</Th>
              <Th>Estado</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">
                <span className="sr-only">Acción</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const v = fila.venta;
              // Una cuenta cancelada sin cobrar: no es una venta, pero tiene que verse (con quién la canceló y por qué).
              if (!v) return fila.cuenta ? <FilaCuentaCancelada key={fila.clave} c={fila.cuenta} /> : null;
              return (
              <Tr key={v.id}>
                <Td>
                  <Link
                    href={`/admin/pos/venta/${v.id}`}
                    className="font-medium text-azul-oscuro hover:underline"
                  >
                    {formatearNumero(v.numero)}
                  </Link>
                  {v.nota?.startsWith("Mesa ") && (
                    <span className="mt-0.5 block text-[10px] font-medium uppercase text-tinta-suave">
                      {/* "Mesa 1 · Cuenta de mesa #0004": la venta tiene su número (el de arriba) y acá se ve de qué cuenta de mesa salió. */}
                      {v.nota.replace(" · Cuenta #", " · Cuenta de mesa #")}
                    </span>
                  )}
                  {v.nota?.startsWith("Delivery · ") && (
                    <span className="mt-0.5 block text-[10px] font-medium uppercase text-tinta-suave">
                      {/* "Delivery · Cuenta de delivery #0012": de qué cuenta de delivery salió la venta. */}
                      {v.nota.replace(" · Cuenta #", " · Cuenta de delivery #")}
                    </span>
                  )}
                  {v.comprobanteTipo === "factura" && v.facturaNumero && (
                    <span className="mt-0.5 block text-[10px] font-medium uppercase text-tinta-suave">
                      {v.facturaNumero}
                    </span>
                  )}
                </Td>
                <Td>
                  {v.creadoEn.toLocaleString("es-PY", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: ZONA_NEGOCIO,
                  })}
                </Td>
                <Td>{v.clienteNombre ?? "—"}</Td>
                <Td>
                  {etiquetaFormaPagoPos(v.formaPago)}
                  {v.pagos.length > 1 && (
                    <span className="mt-0.5 block text-[10px] text-tinta-suave">
                      {detallePagos(v.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) })))}
                    </span>
                  )}
                </Td>
                <Td>{v.registradoPor}</Td>
                <Td>{v.personal ? nombreCompleto(v.personal) : "—"}</Td>
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
                <Td className="text-right">
                  <BotonEnlace href={`/admin/pos/venta/${v.id}`} tono="navegar" tam="sm">
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
                {filtraPorUnaForma
                  ? `Cobrado en ${etiquetaFormaPagoPos(formaPago ?? "").toLowerCase()} (sin canceladas)`
                  : "Total (sin canceladas)"}
              </Td>
              <Td className="cifra text-right font-semibold text-tinta">
                {formatearGuarani(totalGeneral)}
              </Td>
              <Td>{null}</Td>
            </tr>
          </tfoot>
        </Tabla>
      )}
    </div>
  );
}
