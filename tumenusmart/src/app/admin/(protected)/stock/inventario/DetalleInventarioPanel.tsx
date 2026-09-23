"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Tarjeta } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { obtenerInventario, type DetalleInventario } from "./actions";

/**
 * Lo que se registró en un inventario ya guardado, en el panel de la
 * derecha: la misma planilla que se llenó (stock del sistema, lo contado y la
 * diferencia) más los valores del pie. Se pide al abrirlo, no viene con la
 * lista, para que la lista siga liviana aunque haya muchos inventarios.
 */
export function DetalleInventarioPanel({ id }: { id: string }) {
  const [datos, setDatos] = useState<DetalleInventario | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    obtenerInventario(id)
      .then((r) => {
        if (cancelado) return;
        if (r.ok) setDatos(r.inventario);
        else setError(r.error);
      })
      .catch(() => {
        if (!cancelado) setError("No se pudo cargar el inventario. Probá de nuevo.");
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  if (error) {
    return (
      <Tarjeta>
        <p className="text-sm font-medium text-peligro">{error}</p>
      </Tarjeta>
    );
  }
  if (!datos) {
    return (
      <Tarjeta>
        <p className="text-sm text-tinta-suave">Cargando el inventario…</p>
      </Tarjeta>
    );
  }

  const diferenciaValor = datos.valorContado - datos.valorSistema;
  const categoriasDistintas = new Set(datos.items.map((i) => i.categoria ?? "Sin categoría"));
  const agrupar = categoriasDistintas.size > 1;
  let categoriaAnterior: string | null = null;

  return (
    <Tarjeta className="flex flex-col gap-4">
      <div>
        <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">Inventario del {datos.fecha}</h2>
        <p className="mt-0.5 text-sm text-tinta-media">
          <span className="font-medium text-tinta">{datos.almacen}</span>
          {datos.categorias ? ` · ${datos.categorias}` : ""}
        </p>
        <p className="text-xs text-tinta-suave">Registrado por {datos.registradoPor ?? "—"}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-linea">
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              <th scope="col" className="px-3 py-2">
                Insumo
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Sistema
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Contado
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Diferencia
              </th>
            </tr>
          </thead>
          <tbody>
            {datos.items.map((i, idx) => {
              const categoria = i.categoria ?? "Sin categoría";
              const nuevoGrupo = agrupar && categoria !== categoriaAnterior;
              categoriaAnterior = categoria;
              return (
                <FilaConGrupo key={idx} grupo={nuevoGrupo ? categoria : null}>
                  <td className="border-b border-linea-fina px-3 py-1.5 text-[0.86rem] font-medium text-tinta">
                    {i.insumo}
                  </td>
                  <td className="border-b border-linea-fina px-3 py-1.5 text-right text-[0.86rem] text-tinta-media">
                    {i.sistema} <span className="text-xs text-tinta-suave">{i.unidad}</span>
                  </td>
                  <td className="border-b border-linea-fina px-3 py-1.5 text-right text-[0.86rem] text-tinta">
                    {i.contado == null ? <span className="text-tinta-suave">sin contar</span> : i.contado}
                  </td>
                  <td className="border-b border-linea-fina px-3 py-1.5 text-right text-[0.86rem]">
                    {i.diferencia == null ? (
                      <span className="text-tinta-suave">—</span>
                    ) : i.diferencia === 0 ? (
                      <span className="text-tinta-media">0</span>
                    ) : (
                      <span className={`font-semibold ${i.diferencia < 0 ? "text-peligro" : "text-exito"}`}>
                        {i.diferencia > 0 ? "+" : ""}
                        {i.diferencia}
                      </span>
                    )}
                  </td>
                </FilaConGrupo>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-tinta-media">
          Se contaron <span className="font-semibold text-tinta">{datos.contados}</span> de {datos.items.length}{" "}
          insumos · <span className="font-semibold text-tinta">{datos.conDiferencia}</span> con diferencia.
        </p>
        <dl className="cifra flex min-w-[16rem] flex-col gap-1.5 text-[0.88rem]">
          <div className="flex justify-between gap-4">
            <dt className="text-tinta-media">Valor según el sistema</dt>
            <dd>{formatearGuarani(datos.valorSistema)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-tinta-media">Diferencia</dt>
            <dd className={diferenciaValor < 0 ? "text-peligro" : diferenciaValor > 0 ? "text-exito" : ""}>
              {diferenciaValor > 0 ? "+ " : diferenciaValor < 0 ? "− " : ""}
              {formatearGuarani(Math.abs(diferenciaValor))}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-linea pt-1.5 text-[1.05rem] font-semibold">
            <dt>Valor del inventario</dt>
            <dd>{formatearGuarani(datos.valorContado)}</dd>
          </div>
        </dl>
      </div>
    </Tarjeta>
  );
}

/** Una fila de la planilla, precedida (si corresponde) por el título de su categoría. */
function FilaConGrupo({ grupo, children }: { grupo: string | null; children: ReactNode }) {
  return (
    <>
      {grupo !== null && (
        <tr>
          <td
            colSpan={4}
            className="border-b border-linea-fina bg-papel-suave px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-media"
          >
            {grupo}
          </td>
        </tr>
      )}
      <tr>{children}</tr>
    </>
  );
}
