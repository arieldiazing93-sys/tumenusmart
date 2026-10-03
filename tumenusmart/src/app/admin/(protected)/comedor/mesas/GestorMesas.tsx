"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Pastilla, Vacio, clasesBoton } from "@/components/ui";
import { claveDeMesa } from "@/lib/comedor";
import { agregarMesa, alternarMesa, crearMesasPorCantidad, eliminarMesa, renombrarMesa, type ResultadoMesas } from "./actions";

type MesaFila = { id: string; nombre: string; activa: boolean };

/**
 * Las mesas del salón, en bloques: cargar todas por cantidad, agregar una con nombre, y la lista para renombrar, desactivar
 * o eliminar. Con al menos una mesa cargada, el mozo ya no escribe la mesa: la elige de la lista.
 */
export function GestorMesas({ mesas, mesasOcupadas }: { mesas: MesaFila[]; mesasOcupadas: string[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [cantidad, setCantidad] = useState("");
  const [nombreNueva, setNombreNueva] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const clavesOcupadas = new Set(mesasOcupadas.map((m) => claveDeMesa(m)));
  const ocupada = (m: MesaFila) => clavesOcupadas.has(claveDeMesa(m.nombre));

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

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 lg:grid-cols-2">
        {/* ------------------------------------------------------- bloque 1: por cantidad */}
        <section className="rounded-xl border-2 border-azul/50 bg-superficie p-4">
          <h2 className="text-[0.95rem] font-semibold text-tinta">Cargar todas las mesas de una vez</h2>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Escribí cuántas mesas tiene el salón y se crean la 1, la 2, la 3… hasta ese número. Si ya cargaste algunas, solo
            se agregan las que faltan.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Campo etiqueta="Cantidad de mesas">
                <Entrada
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  placeholder="Ej: 20"
                />
              </Campo>
            </div>
            <button
              type="button"
              disabled={pendiente || !cantidad.trim()}
              onClick={() => ejecutar(() => crearMesasPorCantidad(Number(cantidad)), () => setCantidad(""))}
              className={clasesBoton("nuevo", "md")}
            >
              Crear mesas
            </button>
          </div>
        </section>

        {/* ------------------------------------------------------- bloque 2: con nombre */}
        <section className="rounded-xl border-2 border-azul/50 bg-superficie p-4">
          <h2 className="text-[0.95rem] font-semibold text-tinta">Agregar una mesa con nombre</h2>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Para las que no son un número: “Terraza 1”, “Barra”, “Salón VIP”. Hasta 20 letras.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              <Campo etiqueta="Nombre de la mesa">
                <Entrada
                  value={nombreNueva}
                  onChange={(e) => setNombreNueva(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nombreNueva.trim() && !pendiente) {
                      ejecutar(() => agregarMesa(nombreNueva), () => setNombreNueva(""));
                    }
                  }}
                  maxLength={20}
                  placeholder="Ej: Terraza 1"
                />
              </Campo>
            </div>
            <button
              type="button"
              disabled={pendiente || !nombreNueva.trim()}
              onClick={() => ejecutar(() => agregarMesa(nombreNueva), () => setNombreNueva(""))}
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
      {mesas.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste ninguna mesa"
          detalle="Mientras no haya mesas cargadas, el mozo escribe el número o el nombre de la mesa. Cuando cargues al menos una, la elige de una lista."
        />
      ) : (
        <section className="rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            {mesas.length} {mesas.length === 1 ? "mesa" : "mesas"} · {mesas.filter((m) => m.activa).length} activas
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {mesas.map((m) => (
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
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
