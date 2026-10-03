import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Aviso, BotonEnlace, Cabecera, Entrada, Vacio, clasesBoton } from "@/components/ui";
import { diaLargo } from "@/lib/agenda";
import { formatearDuracion, nombreDeColaborador } from "@/lib/asistencia";
import { claveSumarDias, diasDeLaSemana } from "@/lib/calendario";
import {
  DIAS_MAXIMOS_REPORTE,
  MARCACIONES_MAXIMAS_PANTALLA,
  cargarReporteAsistencia,
} from "@/lib/reporte-asistencia";
import { ListadoMarcaciones } from "./ListadoMarcaciones";

export const dynamic = "force-dynamic";

/** Un dato de la franja de cifras: el número chico al lado de su rótulo, para que ocupe una sola línea. */
function Dato({ rotulo, valor, color = "text-tinta" }: { rotulo: string; valor: string | number; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-3 py-2 sm:flex-col sm:items-start sm:gap-0.5">
      <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-tinta-suave">{rotulo}</span>
      <span className={`cifra text-[1.05rem] font-semibold leading-tight ${color}`}>{valor}</span>
    </div>
  );
}

/**
 * Las marcaciones del personal: quién entró, salió a almorzar, volvió y se fue, con la foto de cada una. Por
 * defecto muestra HOY; se puede mirar otro día, una semana o un mes, y buscar a una persona por nombre. Cada turno dice
 * cuánto trabajó y lo que conviene revisar (no marcó la salida, llegó tarde, la cámara no vio su cara al marcar).
 * Lo que se ve acá se puede bajar en Excel o imprimir/guardar como PDF (mismas cifras: las arma
 * `cargarReporteAsistencia`, en un solo lugar). La pantalla es compacta a propósito: con mucho personal, lo que
 * importa es ver muchas filas de un vistazo.
 */
