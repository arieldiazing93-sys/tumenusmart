"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Selector, clasesBoton, clasesCampo } from "@/components/ui";
import { EntradaMonto } from "@/components/EntradaMonto";
import { TASAS_IVA } from "@/lib/iva";
import {
  COLORES_SERVICIO,
  COLOR_POR_DEFECTO,
  HORAS_DURACION,
  MINUTOS_BUFER,
  MINUTOS_DURACION,
  TIPOS_PRECIO,
  partirDuracion,
  type PersonalOpcion,
  type ServicioFila,
} from "@/lib/servicios-agenda";
import { AvatarPersonal } from "../AvatarPersonal";
import { actualizarServicio, crearServicio } from "./actions";

/**
 * El formulario para añadir (o editar) un servicio, adentro del panel lateral.
 * El cuerpo se desliza y el pie con "Cancelar" y "Crear" queda fijo abajo.
 *
 * Un servicio se vende en el punto de venta y se factura, así que además de lo
 * de la agenda (duración, búfer, color, quién lo realiza) pide el IVA: se
 * factura como servicio, no como mercadería.
 */

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-linea pb-5 last:border-b-0 last:pb-0">
      <h3 className="text-[0.95rem] font-semibold tracking-titular text-tinta">{titulo}</h3>
      {children}
    </section>
  );
}

