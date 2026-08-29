import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma as prismaGlobal } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { Volver } from "@/components/Volver";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { contrastarRendicion, etiquetaDeCobro, rindeEfectivo } from "@/lib/rendicion";
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
 * El comprobante de una rendición ya cerrada.
 *
 * Es una hoja, no una pantalla: existe para el momento en que el repartidor ya
 * puso la plata sobre el mostrador y los dos —él y quien la recibió— necesitan
 * un papel que diga cuánto fue. Por eso lleva la lista completa de pedidos con
 * qué se cobró cada uno, un solo número grande (el efectivo entregado), y
 * abajo dos firmas.
 *
 * Los totales salen de la rendición guardada y NO de sumar los pedidos otra
 * vez. Es la misma razón por la que la acción de cerrar los copia: lo que se
 * recibió aquella noche no se puede mover porque mañana alguien corrija el
 * precio de un pedido viejo. Si eso llegó a pasar, la hoja lo dice en vez de
 * disimularlo.
 */
export default async function ComprobanteRendicionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pantallaConPermiso("rendiciones.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const [store, rendicion] = await Promise.all([
    prismaGlobal.store.findUnique({ where: { id: storeId }, select: { nombre: true } }),
    // prismaDelLocal ya filtra por local: una rendición de otro negocio no
    // aparece y la pantalla termina en 404, no en la hoja de otro.
    db.rendicion.findUnique({
      where: { id },
      select: {
        id: true,
        creadoEn: true,
        cantidadPedidos: true,
        totalEfectivo: true,
        totalOtros: true,
        recibidoPor: true,
        notas: true,
        repartidor: { select: { nombre: true } },
        pedidos: {
          orderBy: { entregadoEn: "asc" },
          select: {
            id: true,
            numero: true,
            total: true,
            cobroMetodo: true,
            clienteNombre: true,
            entregadoEn: true,
          },
        },
      },
    }),
  ]);

  if (!rendicion) notFound();

  const efectivo = Number(rendicion.totalEfectivo);
  const otros = Number(rendicion.totalOtros);
  const contraste = contrastarRendicion(rendicion.pedidos, rendicion);

  return (
    <div className="print:text-[11pt]">
      {/* --- lo que solo se ve en pantalla --- */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Volver href="/admin/cierre" texto="Volver a rendiciones" />
        <ImprimirBoton />
      </div>

      {/* --- la hoja --- */}
      <div className="rounded-xl border border-linea bg-white p-6 print:rounded-none print:border-0 print:p-0">
        <header className="mb-5 border-b border-linea pb-4 print:mb-4 print:pb-3">
          <p className="rotulo">Rendición de repartidor</p>
          <h1 className="mt-1 text-[1.35rem] font-semibold tracking-titular text-tinta print:text-[16pt]">
            {store?.nombre ?? "Rendición"}
          </h1>
          <p className="mt-0.5 text-[0.9rem] text-tinta-media">
            {fechaLarga(rendicion.creadoEn)}
          </p>

          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[0.85rem]">
            <div>
              <dt className="text-tinta-suave">Repartidor</dt>
              <dd className="font-semibold text-tinta">{rendicion.repartidor.nombre}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Recibió</dt>
              <dd className="font-semibold text-tinta">{rendicion.recibidoPor}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Entregas</dt>
              <dd className="cifra font-semibold text-tinta">{rendicion.cantidadPedidos}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Comprobante</dt>
              <dd className="cifra font-semibold text-tinta">
                {rendicion.id.slice(-8).toUpperCase()}
              </dd>
            </div>
          </dl>
        </header>

        {/* El número grande es UNO: lo que pasó de mano a mano. */}
        <div className="mb-5 rounded-xl border border-exito/25 bg-exito-luz p-4 print:rounded-none print:border print:border-linea print:bg-transparent">
          <p className="text-[0.85rem] text-tinta-media">Efectivo entregado y recibido</p>
          <p className="cifra mt-0.5 text-[1.9rem] font-semibold leading-tight text-exito print:text-[20pt] print:text-tinta">
            {formatearGuarani(efectivo)}
          </p>
          {otros > 0 && (
            <p className="mt-1 text-[0.82rem] text-tinta-media">
              Además cobró {formatearGuarani(otros)} por tarjeta o transferencia, que ya
              habían entrado al negocio y no pasaron por sus manos.
            </p>
          )}
        </div>

        {!contraste.coincide && (
          <p className="mb-5 rounded-xl border border-aviso/25 bg-aviso-luz px-4 py-3 text-[0.85rem] text-tinta print:rounded-none print:border-linea print:bg-transparent">
            Alguno de estos pedidos se modificó después de cerrar la rendición: hoy suman{" "}
            <span className="cifra font-semibold">{formatearGuarani(contraste.efectivoAhora)}</span>{" "}
            en efectivo sobre {contraste.cantidadAhora}{" "}
            {contraste.cantidadAhora === 1 ? "entrega" : "entregas"}. Lo que se recibió aquel
            día fue {formatearGuarani(contraste.efectivoRendido)} y es lo que vale este
            comprobante.
          </p>
        )}

        <section className="break-inside-avoid">
          <h2 className="mb-2 text-[0.95rem] font-semibold tracking-titular text-tinta">
            Entregas rendidas
          </h2>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">
                <th className="w-20 border-b border-linea pb-1.5 font-semibold">Pedido</th>
                <th className="border-b border-linea pb-1.5 font-semibold">Cliente</th>
                <th className="w-32 border-b border-linea pb-1.5 font-semibold">Entregó</th>
                <th className="w-32 border-b border-linea pb-1.5 font-semibold">Cobró con</th>
                <th className="w-32 border-b border-linea pb-1.5 text-right font-semibold">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody>
              {rendicion.pedidos.map((p) => {
                const metodo = p.cobroMetodo ?? "efectivo";
                const enMano = rindeEfectivo(metodo);
                return (
                  <tr key={p.id} className="break-inside-avoid align-top">
                    <td className="cifra border-b border-linea-fina py-2 text-[0.85rem] font-medium text-tinta">
                      {formatearNumero(p.numero)}
                    </td>
                    <td className="border-b border-linea-fina py-2 pr-3 text-[0.85rem] text-tinta">
                      {p.clienteNombre}
                    </td>
                    <td className="cifra border-b border-linea-fina py-2 text-[0.82rem] text-tinta-media">
                      {horaCorta(p.entregadoEn)}
                    </td>
                    {/* En papel no hay color: lo que no es efectivo se marca
                        con un signo, que se ve igual en una impresora térmica. */}
                    <td className="border-b border-linea-fina py-2 text-[0.82rem] text-tinta-media">
                      {etiquetaDeCobro(metodo)}
                      {!enMano && <span className="text-tinta-suave"> (no rinde)</span>}
                    </td>
                    <td
                      className={`cifra border-b border-linea-fina py-2 text-right text-[0.85rem] font-medium ${
                        enMano ? "text-tinta" : "text-tinta-suave"
                      }`}
                    >
                      {formatearGuarani(Number(p.total))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="pt-2.5 text-right text-[0.85rem] text-tinta-media">
                  Efectivo rendido
                </td>
                <td className="cifra pt-2.5 text-right text-[0.95rem] font-semibold text-tinta">
                  {formatearGuarani(efectivo)}
                </td>
              </tr>
              {otros > 0 && (
                <tr>
                  <td colSpan={4} className="pt-1 text-right text-[0.85rem] text-tinta-suave">
                    Cobrado por otros medios
                  </td>
                  <td className="cifra pt-1 text-right text-[0.85rem] text-tinta-suave">
                    {formatearGuarani(otros)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </section>

        {rendicion.notas && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="mb-1 text-[0.8rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Observaciones
            </h2>
            <p className="text-[0.85rem] text-tinta">{rendicion.notas}</p>
          </section>
        )}

        {/* Las firmas son el motivo de que esto sea papel y no una pantalla. */}
        <section className="mt-10 flex flex-wrap gap-8 break-inside-avoid print:mt-12">
          <div className="min-w-[13rem] flex-1">
            <div className="border-b border-tinta" />
            <p className="mt-1.5 text-[0.78rem] text-tinta-media">
              Entregó · {rendicion.repartidor.nombre}
            </p>
          </div>
          <div className="min-w-[13rem] flex-1">
            <div className="border-b border-tinta" />
            <p className="mt-1.5 text-[0.78rem] text-tinta-media">
              Recibió · {rendicion.recibidoPor}
            </p>
          </div>
        </section>

        <footer className="mt-6 border-t border-linea pt-3 text-[0.72rem] text-tinta-suave">
          Los montos de este comprobante son los que se registraron al cerrar la rendición.
          Generado desde TuMenuSmart.
        </footer>
      </div>
    </div>
  );
}
