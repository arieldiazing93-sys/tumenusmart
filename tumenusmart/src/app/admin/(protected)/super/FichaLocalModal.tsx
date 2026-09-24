"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { Campo, Entrada, Pastilla, Selector, clasesBoton } from "@/components/ui";
import { actualizarDatosLocal } from "./actions";

/**
 * Todo lo que la Cartera sabe de un local, ya formateado para mostrarse: la
 * pantalla lo arma en el servidor (fechas en hora de Asunción, montos en
 * guaraníes) y acá solo se dibuja. Nada de esto viaja de vuelta al guardar:
 * el formulario manda únicamente los campos editables.
 */
export type FichaLocal = {
  id: string;
  nombre: string;
  slug: string;
  /** Dirección completa de la carta pública, con el dominio. */
  urlCarta: string;
  /** Solo dígitos, con código de país (595981234567). */
  whatsapp: string;
  direccion: string | null;
  plan: string;
  estadoEtiqueta: string;
  estadoClase: "vencido" | "suspendido" | "por_vencer" | "al_dia" | "sin_vencimiento";
  vencimiento: string;
  alta: string;
  asesorId: string | null;
  asesorNombre: string | null;
  titularNombre: string | null;
  titularTelefono: string | null;
  razonSocial: string | null;
  ruc: string | null;
  /** Con el que entra el dueño al panel. */
  correo: string | null;
  pedidosRecientes: number;
  diasDeActividad: number;
  productos: number;
  ultimoIngreso: string;
  pagos: { fecha: string; monto: string; meses: number; cubreHasta: string; nota: string | null }[];
};

const COLOR_ESTADO = {
  vencido: "peligro",
  suspendido: "neutro",
  por_vencer: "aviso",
  al_dia: "exito",
  sin_vencimiento: "neutro",
} as const;

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-tinta-suave">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Una etiqueta chica arriba de su valor; sin valor, un guion. */
function Dato({ etiqueta, children }: { etiqueta: string; children?: ReactNode }) {
  const vacio = children === null || children === undefined || children === "";
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className="break-words text-sm text-tinta">
        {vacio ? <span className="text-tinta-suave">—</span> : children}
      </dd>
    </div>
  );
}

/**
 * La ficha de un local, en modal: se abre en modo "ver" con todos sus datos y,
 * con "Editar", los campos que se pueden corregir pasan a ser formulario; al
 * guardar vuelve al modo "ver" ya con lo nuevo.
 *
 * Mientras se edita, tocar afuera del modal no lo cierra (se perdería lo
 * escrito) y Escape solo cancela la edición, no cierra todo.
 */
