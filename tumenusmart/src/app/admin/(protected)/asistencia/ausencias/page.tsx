import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera, Entrada, clasesBoton } from "@/components/ui";
import { parsearFecha } from "@/lib/agenda";
import { nombreDeColaborador } from "@/lib/asistencia";
import { diasEntre, finDeMes } from "@/lib/ausencias";
import { claveSumarDias } from "@/lib/calendario";
import { claveDiaAsuncion } from "@/lib/timezone";
import { ListaAusencias, type RegistroFila } from "./ListaAusencias";

export const dynamic = "force-dynamic";

/** Cuántas ausencias como máximo se muestran de una vez. */
const MAXIMO_REGISTROS = 500;

/**
 * Las ausencias del personal: los días en que alguien no fue y por qué (reposo médico, avisó que no venía, vacaciones, feriado...), y
 * si ese día se le paga. Lo anotado acá es lo que evita que un día sin marcación cuente como falta sin aviso, y lo que la
 * liquidación tiene en cuenta. Por defecto muestra este mes; se pueden anotar días que todavía no llegaron (unas vacaciones).
 */
export default async function AusenciasPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("asistencia.gestionar");
  const sp = await searchParams;
  const db = prismaDelLocal(await idLocalActual());

  const hoy = claveDiaAsuncion(new Date());
  const inicioMes = `${hoy.slice(0, 8)}01`;
  let desde = parsearFecha(sp.desde, inicioMes);
  let hasta = parsearFecha(sp.hasta, finDeMes(hoy));
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const mesAnteriorFin = claveSumarDias(inicioMes, -1);
  const atajos = [
    { texto: "Este mes", desde: inicioMes, hasta: finDeMes(hoy) },
    { texto: "Mes anterior", desde: `${mesAnteriorFin.slice(0, 8)}01`, hasta: mesAnteriorFin },
    { texto: "Próximos 30 días", desde: hoy, hasta: claveSumarDias(hoy, 30) },
    { texto: "Este año", desde: `${hoy.slice(0, 4)}-01-01`, hasta: `${hoy.slice(0, 4)}-12-31` },
  ];

  const [colaboradores, registros] = await Promise.all([
    db.colaborador.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true, apellido: true, activo: true },
    }),
    db.ausenciaColaborador.findMany({
      where: { desde: { lte: hasta }, hasta: { gte: desde } },
      orderBy: [{ desde: "desc" }, { createdAt: "desc" }],
      take: MAXIMO_REGISTROS,
      select: {
        id: true,
        colaboradorId: true,
        desde: true,
        hasta: true,
        tipo: true,
        pagado: true,
        nota: true,
        creadoPor: true,
        colaborador: { select: { nombre: true, apellido: true, cargo: true } },
      },
    }),
  ]);

  const filas: RegistroFila[] = registros.map((r) => ({
    id: r.id,
    colaboradorId: r.colaboradorId,
    nombre: nombreDeColaborador(r.colaborador),
    cargo: r.colaborador.cargo,
    desde: r.desde,
    hasta: r.hasta,
    tipo: r.tipo,
    pagado: r.pagado,
    nota: r.nota,
    dias: diasEntre(r.desde, r.hasta, 400).length,
    creadoPor: r.creadoPor,
  }));
  const personas = colaboradores.map((c) => ({ id: c.id, nombre: nombreDeColaborador(c), activo: c.activo }));

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Ausencias"
        bajada="Los días que alguien no fue y por qué: reposo médico, avisó que no venía, vacaciones o un feriado. Sin esto, un día sin marcación es una falta sin aviso."
        acciones={
          <>
            <BotonEnlace href="/admin/asistencia" tono="navegar" tam="md">
              Marcaciones
            </BotonEnlace>
            <BotonEnlace href="/admin/asistencia/liquidacion" tono="navegar" tam="md">
              Liquidación
            </BotonEnlace>
          </>
        }
      />

      <div className="campos-grises flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border-2 border-azul/50 bg-superficie p-2.5">
        <div className="flex flex-wrap gap-1.5">
          {atajos.map((a) => {
            const activo = a.desde === desde && a.hasta === hasta;
            return (
              <Link
                key={a.texto}
                href={`/admin/asistencia/ausencias?desde=${a.desde}&hasta=${a.hasta}`}
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
            <Entrada type="date" name="desde" defaultValue={desde} style={{ height: "2rem", fontSize: "0.82rem" }} />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[0.7rem] font-semibold text-tinta-suave">Hasta</span>
            <Entrada type="date" name="hasta" defaultValue={hasta} style={{ height: "2rem", fontSize: "0.82rem" }} />
          </label>
          <button type="submit" className={clasesBoton("principal", "sm")}>
            Ver
          </button>
        </form>
      </div>

      {filas.length >= MAXIMO_REGISTROS && (
        <p className="text-[0.76rem] text-aviso">Se muestran las primeras {MAXIMO_REGISTROS}. Acotá el período para ver todo.</p>
      )}

      <ListaAusencias registros={filas} personas={personas} />
    </div>
  );
}
