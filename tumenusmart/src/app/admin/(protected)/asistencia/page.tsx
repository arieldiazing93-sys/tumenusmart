import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Aviso, BotonEnlace, Cabecera, Cifra, Entrada, Selector, Tarjeta, Vacio, clasesBoton } from "@/components/ui";
import { diaLargo, parsearFecha } from "@/lib/agenda";
import {
  armarTurnos,
  formatearDuracion,
  nombreDeColaborador,
  type CeldaMarca,
  type FilaAsistencia,
  type TipoMarcacion,
} from "@/lib/asistencia";
import { claveSumarDias, diasDeLaSemana } from "@/lib/calendario";
import { claveDiaAsuncion, horaAsuncion } from "@/lib/timezone";
import { ListadoMarcaciones } from "./ListadoMarcaciones";

export const dynamic = "force-dynamic";

/** Cuántos días como máximo se miran de una vez (el reporte arma todo en memoria). */
const DIAS_MAXIMOS = 62;
/** Tope de marcaciones que se traen: con 25 personas y 4 marcas por día, 62 días son ~6.200. */
const MARCACIONES_MAXIMAS = 7000;

function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function celdaDe(m: {
  id: string;
  fecha: Date;
  fotoUrl: string | null;
  verificada: boolean;
  tardanzaMin: number | null;
}): CeldaMarca {
  return {
    id: m.id,
    hora: horaAsuncion(m.fecha),
    fotoUrl: m.fotoUrl,
    verificada: m.verificada,
    tardanzaMin: m.tardanzaMin,
  };
}

/**
 * Las marcaciones del personal: quién entró, salió a almorzar, volvió y se fue, con la foto de cada una. Por
 * defecto muestra HOY; se puede mirar otro día, una semana o un mes, y filtrar por persona. Cada turno dice
 * cuánto trabajó y lo que conviene revisar (no marcó la salida, llegó tarde, la cámara no vio su cara al marcar).
 */
