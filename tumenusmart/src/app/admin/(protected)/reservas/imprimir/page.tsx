import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { prisma as prismaGlobal } from "@/lib/prisma";
import { Volver } from "@/components/Volver";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";
import { SelectorDiaInforme } from "./SelectorDiaInforme";
import { claveDiaAsuncion, fechaAsuncionDesdeTexto, ZONA_NEGOCIO } from "@/lib/timezone";
import { claveSumarDias } from "@/lib/calendario";
import { TURNOS, etiquetaMotivo, etiquetaTurno } from "@/lib/reservas";

export const dynamic = "force-dynamic";

/** "Jueves 27 de agosto de 2026", que es como lo diría el encargado. */
function fechaLarga(clave: string): string {
  const fecha = fechaAsuncionDesdeTexto(clave);
  if (!fecha) return clave;
  const texto = fecha.toLocaleDateString("es-PY", {
    timeZone: ZONA_NEGOCIO,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * El informe de reservas del día, para imprimir y dejarlo en el mostrador.
 *
 * Es una hoja, no una pantalla. El encargado de turno la recibe al entrar y
 * tiene que poder trabajar con ella sin abrir el sistema: por eso lleva el
 * teléfono de cada cliente, la nota interna, y un espacio en blanco para
 * tildar a mano quién llegó. Lo que no sirve en papel —los botones, el menú—
 * desaparece al imprimir.
 */
export default async function InformeReservasPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const { dia: diaParam } = await searchParams;
  const hoyClave = claveDiaAsuncion(new Date());
  const dia = diaParam && /^\d{4}-\d{2}-\d{2}$/.test(diaParam) ? diaParam : hoyClave;

  const gte = fechaAsuncionDesdeTexto(dia)!;
  const lt = fechaAsuncionDesdeTexto(claveSumarDias(dia, 1))!;

  const [store, reservas] = await Promise.all([
    prismaGlobal.store.findUnique({
      where: { id: storeId },
      select: { nombre: true },
    }),
    // Canceladas afuera: en el mostrador solo estorban. Y solo las que el
    // cliente realmente envió por WhatsApp, igual que en el calendario.
    prisma.reservation.findMany({
      where: { fecha: { gte, lt }, enviadoWhatsapp: true, estado: { not: "cancelada" } },
      orderBy: [{ horario: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const totalPersonas = reservas.reduce((s, r) => s + r.personas, 0);

  // Agrupadas por turno, que es como se reparte el trabajo en el salón.
  const porTurno = TURNOS.map((t) => ({
    valor: t.value,
    etiqueta: etiquetaTurno(t.value),
    lista: reservas.filter((r) => r.turno === t.value),
  })).filter((g) => g.lista.length > 0);

  return (
    <div className="print:text-[11pt]">
      {/* --- lo que solo se ve en pantalla --- */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Volver href={`/admin/reservas?vista=dia&dia=${dia}`} texto="Volver a reservas" />
        <div className="flex flex-wrap items-center gap-2">
          <SelectorDiaInforme dia={dia} />
          <ImprimirBoton />
        </div>
      </div>

      {/* --- la hoja --- */}
      <div className="rounded-xl border border-linea bg-white p-6 print:rounded-none print:border-0 print:p-0">
        <header className="mb-5 border-b border-linea pb-4 print:mb-4 print:pb-3">
          <p className="rotulo">Informe de reservas</p>
          <h1 className="mt-1 text-[1.35rem] font-semibold tracking-titular text-tinta print:text-[16pt]">
            {store?.nombre ?? "Reservas"}
          </h1>
          <p className="mt-0.5 text-[0.9rem] text-tinta-media">{fechaLarga(dia)}</p>

          <p className="mt-3 text-[0.85rem] text-tinta">
            <span className="cifra font-semibold">{reservas.length}</span>{" "}
            {reservas.length === 1 ? "reserva" : "reservas"}
            <span className="mx-1.5 text-linea">·</span>
            <span className="cifra font-semibold">{totalPersonas}</span>{" "}
            {totalPersonas === 1 ? "persona" : "personas"}
          </p>
        </header>

        {reservas.length === 0 ? (
          <p className="py-10 text-center text-[0.9rem] text-tinta-suave">
            No hay reservas para este día.
          </p>
        ) : (
          porTurno.map((grupo) => (
            <section key={grupo.valor} className="mb-6 break-inside-avoid last:mb-0">
              <h2 className="mb-2 text-[0.95rem] font-semibold tracking-titular text-tinta">
                {grupo.etiqueta}
                <span className="ml-2 text-[0.8rem] font-normal text-tinta-suave">
                  {grupo.lista.length}{" "}
                  {grupo.lista.length === 1 ? "reserva" : "reservas"} ·{" "}
                  {grupo.lista.reduce((s, r) => s + r.personas, 0)} personas
                </span>
              </h2>

              <table className="w-full table-fixed border-collapse text-left">
                <thead>
                  <tr>
                    {/* La primera columna queda vacía a propósito: es el
                        casillero para tildar a mano quién llegó. */}
                    <th className="w-8 border-b border-linea pb-1.5" />
                    <th className="w-16 border-b border-linea pb-1.5 text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                      Hora
                    </th>
                    <th className="border-b border-linea pb-1.5 text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                      Cliente
                    </th>
                    <th className="w-14 border-b border-linea pb-1.5 text-center text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                      Pers.
                    </th>
                    <th className="w-32 border-b border-linea pb-1.5 text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                      Teléfono
                    </th>
                    <th className="border-b border-linea pb-1.5 text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                      Motivo y nota
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.lista.map((r) => (
                    <tr key={r.id} className="break-inside-avoid align-top">
                      <td className="border-b border-linea-fina py-2.5">
                        <span
                          aria-hidden="true"
                          className="block h-4 w-4 rounded border border-linea"
                        />
                      </td>
                      <td className="cifra border-b border-linea-fina py-2.5 text-[0.88rem] font-semibold text-tinta">
                        {r.horario}
                      </td>
                      <td className="border-b border-linea-fina py-2.5 pr-3 text-[0.88rem] font-semibold text-tinta">
                        {r.clienteNombre}
                        <span className="cifra ml-2 text-[0.72rem] font-normal text-tinta-suave">
                          #{String(r.numero).padStart(4, "0")}
                        </span>
                      </td>
                      <td className="cifra border-b border-linea-fina py-2.5 text-center text-[0.88rem] font-semibold text-tinta">
                        {r.personas}
                      </td>
                      <td className="cifra border-b border-linea-fina py-2.5 pr-3 text-[0.82rem] text-tinta-media">
                        {r.clienteTelefono}
                      </td>
                      <td className="border-b border-linea-fina py-2.5 text-[0.82rem] text-tinta-media">
                        {etiquetaMotivo(r.motivo)}
                        {r.nota?.trim() && (
                          <span className="block text-[0.8rem] text-tinta">{r.nota}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}

        <footer className="mt-6 border-t border-linea pt-3 text-[0.72rem] text-tinta-suave">
          Las reservas canceladas no figuran en este informe. Generado desde TuMenuSmart.
        </footer>
      </div>
    </div>
  );
}