export function FormularioServicio({
  servicio,
  categorias,
  personal,
  categoriaInicial,
  onCerrar,
}: {
  /** null para añadir uno nuevo. */
  servicio: ServicioFila | null;
  categorias: { id: string; nombre: string }[];
  personal: PersonalOpcion[];
  /** La categoría que estaba abierta al tocar "Añadir servicio". */
  categoriaInicial: string | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const duracion = servicio ? partirDuracion(servicio.duracionMin) : { horas: 1, minutos: 0 };
  const [usaBufer, setUsaBufer] = useState((servicio?.bufferMin ?? 0) > 0);
  const [monto, setMonto] = useState(servicio ? String(Math.round(servicio.precio)) : "");
  const [color, setColor] = useState(servicio?.color ?? COLOR_POR_DEFECTO);

  // Se ofrece el personal activo, y también quien ya realiza este servicio aunque
  // haya quedado inactivo (si no, al guardar se lo sacaría sin querer).
  const asignados = servicio?.personalIds ?? [];
  const ofrecidos = personal.filter((p) => p.activo || asignados.includes(p.id));
  // Con una sola persona en el negocio, ya sale marcada.
  const marcados = servicio ? asignados : ofrecidos.length === 1 ? [ofrecidos[0].id] : [];

  const editando = servicio !== null;

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    if (datos.getAll("personalId").length === 0) {
      setError("Elegí quién realiza el servicio");
      return;
    }
    setError(null);
    iniciar(async () => {
      const resultado = servicio ? await actualizarServicio(servicio.id, datos) : await crearServicio(datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      onCerrar();
    });
  }

  return (
    <form onSubmit={alEnviar} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {/* ---------- información general ---------- */}
        <Seccion titulo="Información general">
          <Campo etiqueta="Nombre *">
            <Entrada
              name="nombre"
              required
              autoFocus
              maxLength={80}
              defaultValue={servicio?.nombre ?? ""}
              placeholder="Nombre del servicio"
            />
          </Campo>

          <Campo etiqueta="Categoría *">
            <Selector name="categoryId" required defaultValue={servicio?.categoryId ?? categoriaInicial ?? ""}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Selector>
          </Campo>

          <div>
            <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Quién lo realiza *</span>
            {ofrecidos.length === 0 ? (
              <div className="rounded-lg border border-aviso/30 bg-aviso-luz p-3 text-[0.84rem] text-aviso">
                Todavía no hay personal cargado. Cargalo primero para poder asignarle servicios.
                <span className="mt-2 block">
                  <Link href="/admin/agenda/personal" className={clasesBoton("suave", "sm")}>
                    Ir a Personal
                  </Link>
                </span>
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {ofrecidos.map((p, i) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-linea bg-superficie px-3 py-2.5 transition-colors hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand-light/50">
                      <input
                        type="checkbox"
                        name="personalId"
                        value={p.id}
                        defaultChecked={marcados.includes(p.id)}
                        className="h-4 w-4 flex-none accent-brand"
                      />
                      <AvatarPersonal nombre={p.nombre} fotoUrl={p.fotoUrl} indice={i} className="h-7 w-7 text-[0.68rem]" />
                      <span className="min-w-0 flex-1 truncate text-[0.88rem] font-medium text-tinta">
                        {p.nombre}
                        {!p.activo && <span className="ml-1.5 text-[0.75rem] font-normal text-tinta-suave">(inactivo)</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Seccion>

        {/* ---------- duración ---------- */}
        <Seccion titulo="Duración">
          <div>
            <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Duración *</span>
            <div className="grid grid-cols-2 gap-2">
              <Selector name="horas" aria-label="Horas" defaultValue={String(duracion.horas)}>
                {HORAS_DURACION.map((h) => (
                  <option key={h} value={h}>
                    {h} h
                  </option>
                ))}
              </Selector>
              <Selector name="minutos" aria-label="Minutos" defaultValue={String(duracion.minutos)}>
                {MINUTOS_DURACION.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Selector>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-[0.88rem] font-medium text-tinta">
            <input
              type="checkbox"
              name="usaBufer"
              checked={usaBufer}
              onChange={(e) => setUsaBufer(e.target.checked)}
              className="h-4 w-4 flex-none accent-brand"
            />
            Tiempo de búfer
          </label>
          {usaBufer && (
            <Campo etiqueta="Minutos de búfer" ayuda="Lo que se reserva después del servicio para limpiar o preparar.">
              <Selector name="bufferMin" defaultValue={String(servicio?.bufferMin || 10)}>
                {MINUTOS_BUFER.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Selector>
            </Campo>
          )}
        </Seccion>

        {/* ---------- precio y facturación ---------- */}
        <Seccion titulo="Precios">
          <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-2">
            <Campo etiqueta="Tipo de precio">
              <Selector name="tipoPrecio" defaultValue={servicio?.tipoPrecio ?? "fijo"}>
                {TIPOS_PRECIO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Monto (Gs.)">
              <EntradaMonto value={monto} onChange={setMonto} className={clasesCampo} placeholder="0" />
              <input type="hidden" name="precio" value={monto} />
            </Campo>
          </div>

          <Campo
            etiqueta="IVA"
            ayuda="El servicio se vende en el punto de venta y se factura como prestación de servicios (también en la factura electrónica)."
          >
            <Selector name="iva" defaultValue={servicio?.iva ?? "gravado10"}>
              {TASAS_IVA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
        </Seccion>

        {/* ---------- detalles ---------- */}
        <Seccion titulo="Detalles">
          <div>
            <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Color</span>
            <div className="h-9 rounded-lg border border-linea" style={{ backgroundColor: color }} aria-hidden="true" />
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {COLORES_SERVICIO.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  style={{ backgroundColor: c }}
                  className={`h-8 w-8 rounded-full border-2 transition-transform duration-100 ${
                    color === c ? "scale-110 border-tinta" : "border-transparent hover:scale-105"
                  }`}
                />
              ))}
              <label className="ml-1 flex cursor-pointer items-center gap-2 text-[0.8rem] font-medium text-tinta-media">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  aria-label="Elegir otro color"
                  className="h-8 w-10 cursor-pointer rounded border border-linea bg-transparent p-0.5"
                />
                Otro
              </label>
            </div>
            <input type="hidden" name="color" value={color} />
          </div>

          {servicio && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-linea bg-papel-suave p-3">
              <input
                type="checkbox"
                name="activo"
                defaultChecked={servicio.activo}
                className="mt-0.5 h-4 w-4 flex-none accent-brand"
              />
              <span>
                <span className="block text-[0.86rem] font-semibold text-tinta">Activo</span>
                <span className="block text-[0.78rem] leading-snug text-tinta-suave">
                  Si lo desactivás, deja de ofrecerse en el punto de venta y en la carta, pero se conserva con su historial.
                </span>
              </span>
            </label>
          )}
        </Seccion>
      </div>

      {/* ---------- pie fijo ---------- */}
      <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-5 py-4">
        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={clasesBoton("suave", "md")}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente || ofrecidos.length === 0}
            className={clasesBoton("principal", "md")}
          >
            {pendiente ? "Guardando…" : editando ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </form>
  );
}