export default async function MarcacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; colaborador?: string }>;
}) {
  await pantallaConPermiso("asistencia.gestionar");
  const sp = await searchParams;
  const db = prismaDelLocal(await idLocalActual());

  const hoy = claveDiaAsuncion(new Date());
  let desde = parsearFecha(sp.desde, hoy);
  let hasta = parsearFecha(sp.hasta, hoy);
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const recortado = diasEntre(desde, hasta) + 1 > DIAS_MAXIMOS;
  if (recortado) desde = claveSumarDias(hasta, -(DIAS_MAXIMOS - 1));

  const colaboradores = await db.colaborador.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }, { createdAt: "asc" }],
    select: { id: true, nombre: true, apellido: true, cargo: true, fotoUrl: true, activo: true },
  });
  const filtroId = colaboradores.some((c) => c.id === sp.colaborador) ? (sp.colaborador as string) : "";

  const marcas = await db.marcacionAsistencia.findMany({
    where: { dia: { gte: desde, lte: hasta }, ...(filtroId ? { colaboradorId: filtroId } : {}) },
    orderBy: { fecha: "asc" },
    take: MARCACIONES_MAXIMAS,
    select: {
      id: true,
      colaboradorId: true,
      tipo: true,
      dia: true,
      fecha: true,
      fotoUrl: true,
      verificada: true,
      tardanzaMin: true,
    },
  });
  const hayMas = marcas.length >= MARCACIONES_MAXIMAS;

  // Las marcaciones de cada persona en cada día, para armar sus turnos.
  const porPersonaYDia = new Map<string, typeof marcas>();
  for (const m of marcas) {
    const clave = `${m.colaboradorId}|${m.dia}`;
    const lista = porPersonaYDia.get(clave);
    if (lista) lista.push(m);
    else porPersonaYDia.set(clave, [m]);
  }

  const personaDe = new Map(colaboradores.map((c) => [c.id, c]));
  const filas: FilaAsistencia[] = [];
  const resumen = new Map<string, { dias: Set<string>; minutos: number; tardanzas: number; pendientes: number }>();
  let minutosTotales = 0;

  for (const [clave, lista] of porPersonaYDia) {
    const [colaboradorId, dia] = clave.split("|");
    const persona = personaDe.get(colaboradorId);
    if (!persona) continue;
    const turnos = armarTurnos(lista, dia, hoy);

    const acumulado = resumen.get(colaboradorId) ?? { dias: new Set<string>(), minutos: 0, tardanzas: 0, pendientes: 0 };
    acumulado.dias.add(dia);

    turnos.forEach((t, n) => {
      const celdas: Record<TipoMarcacion, CeldaMarca | null> = {
        entrada: t.entrada ? celdaDe(t.entrada) : null,
        salida_almuerzo: t.salidaAlmuerzo ? celdaDe(t.salidaAlmuerzo) : null,
        vuelta_almuerzo: t.vueltaAlmuerzo ? celdaDe(t.vueltaAlmuerzo) : null,
        salida: t.salida ? celdaDe(t.salida) : null,
      };
      const avisos = [...t.avisos];
      filas.push({
        clave: `${clave}|${n}`,
        dia,
        diaTexto: diaLargo(dia),
        colaboradorId,
        nombre: nombreDeColaborador(persona),
        cargo: persona.cargo,
        fotoAlta: persona.fotoUrl,
        celdas,
        trabajado: formatearDuracion(t.minutosTrabajados),
        almuerzo: formatearDuracion(t.minutosAlmuerzo),
        estado: t.estado,
        avisos,
      });
      if (t.minutosTrabajados !== null) {
        acumulado.minutos += t.minutosTrabajados;
        minutosTotales += t.minutosTrabajados;
      }
      if (t.tardanzaMin !== null && t.tardanzaMin > 0) acumulado.tardanzas += 1;
      if (avisos.some((a) => !a.startsWith("Llegó"))) acumulado.pendientes += 1;
    });
    resumen.set(colaboradorId, acumulado);
  }

  // Lo más reciente primero; el mismo día, por nombre y por hora de entrada.
  filas.sort((a, b) => {
    if (a.dia !== b.dia) return a.dia < b.dia ? 1 : -1;
    if (a.nombre !== b.nombre) return a.nombre.localeCompare(b.nombre, "es");
    return (a.celdas.entrada?.hora ?? "").localeCompare(b.celdas.entrada?.hora ?? "");
  });

  const tardanzas = filas.filter((f) => f.celdas.entrada && f.avisos.some((a) => a.startsWith("Llegó"))).length;
  const paraRevisar = filas.filter((f) => f.avisos.some((a) => !a.startsWith("Llegó"))).length;

  // Un solo día: quiénes todavía no marcaron (o no marcaron ese día).
  const unSoloDia = desde === hasta;
  const conMarcas = new Set(filas.map((f) => f.colaboradorId));
  const sinMarcar = unSoloDia && !filtroId ? colaboradores.filter((c) => c.activo && !conMarcas.has(c.id)) : [];

  const semana = diasDeLaSemana(hoy);
  const atajos: { texto: string; desde: string; hasta: string }[] = [
    { texto: "Hoy", desde: hoy, hasta: hoy },
    { texto: "Ayer", desde: claveSumarDias(hoy, -1), hasta: claveSumarDias(hoy, -1) },
    { texto: "Esta semana", desde: semana[0], hasta: semana[6] },
    { texto: "Este mes", desde: `${hoy.slice(0, 8)}01`, hasta: hoy },
  ];
  const adonde = (d: string, h: string) =>
    `/admin/asistencia?desde=${d}&hasta=${h}${filtroId ? `&colaborador=${filtroId}` : ""}`;

  const resumenPorPersona = [...resumen.entries()]
    .map(([id, r]) => ({ persona: personaDe.get(id), ...r }))
    .filter((r) => r.persona)
    .sort((a, b) => nombreDeColaborador(a.persona!).localeCompare(nombreDeColaborador(b.persona!), "es"));

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Marcaciones"
        bajada="Quién entró, salió a almorzar, volvió y se fue, con la foto de cada marcación. Tocá una hora para ver la foto y compararla con la selfie del alta."
        acciones={
          <>
            <BotonEnlace href="/admin/asistencia/colaboradores" tono="navegar" tam="md">
              Colaboradores
            </BotonEnlace>
            <BotonEnlace href="/admin/asistencia/celular" tono="navegar" tam="md">
              Celular fijo
            </BotonEnlace>
          </>
        }
      />

      {/* ---------- período y persona ---------- */}
      <Tarjeta className="campos-grises flex flex-col gap-3 !border-2 !border-azul/50">
        <div className="flex flex-wrap gap-2">
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
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-[0.78rem] font-semibold text-tinta">Desde</span>
            <Entrada type="date" name="desde" defaultValue={desde} max={hoy} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.78rem] font-semibold text-tinta">Hasta</span>
            <Entrada type="date" name="hasta" defaultValue={hasta} max={hoy} />
          </label>
          <label className="block min-w-[11rem]">
            <span className="mb-1 block text-[0.78rem] font-semibold text-tinta">Persona</span>
            <Selector name="colaborador" defaultValue={filtroId}>
              <option value="">Todas</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {nombreDeColaborador(c)}
                  {c.activo ? "" : " (inactivo)"}
                </option>
              ))}
            </Selector>
          </label>
          <button type="submit" className={clasesBoton("principal", "md")}>
            Ver
          </button>
        </form>
        <p className="text-[0.8rem] text-tinta-media">
          Mostrando <strong className="text-tinta">{unSoloDia ? diaLargo(desde) : `${diaLargo(desde)} – ${diaLargo(hasta)}`}</strong>
          {recortado && ` (se miran como máximo ${DIAS_MAXIMOS} días de una vez)`}.
        </p>
      </Tarjeta>

      {hayMas && (
        <Aviso titulo="Hay más marcaciones de las que se muestran" color="aviso">
          Se muestran las primeras {MARCACIONES_MAXIMAS}. Acotá el período para ver todo.
        </Aviso>
      )}

      {colaboradores.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste a nadie"
          detalle="Primero dá de alta a las personas que van a marcar (con su selfie y su PIN) y después activá el celular fijo."
          accion={
            <BotonEnlace href="/admin/asistencia/colaboradores" tono="principal" tam="md">
              Cargar colaboradores
            </BotonEnlace>
          }
        />
      ) : (
        <>
          {/* ---------- cifras ---------- */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra valor={conMarcas.size} rotulo="Personas que marcaron" />
            <Cifra valor={formatearDuracion(minutosTotales)} rotulo="Horas trabajadas" detalle="Sin contar el almuerzo" />
            <Cifra valor={tardanzas} rotulo="Llegadas tarde" detalle="Pasada la tolerancia" />
            <Cifra valor={paraRevisar} rotulo="Para revisar" detalle="Sin salida, sin vuelta o sin cara" />
          </div>

          {sinMarcar.length > 0 && (
            <Aviso titulo={desde === hoy ? "Todavía no marcaron hoy" : "No marcaron ese día"} color="aviso">
              {sinMarcar.map((c) => nombreDeColaborador(c)).join(" · ")}
            </Aviso>
          )}

          {/* ---------- resumen por persona (varios días) ---------- */}
          {!unSoloDia && resumenPorPersona.length > 0 && (
            <Tarjeta className="flex flex-col gap-2 !border-2 !border-azul/50">
              <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Resumen por persona</h2>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {resumenPorPersona.map((r) => (
                  <li key={r.persona!.id} className="rounded-lg border border-linea bg-papel-suave px-3 py-2.5">
                    <p className="truncate text-[0.9rem] font-semibold text-tinta">{nombreDeColaborador(r.persona!)}</p>
                    <p className="mt-0.5 text-[0.8rem] text-tinta-media">
                      <span className="cifra font-semibold text-tinta">{formatearDuracion(r.minutos)}</span> en {r.dias.size}{" "}
                      {r.dias.size === 1 ? "día" : "días"}
                    </p>
                    <p className="mt-0.5 text-[0.76rem] text-tinta-suave">
                      {r.tardanzas} {r.tardanzas === 1 ? "llegada tarde" : "llegadas tarde"} · {r.pendientes} para revisar
                    </p>
                  </li>
                ))}
              </ul>
            </Tarjeta>
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
