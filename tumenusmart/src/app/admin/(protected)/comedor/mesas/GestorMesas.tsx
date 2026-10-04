"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Pastilla, Selector, Vacio, clasesBoton } from "@/components/ui";
import { claveDeMesa } from "@/lib/comedor";
import {
  agregarMesa,
  alternarMesa,
  crearMesasPorRango,
  crearSector,
  eliminarMesa,
  eliminarSector,
  moverMesaASector,
  renombrarMesa,
  renombrarSector,
  type ResultadoMesas,
} from "./actions";

type SectorFila = { id: string; nombre: string };
type MesaFila = { id: string; nombre: string; activa: boolean; sectorId: string | null };

/**
 * Las mesas del salón, en bloques: los sectores del restaurante (Salón, Patio, Terraza), cargar mesas por rango en un sector,
 * agregar una con nombre, y la lista —agrupada por sector— para renombrar, mover de sector, desactivar o eliminar. Con al
 * menos una mesa cargada, el mozo ya no escribe la mesa: la elige de la lista (y con sectores, primero elige el sector).
 */
export function GestorMesas({
  sectores,
  mesas,
  mesasOcupadas,
}: {
  sectores: SectorFila[];
  mesas: MesaFila[];
  mesasOcupadas: string[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // sectores
  const [nombreSector, setNombreSector] = useState("");
  const [editandoSector, setEditandoSector] = useState<string | null>(null);
  const [nombreSectorEditado, setNombreSectorEditado] = useState("");

  // mesas por rango
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sectorRango, setSectorRango] = useState<string | null>(null);

  // una mesa con nombre
  const [nombreNueva, setNombreNueva] = useState("");
  const [sectorNueva, setSectorNueva] = useState<string | null>(null);

  // renombrar una mesa
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");

  const clavesOcupadas = new Set(mesasOcupadas.map((m) => claveDeMesa(m)));
  const ocupada = (m: MesaFila) => clavesOcupadas.has(claveDeMesa(m.nombre));

  // Sin elegir nada (null) se ofrece el primer sector; "" es "sin sector"; si el elegido se borró, vuelve a "sin sector".
  const sectorEfectivo = (elegido: string | null) =>
    elegido === null ? (sectores[0]?.id ?? "") : sectores.some((s) => s.id === elegido) ? elegido : "";
  const sectorDelRango = sectorEfectivo(sectorRango);
  const sectorDeLaNueva = sectorEfectivo(sectorNueva);

  /** El número que sigue al más alto de las mesas que se llaman con un número ("1", "2"…), para ofrecerlo como "desde". */
  const siguienteNumero = useMemo(() => {
    let mayor = 0;
    for (const m of mesas) {
      if (/^\d{1,4}$/.test(m.nombre)) mayor = Math.max(mayor, Number(m.nombre));
    }
    return mayor + 1;
  }, [mesas]);

  const mesasDe = (sectorId: string | null) => mesas.filter((m) => (m.sectorId ?? null) === sectorId);
  const sinSector = mesasDe(null);

  /** Corre una acción del servidor y, si salió bien, actualiza la lista. Un fallo inesperado se explica igual. */
  function ejecutar(accion: () => Promise<ResultadoMesas>, alTerminar?: () => void) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (!r.ok) {
          setError(r.error);
          return;
        }
        if (r.mensaje) setAviso(r.mensaje);
        alTerminar?.();
        router.refresh();
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  const desdeEfectivo = desde.trim() || String(siguienteNumero);

  // Estas dos son funciones que devuelven el contenido, NO componentes: un componente definido acá adentro cambiaría en cada
  // letra que se escribe y el campo de "Renombrar" perdería el foco.

  /** Una tarjeta de mesa (la misma en cada sector). */
  function tarjetaMesa(m: MesaFila) {
    return (
      <li key={m.id} className="flex flex-col gap-2 rounded-lg border-2 border-azul/50 bg-white px-3 py-2.5">
        {editando === m.id ? (
          <div className="flex flex-wrap items-center gap-2">
            <Entrada
              autoFocus
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              maxLength={20}
              className="min-w-[6rem] flex-1"
            />
            <button
              type="button"
              disabled={pendiente || !nombreEditado.trim()}
              onClick={() => ejecutar(() => renombrarMesa(m.id, nombreEditado), () => setEditando(null))}
              className={clasesBoton("navegar", "sm")}
            >
              Guardar
            </button>
            <button type="button" onClick={() => setEditando(null)} className={clasesBoton("peligro", "sm")}>
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[1rem] font-semibold text-tinta">Mesa {m.nombre}</span>
              <div className="flex flex-none items-center gap-1.5">
                {ocupada(m) && (
                  <Pastilla color="azul" punto>
                    Ocupada
                  </Pastilla>
                )}
                {m.activa ? (
                  <Pastilla color="exito" punto>
                    Activa
                  </Pastilla>
                ) : (
                  <Pastilla color="amarillo" punto>
                    Desactivada
                  </Pastilla>
                )}
              </div>
            </div>
            {sectores.length > 0 && (
              <Selector
                value={m.sectorId ?? ""}
                disabled={pendiente}
                onChange={(e) => ejecutar(() => moverMesaASector(m.id, e.target.value || null))}
                aria-label={`Sector de la mesa ${m.nombre}`}
              >
                <option value="">Sin sector</option>
                {sectores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Selector>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setEditando(m.id);
                  setNombreEditado(m.nombre);
                  setError(null);
                }}
                className={clasesBoton("navegar", "sm")}
              >
                Renombrar
              </button>
              <button
                type="button"
                disabled={pendiente}
                onClick={() => {
                  if (m.activa && ocupada(m) && !confirm(`La mesa ${m.nombre} tiene una cuenta abierta. La cuenta sigue, pero la mesa deja de ofrecerse a los mozos. ¿Desactivarla?`)) return;
                  ejecutar(() => alternarMesa(m.id, !m.activa));
                }}
                className={clasesBoton(m.activa ? "peligro" : "nuevo", "sm")}
              >
                {m.activa ? "Desactivar" : "Reactivar"}
              </button>
              <button
                type="button"
                disabled={pendiente}
                onClick={() => {
                  if (!confirm(`¿Eliminar la mesa ${m.nombre}? Las cuentas ya hechas no se tocan.`)) return;
                  ejecutar(() => eliminarMesa(m.id));
                }}
                className={clasesBoton("peligro", "sm")}
              >
                Eliminar
              </button>
            </div>
          </>
        )}
      </li>
    );
  }

  /** Un grupo de la lista: el título del sector y sus mesas. */
  function grupo(clave: string, titulo: string | null, lista: MesaFila[]) {
    // "Sin sector" solo se muestra si tiene mesas; un sector de verdad se muestra aunque esté vacío, para poder llenarlo.
    if (lista.length === 0 && (titulo === null || clave === "__sin_sector__")) return null;
    return (
      <div key={clave} className="flex flex-col gap-2">
        {titulo !== null && (
          <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            {titulo} · {lista.length} {lista.length === 1 ? "mesa" : "mesas"}
          </p>
        )}
        {lista.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linea bg-papel-suave px-3 py-3 text-[0.82rem] text-tinta-suave">
            Este sector todavía no tiene mesas. Cargalas arriba con “Cargar mesas”.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{lista.map((m) => tarjetaMesa(m))}</ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ----------------------------------------------------------- bloque 1: sectores */}
      <section className="rounded-xl border-2 border-azul/50 bg-superficie p-4">
        <h2 className="text-[0.95rem] font-semibold text-tinta">Sectores del restaurante</h2>
        <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
          Por ejemplo Salón, Patio y Terraza. El mozo elige primero el sector y ve solo las mesas que le corresponden. Si no
          creás ningún sector, el mozo ve todas las mesas juntas.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[10rem] flex-1">
            <Campo etiqueta="Nombre del sector">
              <Entrada
                value={nombreSector}
                onChange={(e) => setNombreSector(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nombreSector.trim() && !pendiente) {
                    ejecutar(() => crearSector(nombreSector), () => setNombreSector(""));
                  }
                }}
                maxLength={30}
                placeholder="Ej: Salón"
              />
            </Campo>
          </div>
          <button
            type="button"
            disabled={pendiente || !nombreSector.trim()}
            onClick={() => ejecutar(() => crearSector(nombreSector), () => setNombreSector(""))}
            className={clasesBoton("nuevo", "md")}
          >
            Agregar sector
          </button>
        </div>

        {sectores.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {sectores.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-azul/50 bg-white px-3 py-2"
              >
                {editandoSector === s.id ? (
                  <>
                    <Entrada
                      autoFocus
                      value={nombreSectorEditado}
                      onChange={(e) => setNombreSectorEditado(e.target.value)}
                      maxLength={30}
                      className="min-w-[8rem]"
                    />
                    <button
                      type="button"
                      disabled={pendiente || !nombreSectorEditado.trim()}
                      onClick={() => ejecutar(() => renombrarSector(s.id, nombreSectorEditado), () => setEditandoSector(null))}
                      className={clasesBoton("navegar", "sm")}
                    >
                      Guardar
                    </button>
                    <button type="button" onClick={() => setEditandoSector(null)} className={clasesBoton("peligro", "sm")}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[0.95rem] font-semibold text-tinta">{s.nombre}</span>
                    <span className="text-[0.78rem] text-tinta-suave">
                      {mesasDe(s.id).length} {mesasDe(s.id).length === 1 ? "mesa" : "mesas"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoSector(s.id);
                        setNombreSectorEditado(s.nombre);
                        setError(null);
                      }}
                      className={clasesBoton("navegar", "sm")}
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => {
                        const n = mesasDe(s.id).length;
                        const aviso = n > 0 ? ` Sus ${n} ${n === 1 ? "mesa no se borra" : "mesas no se borran"}: ${n === 1 ? "queda" : "quedan"} sin sector.` : "";
                        if (!confirm(`¿Eliminar el sector ${s.nombre}?${aviso}`)) return;
                        ejecutar(() => eliminarSector(s.id));
                      }}
                      className={clasesBoton("peligro", "sm")}
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ------------------------------------------------------- bloque 2: por rango */}
        <section className="rounded-xl border-2 border-azul/50 bg-superficie p-4">
          <h2 className="text-[0.95rem] font-semibold text-tinta">Cargar mesas</h2>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Elegí el sector y de qué mesa a qué mesa: por ejemplo Salón del 1 al 10 y Patio del 11 al 15. Los números no se
            repiten entre sectores para que no se confundan en la cocina y en la caja (para repetirlos, usá un nombre como
            “Patio 1”). Si una mesa ya existe, solo se pasa a ese sector.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            {sectores.length > 0 && (
              <div className="min-w-[8rem] flex-1">
                <Campo etiqueta="Sector">
                  <Selector value={sectorDelRango} onChange={(e) => setSectorRango(e.target.value)}>
                    <option value="">Sin sector</option>
                    {sectores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </div>
            )}
            <div className="w-24">
              <Campo etiqueta="Desde">
                <Entrada
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  placeholder={String(siguienteNumero)}
                />
              </Campo>
            </div>
            <div className="w-24">
              <Campo etiqueta="Hasta">
                <Entrada
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999}
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  placeholder="Ej: 10"
                />
              </Campo>
            </div>
            <button
              type="button"
              disabled={pendiente || !hasta.trim()}
              onClick={() =>
                ejecutar(
                  () => crearMesasPorRango(Number(desdeEfectivo), Number(hasta), sectorDelRango || null),
                  () => {
                    setDesde("");
                    setHasta("");
                  }
                )
              }
              className={clasesBoton("nuevo", "md")}
            >
              Crear mesas
            </button>
          </div>
        </section>

        {/* ------------------------------------------------------- bloque 3: con nombre */}
        <section className="rounded-xl border-2 border-azul/50 bg-superficie p-4">
          <h2 className="text-[0.95rem] font-semibold text-tinta">Agregar una mesa con nombre</h2>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Para las que no son un número: “Patio 1”, “Barra”, “Salón VIP”. Hasta 20 letras.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <Campo etiqueta="Nombre de la mesa">
                <Entrada
                  value={nombreNueva}
                  onChange={(e) => setNombreNueva(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nombreNueva.trim() && !pendiente) {
                      ejecutar(() => agregarMesa(nombreNueva, sectorDeLaNueva || null), () => setNombreNueva(""));
                    }
                  }}
                  maxLength={20}
                  placeholder="Ej: Patio 1"
                />
              </Campo>
            </div>
            {sectores.length > 0 && (
              <div className="min-w-[8rem]">
                <Campo etiqueta="Sector">
                  <Selector value={sectorDeLaNueva} onChange={(e) => setSectorNueva(e.target.value)}>
                    <option value="">Sin sector</option>
                    {sectores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </div>
            )}
            <button
              type="button"
              disabled={pendiente || !nombreNueva.trim()}
              onClick={() => ejecutar(() => agregarMesa(nombreNueva, sectorDeLaNueva || null), () => setNombreNueva(""))}
              className={clasesBoton("nuevo", "md")}
            >
              Agregar
            </button>
          </div>
        </section>
      </div>

      {aviso && <p className="rounded-lg bg-exito-luz px-3 py-2 text-[0.82rem] font-medium text-exito">{aviso}</p>}
      {error && <MensajeError>{error}</MensajeError>}

      {/* ------------------------------------------------------------- la lista */}
      {mesas.length === 0 && sectores.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste ninguna mesa"
          detalle="Mientras no haya mesas cargadas, el mozo escribe el número o el nombre de la mesa. Cuando cargues al menos una, la elige de una lista."
        />
      ) : (
        <section className="flex flex-col gap-4 rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
          <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            {mesas.length} {mesas.length === 1 ? "mesa" : "mesas"} · {mesas.filter((m) => m.activa).length} activas
          </p>
          {sectores.map((s) => grupo(s.id, s.nombre, mesasDe(s.id)))}
          {grupo("__sin_sector__", sectores.length > 0 ? "Sin sector" : null, sinSector)}
        </section>
      )}
    </div>
  );
}
