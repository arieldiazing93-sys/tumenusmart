import { notFound, redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Volver } from "@/components/Volver";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { compararCierre, contrastarTurno, etiquetaFormaPagoPos, type FormaPagoPos } from "@/lib/turno-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/** "Jueves 27 de agosto de 2026, 21:40" — como lo diría el cajero. */
function fechaLarga(fecha: Date): string {
  const texto = fecha.toLocaleDateString("es-PY", {
    timeZone: ZONA_NEGOCIO,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const hora = fecha.toLocaleTimeString("es-PY", {
    timeZone: ZONA_NEGOCIO,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${texto.charAt(0).toUpperCase() + texto.slice(1)}, ${hora}`;
}

function horaCorta(fecha: Date | null): string {
  if (!fecha) return "—";
  return fecha.toLocaleString("es-PY", {
    timeZone: ZONA_NEGOCIO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * El comprobante de un turno de POS ya cerrado.
 *
 * Mismo criterio que el comprobante de rendición de repartidores: los
 * totales salen de lo que se congeló en TurnoPos al cerrar, no de sumar las
 * ventas otra vez. Si algo se corrigió después, esta hoja lo avisa en vez de
 * disimularlo.
 */
export default async function ComprobanteTurnoPosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const [store, turno] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { nombre: true } }),
    db.turnoPos.findUnique({
      where: { id },
      select: {
        id: true,
        estado: true,
        abiertoPor: true,
        abiertoEn: true,
        cerradoPor: true,
        cerradoEn: true,
        notas: true,
        estacion: { select: { nombre: true } },
        montoInicial: true,
        cantidadVentas: true,
        calculadoEfectivo: true,
        calculadoTransferencia: true,
        calculadoTarjetaDebito: true,
        calculadoTarjetaCredito: true,
        declaradoEfectivo: true,
        declaradoTransferencia: true,
        declaradoTarjetaDebito: true,
        declaradoTarjetaCredito: true,
        ventas: {
          orderBy: { creadoEn: "asc" },
          select: {
            id: true,
            numero: true,
            total: true,
            formaPago: true,
            creadoEn: true,
            cancelada: true,
          },
        },
        // Pedidos de retiro/mesa cobrados durante este turno (ver
        // cambiarEstadoPedido en pedidos/actions.ts) — mismo cierre que las
        // ventas de mostrador, se listan junto a ellas.
        pedidos: {
          orderBy: { updatedAt: "asc" },
          select: {
            id: true,
            numero: true,
            total: true,
            formaPagoPos: true,
            estado: true,
            updatedAt: true,
          },
        },
        // Rendiciones de repartidor recibidas mientras este turno estaba
        // abierto (ver Rendicion.turnoPosId) — el corte general suma cada
        // una de sus 4 formas a la columna que le corresponde de mostrador.
        rendiciones: {
          orderBy: { creadoEn: "asc" },
          select: {
            id: true,
            cantidadPedidos: true,
            totalEfectivo: true,
            totalTransferencia: true,
            totalTarjetaDebito: true,
            totalTarjetaCredito: true,
            recibidoPor: true,
            creadoEn: true,
            repartidor: { select: { nombre: true } },
          },
        },
      },
    }),
  ]);

  if (!turno || turno.estado !== "cerrado") notFound();

  // "pos.vender" alcanza para ver el propio comprobante recién cerrado —a
  // esta pantalla lo manda directo cerrarTurno— pero ver el cierre de OTRO
  // cajero es histórico, y el histórico completo de todos los cajeros es
  // solo del dueño (pos.verHistorico). Sin este chequeo, cualquier empleado
  // que consiga la URL (por ejemplo del historial del navegador de una
  // terminal compartida) podía ver cuánto declaró y si le faltó plata a
  // otro cajero.
  const miIdentidad = sesion.nombre?.trim() || sesion.email;
  const esPropio = turno.abiertoPor === miIdentidad || turno.cerradoPor === miIdentidad;
  if (!esPropio && !puede(sesion.rol, "pos.verHistorico")) {
    redirect("/admin/pedidos");
  }

  // Lo que quedó congelado en TurnoPos al cerrar: SOLO mostrador + retiro/
  // mesa. Se usa tal cual (sin sumarle delivery) para el contraste contra
  // "hoy" más abajo — ese contraste recalcula ventas/pedidos de este mismo
  // turno, nunca rendiciones, así que mezclar acá los descuadraría.
  const calculadoBase: Record<FormaPagoPos, number> = {
    efectivo: Number(turno.calculadoEfectivo ?? 0),
    transferencia: Number(turno.calculadoTransferencia ?? 0),
    tarjeta_debito: Number(turno.calculadoTarjetaDebito ?? 0),
    tarjeta_credito: Number(turno.calculadoTarjetaCredito ?? 0),
  };
  const declarado: Record<FormaPagoPos, number> = {
    efectivo: Number(turno.declaradoEfectivo ?? 0),
    transferencia: Number(turno.declaradoTransferencia ?? 0),
    tarjeta_debito: Number(turno.declaradoTarjetaDebito ?? 0),
    tarjeta_credito: Number(turno.declaradoTarjetaCredito ?? 0),
  };

  // Corte general: el cajero controla los dos canales (mostrador y
  // delivery), así que lo que declara en cada forma de pago es UN SOLO
  // número que ya incluye lo que rindieron los repartidores — el mismo
  // cajón de efectivo, la misma cuenta bancaria de transferencias, el mismo
  // resumen de POS para las tarjetas. Por eso lo que el sistema espera
  // suma las 4 formas de la rendición a su columna correspondiente de
  // mostrador; si no, el declarado (que sí las incluye) se ve como un
  // sobrante que nunca existió.
  const totalRendicionesEfectivo = turno.rendiciones.reduce((s, r) => s + Number(r.totalEfectivo), 0);
  const totalRendicionesTransferencia = turno.rendiciones.reduce(
    (s, r) => s + Number(r.totalTransferencia),
    0
  );
  const totalRendicionesTarjetaDebito = turno.rendiciones.reduce(
    (s, r) => s + Number(r.totalTarjetaDebito),
    0
  );
  const totalRendicionesTarjetaCredito = turno.rendiciones.reduce(
    (s, r) => s + Number(r.totalTarjetaCredito),
    0
  );
  // El monto con el que se abrió el turno (para dar cambio) ya es plata que
  // está en el cajón desde antes de la primera venta — el cajero la cuenta
  // igual al hacer el corte ciego, así que el sistema también la tiene que
  // esperar. Solo afecta Efectivo: se abre caja con billetes, no con una
  // transferencia o una tarjeta.
  const montoInicial = Number(turno.montoInicial ?? 0);
  const calculado: Record<FormaPagoPos, number> = {
    efectivo: calculadoBase.efectivo + totalRendicionesEfectivo + montoInicial,
    transferencia: calculadoBase.transferencia + totalRendicionesTransferencia,
    tarjeta_debito: calculadoBase.tarjeta_debito + totalRendicionesTarjetaDebito,
    tarjeta_credito: calculadoBase.tarjeta_credito + totalRendicionesTarjetaCredito,
  };

  const totalCalculadoCongelado =
    calculado.efectivo + calculado.transferencia + calculado.tarjeta_debito + calculado.tarjeta_credito;
  const cierre = compararCierre(
    { cantidad: turno.cantidadVentas ?? 0, totalGeneral: totalCalculadoCongelado, porForma: calculado },
    declarado
  );
  const { totalCalculado, totalDeclarado, diferenciaTotal } = cierre;

  // Una venta cancelada, o un pedido que pasó a "cancelado", DESPUÉS de
  // cerrar el turno es justo el tipo de cambio que este contraste tiene que
  // sacar a la luz: hoy ya no cuenta para el total, aunque el cierre siga
  // firmado con el número de aquel día.
  const contraste = contrastarTurno(
    [
      ...turno.ventas
        .filter((v) => !v.cancelada)
        .map((v) => ({ total: Number(v.total), formaPago: v.formaPago })),
      ...turno.pedidos
        .filter((p) => p.estado !== "cancelado")
        .map((p) => ({ total: Number(p.total), formaPago: p.formaPagoPos ?? "efectivo" })),
    ],
    { cantidadVentas: turno.cantidadVentas ?? 0, calculado: calculadoBase }
  );

  return (
    <div className="print:text-[11pt]">
      {/* --- lo que solo se ve en pantalla --- */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Volver href="/admin/pos/turnos" texto="Volver a cierres de turno" />
        <ImprimirBoton />
      </div>

      {/* --- la hoja --- */}
      <div className="rounded-xl border border-linea bg-white p-6 print:rounded-none print:border-0 print:p-0">
        <header className="mb-5 border-b border-linea pb-4 print:mb-4 print:pb-3">
          <p className="rotulo">Cierre de turno · Punto de venta</p>
          <h1 className="mt-1 text-[1.35rem] font-semibold tracking-titular text-tinta print:text-[16pt]">
            {store?.nombre ?? "Cierre de turno"}
          </h1>
          <p className="mt-0.5 text-[0.9rem] text-tinta-media">
            {fechaLarga(turno.cerradoEn ?? turno.abiertoEn)}
          </p>

          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[0.85rem]">
            <div>
              <dt className="text-tinta-suave">Estación</dt>
              <dd className="font-semibold text-tinta">{turno.estacion.nombre}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Abrió</dt>
              <dd className="font-semibold text-tinta">{turno.abiertoPor}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Cerró</dt>
              <dd className="font-semibold text-tinta">{turno.cerradoPor}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Cuentas</dt>
              <dd className="cifra font-semibold text-tinta">{turno.cantidadVentas}</dd>
            </div>
            {montoInicial > 0 && (
              <div>
                <dt className="text-tinta-suave">Efectivo inicial</dt>
                <dd className="cifra font-semibold text-tinta">{formatearGuarani(montoInicial)}</dd>
              </div>
            )}
            <div>
              <dt className="text-tinta-suave">Comprobante</dt>
              <dd className="cifra font-semibold text-tinta">{turno.id.slice(-8).toUpperCase()}</dd>
            </div>
          </dl>
        </header>

        <div className="mb-5 rounded-xl border border-exito/25 bg-exito-luz p-4 print:rounded-none print:border print:border-linea print:bg-transparent">
          <p className="text-[0.85rem] text-tinta-media">Total declarado</p>
          <p className="cifra mt-0.5 text-[1.9rem] font-semibold leading-tight text-exito print:text-[20pt] print:text-tinta">
            {formatearGuarani(totalDeclarado)}
          </p>
          {diferenciaTotal !== 0 && (
            <p className="mt-1 text-[0.82rem] text-tinta-media">
              {diferenciaTotal > 0 ? "Sobró" : "Faltó"} {formatearGuarani(Math.abs(diferenciaTotal))}{" "}
              respecto de lo que calculó el sistema ({formatearGuarani(totalCalculado)}).
            </p>
          )}
        </div>

        {!contraste.coincide && (
          <p className="mb-5 rounded-xl border border-aviso/25 bg-aviso-luz px-4 py-3 text-[0.85rem] text-tinta print:rounded-none print:border-linea print:bg-transparent">
            Alguna venta o pedido de este turno se modificó después de cerrarlo: hoy suman{" "}
            <span className="cifra font-semibold">{formatearGuarani(contraste.totalAhora)}</span> en{" "}
            {contraste.cantidadAhora} {contraste.cantidadAhora === 1 ? "cuenta" : "cuentas"}. Lo que se
            calculó al cerrar fue {formatearGuarani(contraste.totalCongelado)} y es lo que vale este
            comprobante.
          </p>
        )}

        <section className="mb-5 break-inside-avoid">
          <h2 className="mb-2 text-[0.95rem] font-semibold tracking-titular text-tinta">
            Por forma de pago
          </h2>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">
                <th className="border-b border-linea pb-1.5 font-semibold">Forma</th>
                <th className="border-b border-linea pb-1.5 text-right font-semibold">Sistema</th>
                <th className="border-b border-linea pb-1.5 text-right font-semibold">Declarado</th>
                <th className="border-b border-linea pb-1.5 text-right font-semibold">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {cierre.porForma.map((f) => (
                <tr key={f.forma}>
                  <td className="border-b border-linea-fina py-1 text-[0.85rem] text-tinta">
                    {f.etiqueta}
                  </td>
                  <td className="cifra border-b border-linea-fina py-1 text-right text-[0.85rem] text-tinta-media">
                    {formatearGuarani(f.calculado)}
                  </td>
                  <td className="cifra border-b border-linea-fina py-1 text-right text-[0.85rem] font-medium text-tinta">
                    {formatearGuarani(f.declarado)}
                  </td>
                  <td
                    className={`cifra border-b border-linea-fina py-1 text-right text-[0.85rem] font-medium ${
                      f.diferencia === 0
                        ? "text-tinta-suave"
                        : f.diferencia > 0
                          ? "text-exito"
                          : "text-peligro"
                    }`}
                  >
                    {f.diferencia === 0 ? "—" : formatearGuarani(f.diferencia)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-1.5 text-right text-[0.85rem] text-tinta-media">Total</td>
                <td className="cifra pt-1.5 text-right text-[0.85rem] text-tinta-media">
                  {formatearGuarani(totalCalculado)}
                </td>
                <td className="cifra pt-1.5 text-right text-[0.95rem] font-semibold text-tinta">
                  {formatearGuarani(totalDeclarado)}
                </td>
                <td className="cifra pt-1.5 text-right text-[0.85rem] font-medium text-tinta">
                  {diferenciaTotal === 0 ? "—" : formatearGuarani(diferenciaTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
          {turno.rendiciones.length > 0 && (
            <p className="mt-2 text-[0.78rem] text-tinta-suave">
              Cada forma de acá arriba incluye lo que rindió{" "}
              {turno.rendiciones.length === 1 ? "el repartidor" : "los repartidores"} de delivery durante
              este turno — es la misma caja, la misma cuenta y el mismo resumen de POS.
            </p>
          )}
          {montoInicial > 0 && (
            <p className="mt-1 text-[0.78rem] text-tinta-suave">
              El Efectivo de acá arriba también incluye los {formatearGuarani(montoInicial)} con los que
              se abrió el turno.
            </p>
          )}
        </section>

        <section className="break-inside-avoid">
          <h2 className="mb-2 text-[0.95rem] font-semibold tracking-titular text-tinta">
            Ventas del turno
          </h2>
          {turno.ventas.length === 0 ? (
            <p className="text-[0.85rem] text-tinta-suave">No hubo ventas en este turno.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">
                  <th className="w-20 border-b border-linea pb-1.5 font-semibold">Venta</th>
                  <th className="w-32 border-b border-linea pb-1.5 font-semibold">Hora</th>
                  <th className="border-b border-linea pb-1.5 font-semibold">Forma de pago</th>
                  <th className="w-32 border-b border-linea pb-1.5 text-right font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody>
                {turno.ventas.map((v) => (
                  <tr key={v.id} className="break-inside-avoid align-top">
                    <td className="cifra border-b border-linea-fina py-1 text-[0.85rem] font-medium text-tinta">
                      {formatearNumero(v.numero)}
                    </td>
                    <td className="cifra border-b border-linea-fina py-1 text-[0.82rem] text-tinta-media">
                      {horaCorta(v.creadoEn)}
                    </td>
                    <td className="border-b border-linea-fina py-1 text-[0.82rem] text-tinta-media">
                      {etiquetaFormaPagoPos(v.formaPago)}
                      {v.cancelada && <span className="text-peligro"> (cancelada)</span>}
                    </td>
                    <td
                      className={`cifra border-b border-linea-fina py-1 text-right text-[0.85rem] font-medium ${
                        v.cancelada ? "text-tinta-suave line-through" : "text-tinta"
                      }`}
                    >
                      {formatearGuarani(Number(v.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {turno.pedidos.length > 0 && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="mb-2 text-[0.95rem] font-semibold tracking-titular text-tinta">
              Pedidos de retiro/mesa cobrados en este turno
            </h2>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">
                  <th className="w-20 border-b border-linea pb-1.5 font-semibold">Pedido</th>
                  <th className="w-32 border-b border-linea pb-1.5 font-semibold">Hora</th>
                  <th className="border-b border-linea pb-1.5 font-semibold">Forma de pago</th>
                  <th className="w-32 border-b border-linea pb-1.5 text-right font-semibold">Monto</th>
                </tr>
              </thead>
              <tbody>
                {turno.pedidos.map((p) => (
                  <tr key={p.id} className="break-inside-avoid align-top">
                    <td className="cifra border-b border-linea-fina py-1 text-[0.85rem] font-medium text-tinta">
                      {formatearNumero(p.numero)}
                    </td>
                    <td className="cifra border-b border-linea-fina py-1 text-[0.82rem] text-tinta-media">
                      {horaCorta(p.updatedAt)}
                    </td>
                    <td className="border-b border-linea-fina py-1 text-[0.82rem] text-tinta-media">
                      {etiquetaFormaPagoPos(p.formaPagoPos ?? "efectivo")}
                      {p.estado === "cancelado" && <span className="text-peligro"> (cancelado)</span>}
                    </td>
                    <td
                      className={`cifra border-b border-linea-fina py-1 text-right text-[0.85rem] font-medium ${
                        p.estado === "cancelado" ? "text-tinta-suave line-through" : "text-tinta"
                      }`}
                    >
                      {formatearGuarani(Number(p.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {turno.rendiciones.length > 0 && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="mb-2 text-[0.95rem] font-semibold tracking-titular text-tinta">
              Delivery rendido durante este turno
            </h2>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">
                  <th className="border-b border-linea pb-1.5 font-semibold">Repartidor</th>
                  <th className="w-28 border-b border-linea pb-1.5 font-semibold">Hora</th>
                  <th className="w-16 border-b border-linea pb-1.5 text-right font-semibold">Entregas</th>
                  <th className="w-28 border-b border-linea pb-1.5 text-right font-semibold">Efectivo</th>
                  <th className="w-28 border-b border-linea pb-1.5 text-right font-semibold">Transf.</th>
                  <th className="w-28 border-b border-linea pb-1.5 text-right font-semibold">Débito</th>
                  <th className="w-28 border-b border-linea pb-1.5 text-right font-semibold">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {turno.rendiciones.map((r) => (
                  <tr key={r.id} className="break-inside-avoid align-top">
                    <td className="border-b border-linea-fina py-1 text-[0.85rem] font-medium text-tinta">
                      {r.repartidor.nombre}
                    </td>
                    <td className="cifra border-b border-linea-fina py-1 text-[0.82rem] text-tinta-media">
                      {horaCorta(r.creadoEn)}
                    </td>
                    <td className="cifra border-b border-linea-fina py-1 text-right text-[0.85rem] text-tinta-media">
                      {r.cantidadPedidos}
                    </td>
                    <td className="cifra border-b border-linea-fina py-1 text-right text-[0.85rem] font-medium text-tinta">
                      {formatearGuarani(Number(r.totalEfectivo))}
                    </td>
                    <td className="cifra border-b border-linea-fina py-1 text-right text-[0.85rem] text-tinta-media">
                      {formatearGuarani(Number(r.totalTransferencia))}
                    </td>
                    <td className="cifra border-b border-linea-fina py-1 text-right text-[0.85rem] text-tinta-media">
                      {formatearGuarani(Number(r.totalTarjetaDebito))}
                    </td>
                    <td className="cifra border-b border-linea-fina py-1 text-right text-[0.85rem] text-tinta-media">
                      {formatearGuarani(Number(r.totalTarjetaCredito))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="pt-1.5 text-right text-[0.85rem] text-tinta-media">
                    Total delivery
                  </td>
                  <td className="cifra pt-1.5 text-right text-[0.95rem] font-semibold text-tinta">
                    {formatearGuarani(totalRendicionesEfectivo)}
                  </td>
                  <td className="cifra pt-1.5 text-right text-[0.85rem] text-tinta-media">
                    {formatearGuarani(totalRendicionesTransferencia)}
                  </td>
                  <td className="cifra pt-1.5 text-right text-[0.85rem] text-tinta-media">
                    {formatearGuarani(totalRendicionesTarjetaDebito)}
                  </td>
                  <td className="cifra pt-1.5 text-right text-[0.85rem] text-tinta-media">
                    {formatearGuarani(totalRendicionesTarjetaCredito)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {turno.notas && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="mb-1 text-[0.8rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Observaciones
            </h2>
            <p className="text-[0.85rem] text-tinta">{turno.notas}</p>
          </section>
        )}

        <section className="mt-10 flex flex-wrap gap-8 break-inside-avoid print:mt-12">
          <div className="min-w-[13rem] flex-1">
            <div className="border-b border-tinta" />
            <p className="mt-1.5 text-[0.78rem] text-tinta-media">Cerró · {turno.cerradoPor}</p>
          </div>
        </section>

        <footer className="mt-6 border-t border-linea pt-3 text-[0.72rem] text-tinta-suave">
          Los montos de este comprobante son los que se registraron al cerrar el turno. Generado
          desde TuMenuSmart.
        </footer>
      </div>
    </div>
  );
}
