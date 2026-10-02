import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { ETIQUETA_TIPO_CORTA, formatearDuracion, nombreDeColaborador, type EstadoTurno } from "@/lib/asistencia";
import { diaEnTexto } from "@/lib/rango-dias";
import { MARCACIONES_MAXIMAS_PANTALLA, cargarReporteAsistencia } from "@/lib/reporte-asistencia";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

const TEXTO_ESTADO: Record<EstadoTurno, string> = {
  completo: "Completo",
  en_curso: "En el trabajo",
  incompleto: "Incompleto",
};

function hora(celda: { hora: string } | null): string {
  return celda ? celda.hora : "—";
}

/**
 * Versión imprimible de Marcaciones — "Imprimir / Guardar como PDF" desde el navegador, mismo mecanismo que Estadísticas
 * y el reporte de personal. Trae lo mismo que se ve en pantalla y que el Excel (con la misma función,
 * `cargarReporteAsistencia`), acomodado en tablas simples y en hoja apaisada para que entren las cuatro horas.
 */
export default async function ImprimirAsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; buscar?: string }>;
}) {
  await pantallaConPermiso("asistencia.gestionar");
  const sp = await searchParams;
  const db = prismaDelLocal(await idLocalActual());

  const [reporte, local] = await Promise.all([
    cargarReporteAsistencia(db, sp, MARCACIONES_MAXIMAS_PANTALLA),
    localActual(),
  ]);
  const {
    desde,
    hasta,
    buscar,
    personaElegida,
    resumenPorPersona,
    personasQueMarcaron,
    minutosTotales,
    tardanzas,
    paraRevisar,
    hayMas,
  } = reporte;
  // En papel va en orden cronológico (de lo más viejo a lo más nuevo), que es como se lee un reporte.
  const filas = [...reporte.filas].sort((a, b) => {
    if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
    if (a.nombre !== b.nombre) return a.nombre.localeCompare(b.nombre, "es");
    return (a.celdas.entrada?.hora ?? "").localeCompare(b.celdas.entrada?.hora ?? "");
  });

  const textoPeriodo = desde === hasta ? diaEnTexto(desde) : `${diaEnTexto(desde)} – ${diaEnTexto(hasta)}`;
  const quien = personaElegida
    ? nombreDeColaborador(personaElegida)
    : buscar
      ? `Búsqueda: ${buscar}`
      : "Todo el personal";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      {/* Hoja apaisada: con cuatro horas, el trabajado y las observaciones, a lo ancho se lee mejor. */}
      <style>{"@media print { @page { size: A4 landscape; margin: 10mm; } }"}</style>

      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-6 flex items-center gap-4 border-b border-linea pb-5">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-16 w-16 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre}</h1>
          <p className="mt-1 text-sm text-tinta-media">Reporte de asistencia — {quien}</p>
          <p className="text-sm text-tinta-media">Período: {textoPeriodo}</p>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay marcaciones en este período.</p>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-4 gap-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Personas que marcaron</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{personasQueMarcaron}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Horas trabajadas</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{formatearDuracion(minutosTotales)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Llegadas tarde</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{tardanzas}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-tinta-media">Para revisar</dt>
              <dd className="mt-0.5 text-lg font-semibold text-tinta">{paraRevisar}</dd>
            </div>
          </dl>

          {!personaElegida && resumenPorPersona.length > 0 && (
            <>
              <h2 className="mb-2 font-semibold text-tinta">Por persona</h2>
              <table className="mb-8 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Colaborador</th>
                    <th className="py-1.5 text-right">Días</th>
                    <th className="py-1.5 text-right">Trabajado</th>
                    <th className="py-1.5 text-right">Llegadas tarde</th>
                    <th className="py-1.5 text-right">Para revisar</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenPorPersona.map((r) => (
                    <tr key={r.persona.id} className="border-b border-linea-fina [break-inside:avoid]">
                      <td className="py-1.5 text-tinta">
                        {nombreDeColaborador(r.persona)}
                        {r.persona.cargo && <span className="block text-xs text-tinta-suave">{r.persona.cargo}</span>}
                      </td>
                      <td className="py-1.5 text-right text-tinta">{r.dias}</td>
                      <td className="py-1.5 text-right font-semibold text-tinta">{formatearDuracion(r.minutos)}</td>
                      <td className="py-1.5 text-right text-tinta">{r.tardanzas}</td>
                      <td className="py-1.5 text-right text-tinta">{r.pendientes}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-linea font-semibold">
                    <td className="py-2 text-tinta">TOTAL</td>
                    <td className="py-2" />
                    <td className="py-2 text-right text-tinta">{formatearDuracion(minutosTotales)}</td>
                    <td className="py-2 text-right text-tinta">{tardanzas}</td>
                    <td className="py-2 text-right text-tinta">{paraRevisar}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          <h2 className="mb-2 font-semibold text-tinta">Detalle</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                <th className="py-1.5">Día</th>
                {!personaElegida && <th className="py-1.5">Colaborador</th>}
                <th className="py-1.5">{ETIQUETA_TIPO_CORTA.entrada}</th>
                <th className="py-1.5">{ETIQUETA_TIPO_CORTA.salida_almuerzo}</th>
                <th className="py-1.5">{ETIQUETA_TIPO_CORTA.vuelta_almuerzo}</th>
                <th className="py-1.5">{ETIQUETA_TIPO_CORTA.salida}</th>
                <th className="py-1.5 text-right">Trabajado</th>
                <th className="py-1.5 pl-6">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className="border-b border-linea-fina align-top [break-inside:avoid]">
                  <td className="whitespace-nowrap py-1.5 text-tinta-media">{diaEnTexto(f.dia)}</td>
                  {!personaElegida && <td className="py-1.5 text-tinta">{f.nombre}</td>}
                  <td className="py-1.5 text-tinta">{hora(f.celdas.entrada)}</td>
                  <td className="py-1.5 text-tinta">{hora(f.celdas.salida_almuerzo)}</td>
                  <td className="py-1.5 text-tinta">{hora(f.celdas.vuelta_almuerzo)}</td>
                  <td className="py-1.5 text-tinta">{hora(f.celdas.salida)}</td>
                  <td className="whitespace-nowrap py-1.5 text-right font-semibold text-tinta">{f.trabajado}</td>
                  <td className="py-1.5 pl-6 text-tinta-media">
                    {TEXTO_ESTADO[f.estado]}
                    {f.avisos.map((a) => (
                      <span key={a} className="block text-xs text-tinta-suave">
                        {a}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-tinta-suave">
            Lo trabajado es lo que pasó entre la entrada y la salida, sin contar el almuerzo. Un turno sin salida no suma
            horas.
          </p>
          {hayMas && (
            <p className="mt-1 text-xs text-tinta-suave">
              Se listan las primeras {MARCACIONES_MAXIMAS_PANTALLA} marcaciones del período; puede faltar alguna. Para ver
              todo, acotá el período o descargá el Excel.
            </p>
          )}
        </>
      )}
    </div>
  );
}
