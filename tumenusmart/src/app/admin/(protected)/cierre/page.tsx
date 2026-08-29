import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { Cabecera, Tarjeta, Vacio } from "@/components/ui";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { resumirCierre, etiquetaDeCobro, rindeEfectivo } from "@/lib/rendicion";
import { CerrarBoton } from "./CerrarBoton";

export const dynamic = "force-dynamic";

function cuando(fecha: Date): string {
  return fecha.toLocaleString("es-PY", {
    timeZone: ZONA_NEGOCIO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CierrePage() {
  await pantallaConPermiso("rendiciones.gestionar");
  const db = prismaDelLocal(await idLocalActual());

  const [repartidores, ultimas] = await Promise.all([
    db.repartidor.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        orders: {
          // Entregados y todavía sin rendir: exactamente lo que debe.
          where: { estado: "entregado", rendicionId: null },
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
    db.rendicion.findMany({
      orderBy: { creadoEn: "desc" },
      take: 8,
      select: {
        id: true,
        creadoEn: true,
        cantidadPedidos: true,
        totalEfectivo: true,
        recibidoPor: true,
        notas: true,
        repartidor: { select: { nombre: true } },
      },
    }),
  ]);

  const conDeuda = repartidores.filter((r) => r.orders.length > 0);
  const efectivoEnLaCalle = conDeuda.reduce(
    (suma, r) => suma + resumirCierre(r.orders).efectivo,
    0
  );

  return (
    <div>
      <Cabecera
        titulo="Cierre de repartidores"
        bajada="Lo que cada uno tiene que rendir cuando vuelve. Solo cuenta el efectivo: lo de tarjeta y transferencia ya entró al negocio."
      />

      {conDeuda.length === 0 ? (
        <Vacio
          titulo="Nadie tiene nada pendiente"
          detalle="Cuando un repartidor marque una entrega, va a aparecer acá con lo que tiene que rendir."
        />
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-aviso/25 bg-aviso-luz p-4 print:hidden">
            <p className="text-[0.85rem] text-tinta-media">
              Efectivo en la calle ahora mismo
            </p>
            <p className="cifra mt-0.5 text-[1.6rem] font-semibold text-aviso">
              {formatearGuarani(efectivoEnLaCalle)}
            </p>
            <p className="mt-1 text-[0.82rem] text-tinta-media">
              Repartido entre {conDeuda.length}{" "}
              {conDeuda.length === 1 ? "repartidor" : "repartidores"}.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {conDeuda.map((r) => {
              const resumen = resumirCierre(r.orders);
              return (
                <Tarjeta key={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[1.05rem] font-semibold tracking-titular text-tinta">
                        {r.nombre}
                      </h2>
                      <p className="text-[0.8rem] text-tinta-media">
                        {resumen.cantidad}{" "}
                        {resumen.cantidad === 1 ? "entrega" : "entregas"} sin rendir
                      </p>
                    </div>

                    {/* El número grande es UNO solo: lo que tiene que poner
                        sobre el mostrador. Todo lo demás es contexto. */}
                    <div className="text-right">
                      <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-tinta-media">
                        Te tiene que rendir
                      </p>
                      <p className="cifra text-[1.7rem] font-semibold leading-tight text-exito">
                        {formatearGuarani(resumen.efectivo)}
                      </p>
                      {resumen.otros > 0 && (
                        <p className="text-[0.78rem] text-tinta-suave">
                          + {formatearGuarani(resumen.otros)} que no trae él
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[26rem] text-[0.85rem]">
                      <thead>
                        <tr className="border-b border-linea text-left text-[0.72rem] uppercase tracking-[0.12em] text-tinta-suave">
                          <th className="py-1.5 pr-2 font-semibold">Pedido</th>
                          <th className="py-1.5 pr-2 font-semibold">Cliente</th>
                          <th className="py-1.5 pr-2 font-semibold">Entregó</th>
                          <th className="py-1.5 pr-2 font-semibold">Cobró con</th>
                          <th className="py-1.5 text-right font-semibold">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.orders.map((p) => {
                          const metodo = p.cobroMetodo ?? "efectivo";
                          const enMano = rindeEfectivo(metodo);
                          return (
                            <tr key={p.id} className="border-b border-linea-fina">
                              <td className="cifra py-2 pr-2 font-medium text-tinta">
                                {formatearNumero(p.numero)}
                              </td>
                              <td className="py-2 pr-2 text-tinta-media">{p.clienteNombre}</td>
                              <td className="py-2 pr-2 text-tinta-suave">
                                {p.entregadoEn ? cuando(p.entregadoEn) : "—"}
                              </td>
                              <td className="py-2 pr-2">
                                {/* El efectivo se marca en color y el resto no:
                                    de un vistazo se ve qué filas suman al
                                    número grande y cuáles no. */}
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[0.78rem] font-medium ${
                                    enMano
                                      ? "bg-exito-tinte text-exito"
                                      : "bg-papel-hundido text-tinta-media"
                                  }`}
                                >
                                  {etiquetaDeCobro(metodo)}
                                </span>
                              </td>
                              <td
                                className={`cifra py-2 text-right font-medium ${
                                  enMano ? "text-tinta" : "text-tinta-suave"
                                }`}
                              >
                                {formatearGuarani(Number(p.total))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {resumen.porMetodo.length > 1 && (
                    <p className="mt-2 text-[0.8rem] text-tinta-media">
                      {resumen.porMetodo
                        .map(
                          (m) =>
                            `${m.etiqueta}: ${m.cantidad} · ${formatearGuarani(m.monto)}`
                        )
                        .join("   ·   ")}
                    </p>
                  )}

                  <div className="mt-3 print:hidden">
                    <CerrarBoton
                      repartidorId={r.id}
                      nombre={r.nombre}
                      efectivo={resumen.efectivo}
                      cantidad={resumen.cantidad}
                    />
                  </div>
                </Tarjeta>
              );
            })}
          </div>
        </>
      )}

      {ultimas.length > 0 && (
        <div className="mt-8 print:hidden">
          <h2 className="mb-2 text-[0.95rem] font-semibold tracking-titular text-tinta">
            Últimas rendiciones recibidas
          </h2>
          <div className="flex flex-col gap-1.5">
            {ultimas.map((v) => (
              <div
                key={v.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-[0.85rem]"
              >
                <span className="font-medium text-tinta">{v.repartidor.nombre}</span>
                <span className="text-tinta-suave">
                  {cuando(v.creadoEn)} · {v.cantidadPedidos}{" "}
                  {v.cantidadPedidos === 1 ? "pedido" : "pedidos"} · recibió {v.recibidoPor}
                </span>
                <span className="cifra font-semibold text-exito">
                  {formatearGuarani(Number(v.totalEfectivo))}
                </span>
                {v.notas && (
                  <span className="w-full text-[0.8rem] text-tinta-media">↳ {v.notas}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
