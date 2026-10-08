"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { textoPorcentaje } from "@/lib/descuento-venta";
import type { TipoDescuentoFila } from "@/lib/tipos-descuento-servidor";
import { cambiarEstadoTipoDescuento, eliminarTipoDescuento, guardarTipoDescuento } from "./actions";

type Resultado = { ok: true } | { ok: false; error: string };

/**
 * La lista de los tipos de descuento y el formulario para agregar uno. Cada fila se edita ahí mismo (nombre y porcentaje), se
 * desactiva (deja de aparecer al vender, pero queda para volver a activarlo) o se elimina (lo ya vendido no cambia).
 *
 * Si todavía no hay uno de 100 %, se ofrece crear "Cortesía" de un toque: es el que sirve para regalar una cuenta entera.
 */
export function TiposDescuentoPanel({ tipos }: { tipos: TipoDescuentoFila[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState("");
  const [porcentaje, setPorcentaje] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hayCortesia = tipos.some((t) => t.porcentaje === 100);

  function ejecutar(accion: () => Promise<Resultado>, alTerminar?: () => void) {
    setError(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (!r.ok) {
          setError(r.error);
          return;
        }
        alTerminar?.();
        router.refresh();
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  function agregar() {
    ejecutar(
      () => guardarTipoDescuento(null, { nombre, porcentaje }),
      () => {
        setNombre("");
        setPorcentaje("");
      }
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Tarjeta className="campos-grises flex flex-col gap-3 !border-2 !border-azul/50">
        <p className="rotulo text-[0.78rem] font-bold">Nuevo tipo de descuento</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
          <Campo etiqueta="Nombre">
            <Entrada
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={40}
              placeholder="Ej: Cortesía, Tarjeta, Cumpleaños"
            />
          </Campo>
          <Campo etiqueta="Porcentaje">
            <Entrada inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} placeholder="Ej: 20" />
          </Campo>
          <button type="button" disabled={pendiente} onClick={agregar} className={clasesBoton("nuevo")}>
            Agregar
          </button>
        </div>
        {!hayCortesia && (
          <div className="flex flex-wrap items-center gap-2 text-[0.82rem] text-tinta-media">
            <span>Para regalar una cuenta entera se usa un descuento del 100 %.</span>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(() => guardarTipoDescuento(null, { nombre: "Cortesía", porcentaje: "100" }))}
              className={clasesBoton("nuevo", "sm")}
            >
              Crear “Cortesía” 100 %
            </button>
          </div>
        )}
        {error && <MensajeError>{error}</MensajeError>}
      </Tarjeta>

      <div className="flex flex-col gap-2">
        {tipos.map((t) => (
          <FilaDeTipo key={t.id} tipo={t} ejecutar={ejecutar} pendiente={pendiente} />
        ))}
        {tipos.length === 0 && <p className="text-sm text-tinta-suave">Todavía no hay tipos de descuento creados.</p>}
      </div>

      <p className="text-[0.78rem] leading-snug text-tinta-suave">
        Al descontar una cuenta (mostrador, comedor o delivery) por porcentaje, se elige uno de estos tipos y el porcentaje sale de él. El 100 % solo se
        puede dar con un tipo como “Cortesía”: la cuenta se vende y se factura en cero (después se anula la factura), así el stock baja. Lo que
        ya se vendió no cambia si después editás o borrás un tipo.
      </p>
    </div>
  );
}

function FilaDeTipo({
  tipo,
  ejecutar,
  pendiente,
}: {
  tipo: TipoDescuentoFila;
  ejecutar: (accion: () => Promise<Resultado>, alTerminar?: () => void) => void;
  pendiente: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(tipo.nombre);
  const [porcentaje, setPorcentaje] = useState(String(tipo.porcentaje).replace(".", ","));

  function cancelar() {
    setNombre(tipo.nombre);
    setPorcentaje(String(tipo.porcentaje).replace(".", ","));
    setEditando(false);
  }

  return (
    // El estado se ve en la etiqueta (Activo / Desactivado) y en el color del botón; la fila no cambia de fondo.
    <div className="campos-grises rounded-lg border-2 border-azul/50 bg-white px-4 py-3">
      {editando ? (
        <div className="flex flex-wrap items-end gap-2">
          <Campo etiqueta="Nombre" className="min-w-[10rem] flex-1">
            <Entrada autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} />
          </Campo>
          <Campo etiqueta="Porcentaje" className="w-28">
            <Entrada inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} />
          </Campo>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => ejecutar(() => guardarTipoDescuento(tipo.id, { nombre, porcentaje }), () => setEditando(false))}
            className={clasesBoton("navegar", "sm")}
          >
            Guardar
          </button>
          <button type="button" onClick={cancelar} className={clasesBoton("peligro", "sm")}>
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-tinta">{tipo.nombre}</span>
            <Pastilla color="azul">{textoPorcentaje(tipo.porcentaje)} %</Pastilla>
            {tipo.activo ? (
              <Pastilla color="exito" punto>
                Activo
              </Pastilla>
            ) : (
              <Pastilla color="amarillo" punto>
                Desactivado
              </Pastilla>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setEditando(true)} className={clasesBoton("navegar", "sm")}>
              Editar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => ejecutar(() => cambiarEstadoTipoDescuento(tipo.id, !tipo.activo))}
              className={clasesBoton(tipo.activo ? "peligro" : "nuevo", "sm")}
            >
              {tipo.activo ? "Desactivar" : "Reactivar"}
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => {
                if (window.confirm(`¿Eliminar el descuento “${tipo.nombre}”? Lo ya vendido no cambia.`)) {
                  ejecutar(() => eliminarTipoDescuento(tipo.id));
                }
              }}
              className={clasesBoton("peligro", "sm")}
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