export function FichaLocalModal({
  ficha,
  asesores,
  onCerrar,
}: {
  ficha: FichaLocal;
  /** Los asesores activos, para poder reasignar. */
  asesores: { id: string; nombre: string }[];
  onCerrar: () => void;
}) {
  const idTitulo = useId();
  const idFormulario = useId();
  const [pendiente, iniciar] = useTransition();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (editando) {
        setEditando(false);
        setError(null);
      } else {
        onCerrar();
      }
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [editando, onCerrar]);

  function empezarAEditar() {
    setGuardado(false);
    setError(null);
    setEditando(true);
  }

  function cancelarEdicion() {
    setEditando(false);
    setError(null);
  }

  function guardar(datos: FormData) {
    setError(null);
    iniciar(async () => {
      const resultado = await actualizarDatosLocal(ficha.id, datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      setGuardado(true);
    });
  }

  // Un asesor dado de baja no está en la lista de activos, pero este local
  // sigue teniéndolo: sin esta opción el selector arrancaría en "Sin asignar"
  // y guardar cualquier otro cambio le sacaría el asesor en silencio.
  const asesorInactivo =
    ficha.asesorId && !asesores.some((a) => a.id === ficha.asesorId)
      ? { id: ficha.asesorId, nombre: `${ficha.asesorNombre ?? "Asesor"} (inactivo)` }
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !editando) onCerrar();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-linea px-5 py-4">
          <div className="min-w-0">
            <h2 id={idTitulo} className="truncate text-lg font-semibold text-tinta">
              {ficha.nombre}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-tinta-suave">/{ficha.slug}</span>
              <Pastilla color={COLOR_ESTADO[ficha.estadoClase]}>{ficha.estadoEtiqueta}</Pastilla>
              <Pastilla>{ficha.plan}</Pastilla>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            aria-label="Cerrar"
            className="rounded-lg border border-linea px-2.5 py-1 text-sm text-tinta-media transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {editando ? (
            <form
              id={idFormulario}
              onSubmit={(e) => {
                // Sin la acción de <form> de React: esa vacía los campos al
                // terminar, y si el guardado falla se perdería lo que se escribió.
                e.preventDefault();
                guardar(new FormData(e.currentTarget));
              }}
              className="flex flex-col gap-5"
            >
              <Seccion titulo="El negocio">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Nombre del negocio">
                    <Entrada name="nombre" required defaultValue={ficha.nombre} placeholder="Mas Pizza" />
                  </Campo>
                  <Campo
                    etiqueta="WhatsApp del negocio"
                    ayuda="Como lo escribís normalmente; le pongo el código de país."
                  >
                    <Entrada
                      name="whatsapp"
                      required
                      defaultValue={ficha.whatsapp}
                      placeholder="0982 951807"
                    />
                  </Campo>
                  <Campo etiqueta="Dirección">
                    <Entrada
                      name="direccion"
                      defaultValue={ficha.direccion ?? ""}
                      placeholder="Av. Mariscal López 1234, Asunción"
                    />
                  </Campo>
                  <Campo etiqueta="Plan">
                    <Entrada name="plan" defaultValue={ficha.plan} placeholder="basico" />
                  </Campo>
                  <Campo etiqueta="Asesor comercial" className="sm:col-span-2">
                    <Selector name="asesorId" defaultValue={ficha.asesorId ?? ""}>
                      <option value="">Sin asignar</option>
                      {asesorInactivo && (
                        <option value={asesorInactivo.id}>{asesorInactivo.nombre}</option>
                      )}
                      {asesores.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nombre}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                </div>
              </Seccion>

              <Seccion titulo="El titular y la facturación">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Nombre y apellido del titular">
                    <Entrada
                      name="titularNombre"
                      defaultValue={ficha.titularNombre ?? ""}
                      placeholder="Juan Pérez"
                    />
                  </Campo>
                  <Campo etiqueta="Teléfono del titular">
                    <Entrada
                      name="titularTelefono"
                      defaultValue={ficha.titularTelefono ?? ""}
                      placeholder="0981 234 567"
                    />
                  </Campo>
                  <Campo etiqueta="Razón social">
                    <Entrada
                      name="razonSocial"
                      defaultValue={ficha.razonSocial ?? ""}
                      placeholder="Juan Pérez S.A."
                    />
                  </Campo>
                  <Campo etiqueta="RUC">
                    <Entrada name="ruc" defaultValue={ficha.ruc ?? ""} placeholder="80012345-6" />
                  </Campo>
                </div>
              </Seccion>

              <p className="rounded-lg bg-papel-suave px-3 py-2 text-xs text-tinta-media">
                La dirección de la carta (/{ficha.slug}), el correo de acceso, el vencimiento y el
                estado no se cambian desde acá: el vencimiento y el estado se mueven con Activar,
                Registrar pago y Suspender.
              </p>
            </form>
          ) : (
            <div className="flex flex-col gap-5">
              {guardado && (
                <p className="rounded-lg bg-exito-luz px-3 py-2 text-sm font-medium text-exito">
                  Datos guardados.
                </p>
              )}

              <Seccion titulo="El negocio">
                <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <Dato etiqueta="Carta pública">
                    <a
                      href={ficha.urlCarta}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {ficha.urlCarta.replace(/^https?:\/\//, "")}
                    </a>
                  </Dato>
                  <Dato etiqueta="WhatsApp del negocio">
                    <a
                      href={`https://wa.me/${ficha.whatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      +{ficha.whatsapp}
                    </a>
                  </Dato>
                  <Dato etiqueta="Dirección">{ficha.direccion}</Dato>
                  <Dato etiqueta="Asesor comercial">{ficha.asesorNombre}</Dato>
                  <Dato etiqueta="Correo de acceso del dueño">{ficha.correo}</Dato>
                  <Dato etiqueta="Dado de alta">{ficha.alta}</Dato>
                </dl>
              </Seccion>

              <Seccion titulo="El titular y la facturación">
                <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <Dato etiqueta="Nombre y apellido del titular">{ficha.titularNombre}</Dato>
                  <Dato etiqueta="Teléfono del titular">{ficha.titularTelefono}</Dato>
                  <Dato etiqueta="Razón social">{ficha.razonSocial}</Dato>
                  <Dato etiqueta="RUC">{ficha.ruc}</Dato>
                </dl>
              </Seccion>

              <Seccion titulo="Suscripción y actividad">
                <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <Dato etiqueta="Plan">{ficha.plan}</Dato>
                  <Dato etiqueta="Vencimiento">{ficha.vencimiento}</Dato>
                  <Dato etiqueta={`Pedidos en ${ficha.diasDeActividad} días`}>
                    {String(ficha.pedidosRecientes)}
                  </Dato>
                  <Dato etiqueta="Productos cargados">{String(ficha.productos)}</Dato>
                  <Dato etiqueta="Último ingreso al panel">{ficha.ultimoIngreso}</Dato>
                </dl>
              </Seccion>

              <Seccion titulo="Pagos registrados">
                {ficha.pagos.length === 0 ? (
                  <p className="text-sm text-tinta-suave">Todavía no registró ningún pago.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-linea">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-papel-suave text-tinta-media">
                        <tr>
                          <th className="px-3 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 font-medium">Monto</th>
                          <th className="px-3 py-2 font-medium">Meses</th>
                          <th className="px-3 py-2 font-medium">Cubre hasta</th>
                          <th className="px-3 py-2 font-medium">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ficha.pagos.map((p, i) => (
                          <tr key={i} className="border-t border-linea text-tinta">
                            <td className="whitespace-nowrap px-3 py-2">{p.fecha}</td>
                            <td className="whitespace-nowrap px-3 py-2">{p.monto}</td>
                            <td className="px-3 py-2">{p.meses}</td>
                            <td className="whitespace-nowrap px-3 py-2">{p.cubreHasta}</td>
                            <td className="px-3 py-2 text-tinta-media">{p.nota ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Seccion>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea bg-papel-suave px-5 py-3">
          <p className="min-w-0 flex-1 text-sm font-medium text-peligro">{editando && error}</p>
          <div className="flex items-center gap-2">
            {editando ? (
              <>
                <button
                  type="button"
                  onClick={cancelarEdicion}
                  disabled={pendiente}
                  className={clasesBoton("suave")}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form={idFormulario}
                  disabled={pendiente}
                  className={clasesBoton("principal")}
                >
                  {pendiente ? "Guardando…" : "Guardar"}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={onCerrar} className={clasesBoton("suave")}>
                  Cerrar
                </button>
                <button type="button" onClick={empezarAEditar} className={clasesBoton("principal")}>
                  Editar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