export default async function MarcacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; buscar?: string }>;
}) {
  await pantallaConPermiso("asistencia.gestionar");
  const sp = await searchParams;
  const db = prismaDelLocal(await idLocalActual());

  const reporte = await cargarReporteAsistencia(db, sp, MARCACIONES_MAXIMAS_PANTALLA);
  const {
    hoy,
    desde,
    hasta,
    recortado,
    unSoloDia,
    colaboradores,
    buscar,
    coincidencias,
    personaElegida,
    filas,
    resumenPorPersona,
    personasQueMarcaron,
    minutosTotales,
    tardanzas,
    paraRevisar,
    sinMarcar,
    hayMas,
  } = reporte;

  const semana = diasDeLaSemana(hoy);
  const atajos: { texto: string; desde: string; hasta: string }[] = [
    { texto: "Hoy", desde: hoy, hasta: hoy },
    { texto: "Ayer", desde: claveSumarDias(hoy, -1), hasta: claveSumarDias(hoy, -1) },
    { texto: "Semana", desde: semana[0], hasta: semana[6] },
    { texto: "Mes", desde: `${hoy.slice(0, 8)}01`, hasta: hoy },
  ];
  const parteBuscar = buscar ? `&buscar=${encodeURIComponent(buscar)}` : "";
  const adonde = (d: string, h: string) => `/admin/asistencia?desde=${d}&hasta=${h}${parteBuscar}`;

  // Excel y PDF: lo mismo que se está viendo (el mismo período y la misma búsqueda).
  const consulta = `desde=${desde}&hasta=${hasta}${parteBuscar}`;
  const urlExcel = `/admin/asistencia/exportar?${consulta}`;
  const urlImprimir = `/admin/asistencia/imprimir?${consulta}`;

  return (
    <div className="flex flex-col gap-2.5">
      <Cabecera
        compacta
        titulo="Marcaciones"
        bajada="Quién entró, salió a almorzar, volvió y se fue. Tocá una hora para ver la foto y compararla con la selfie del alta."
        acciones={
          <>
            {/* Verde: sacar el reporte a un archivo (Excel). Azul: lleva a otra pantalla — el PDF se imprime/guarda
                desde ahí con el botón del navegador, mismo criterio que el reporte de personal. */}
            {filas.length > 0 && (
              <>
                <a href={urlExcel} className={clasesBoton("exito", "sm")}>
                  Descargar Excel
                </a>
                <a href={urlImprimir} target="_blank" rel="noopener noreferrer" className={clasesBoton("navegar", "sm")}>
                  Ver reporte / PDF
                </a>
              </>
            )}
            <BotonEnlace href="/admin/asistencia/colaboradores" tono="navegar" tam="sm">
              Colaboradores
            </BotonEnlace>
            <BotonEnlace href="/admin/asistencia/celular" tono="navegar" tam="sm">
              Celular fijo
            </BotonEnlace>
          </>
        }
      />

      {/* ---------- período y búsqueda, en una sola franja ---------- */}
      <div className="campos-grises flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border-2 border-azul/50 bg-superficie p-2.5">
        <div className="flex flex-wrap gap-1.5">
          {atajos.map((a) => {
            const activo = a.desde === desde && a.hasta === hasta;
            return (
              <Link
                key={a.texto}
                href={adonde(a.desde, a.hasta)}
                className={activo ? clasesBoton("principal", "sm") : clasesBoton("suave", "sm")}
              >
                {a.texto}
              </Link>
            );
          })}
        </div>
        <form method="get" className="flex flex-1 flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-0.5 block text-[0.7rem] font-semibold text-tinta-suave">Desde</span>
            <Entrada type="date" name="desde" defaultValue={desde} max={hoy} style={{ height: "2rem", fontSize: "0.82rem" }} />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[0.7rem] font-semibold text-tinta-suave">Hasta</span>
            <Entrada type="date" name="hasta" defaultValue={hasta} max={hoy} style={{ height: "2rem", fontSize: "0.82rem" }} />
          </label>
          {/* El buscador: escribís parte del nombre (o el cargo) y sugiere a quienes coinciden. */}
          <label className="block min-w-[11rem] flex-1 sm:max-w-xs">
            <span className="mb-0.5 block text-[0.7rem] font-semibold text-tinta-suave">Buscar colaborador</span>
            <Entrada
              type="search"
              name="buscar"
              defaultValue={buscar}
              list="colaboradores-asistencia"
              placeholder="Nombre o cargo"
              autoComplete="off"
              style={{ height: "2rem", fontSize: "0.82rem" }}
            />
            <datalist id="colaboradores-asistencia">
              {colaboradores.map((c) => (
                <option key={c.id} value={nombreDeColaborador(c)}>
                  {c.cargo ?? ""}
                </option>
              ))}
            </datalist>
          </label>
          <button type="submit" className={clasesBoton("principal", "sm")}>
            Ver
          </button>
          {buscar && (
            <Link href={`/admin/asistencia?desde=${desde}&hasta=${hasta}`} className={clasesBoton("fantasma", "sm")}>
              Quitar búsqueda
            </Link>
          )}
        </form>
      </div>

      {recortado && (
        <p className="text-[0.76rem] text-aviso">Se miran como máximo {DIAS_MAXIMOS_REPORTE} días de una vez.</p>
      )}
      {hayMas && (
        <Aviso titulo="Hay más marcaciones de las que se muestran" color="aviso">
          Se muestran las primeras {MARCACIONES_MAXIMAS_PANTALLA}. Acotá el período para ver todo (el Excel trae más).
        </Aviso>
      )}

      {colaboradores.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste a nadie"
          detalle="Primero dá de alta a las personas que van a marcar (con su selfie y su PIN) y después activá el celular fijo."
          accion={
            <BotonEnlace href="/admin/asistencia/colaboradores" tono="nuevo" tam="md">
              Cargar colaboradores
            </BotonEnlace>
          }
        />
      ) : buscar && coincidencias === 0 ? (
        <Vacio titulo={`Nadie coincide con “${buscar}”`} detalle="Probá con otra parte del nombre, o con el cargo." />
      ) : (
        <>
          {/* ---------- cifras: una sola franja ---------- */}
          <div className="grid grid-cols-2 divide-x divide-linea overflow-hidden rounded-xl border border-linea bg-superficie sm:grid-cols-4">
            <Dato rotulo={personaElegida ? "Persona" : "Personas"} valor={personaElegida ? nombreDeColaborador(personaElegida) : personasQueMarcaron} />
            <Dato rotulo="Horas trabajadas" valor={formatearDuracion(minutosTotales)} />
            <Dato rotulo="Llegadas tarde" valor={tardanzas} color={tardanzas > 0 ? "text-aviso" : "text-tinta"} />
            <Dato rotulo="Para revisar" valor={paraRevisar} color={paraRevisar > 0 ? "text-peligro" : "text-tinta"} />
          </div>

          <p className="text-[0.78rem] text-tinta-media">
            <strong className="text-tinta">{unSoloDia ? diaLargo(desde) : `${diaLargo(desde)} – ${diaLargo(hasta)}`}</strong>
            {" · "}
            {filas.length} {filas.length === 1 ? "turno" : "turnos"}
            {buscar && !personaElegida && ` · ${coincidencias} personas coinciden con “${buscar}”`}
          </p>

          {sinMarcar.length > 0 && (
            <p className="rounded-lg border border-aviso/25 bg-aviso-luz px-3 py-1.5 text-[0.78rem] leading-snug text-aviso">
              <strong>{desde === hoy ? "Todavía no marcaron hoy" : "No marcaron ese día"}:</strong>{" "}
              {sinMarcar.map((c) => nombreDeColaborador(c)).join(" · ")}
            </p>
          )}

          {/* ---------- resumen por persona (varios días, varias personas): tabla chica con scroll ---------- */}
          {!unSoloDia && resumenPorPersona.length > 1 && (
            <details className="group rounded-xl border-2 border-azul/50 bg-superficie">
              <summary className="cursor-pointer select-none list-none px-3 py-2 text-[0.82rem] font-semibold text-azul-oscuro">
                Resumen por persona ({resumenPorPersona.length})
                <span className="ml-1.5 font-normal text-tinta-suave group-open:hidden">· tocá para ver</span>
              </summary>
              <div className="max-h-64 overflow-y-auto border-t border-linea">
                <table className="w-full border-collapse text-left text-[0.8rem]">
                  <thead className="sticky top-0 bg-papel-suave text-[0.68rem] uppercase tracking-wide text-tinta-suave">
                    <tr>
                      <th className="px-3 py-1.5 font-semibold">Colaborador</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Días</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Trabajado</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Tarde</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Revisar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenPorPersona.map((r) => (
                      <tr key={r.persona.id} className="border-t border-linea-fina">
                        <td className="px-3 py-1 font-medium text-tinta">{nombreDeColaborador(r.persona)}</td>
                        <td className="cifra px-3 py-1 text-right text-tinta-media">{r.dias}</td>
                        <td className="cifra px-3 py-1 text-right font-semibold text-tinta">{formatearDuracion(r.minutos)}</td>
                        <td className={`cifra px-3 py-1 text-right ${r.tardanzas > 0 ? "font-semibold text-aviso" : "text-tinta-media"}`}>
                          {r.tardanzas}
                        </td>
                        <td className={`cifra px-3 py-1 text-right ${r.pendientes > 0 ? "font-semibold text-peligro" : "text-tinta-media"}`}>
                          {r.pendientes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* ---------- el detalle ---------- */}
          {filas.length === 0 ? (
            <Vacio
              titulo="No hay marcaciones en este período"
              detalle="Cuando alguien marque en el celular fijo, aparece acá enseguida."
            />
          ) : (
            <ListadoMarcaciones filas={filas} />
          )}
        </>
      )}
    </div>
  );
}
