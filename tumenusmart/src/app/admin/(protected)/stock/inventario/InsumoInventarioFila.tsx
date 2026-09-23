"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tr, Td, Entrada, Selector, clasesBoton } from "@/components/ui";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { ajustarInventario } from "./actions";

type StockDeUnAlmacen = { almacenId: string | null; nombre: string; cantidad: number };

export function InsumoInventarioFila({
  id,
  nombre,
  categoriaNombre,
  stockActual,
  unidadMedida,
  porAlmacen,
  almacenes,
}: {
  id: string;
  nombre: string;
  categoriaNombre: string;
  /** El total, sumando todos los almacenes. */
  stockActual: number;
  unidadMedida: string;
  /** Cuánto hay en cada almacén (los que están en cero no vienen). */
  porAlmacen: StockDeUnAlmacen[];
  /** Los almacenes activos: a los que se puede ajustar. */
  almacenes: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [ajustando, setAjustando] = useState(false);
  const [almacenId, setAlmacenId] = useState("");
  const [contado, setContado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const unidad = etiquetaUnidadMedida(unidadMedida);
  const cantidadEn = (idAlmacen: string) => porAlmacen.find((s) => s.almacenId === idAlmacen)?.cantidad ?? 0;
  // Con un solo almacén el desglose repite el total; solo aporta si hay más de uno
  // (o si quedó stock viejo sin almacén, que no se tiene que esconder).
  const mostrarDesglose = almacenes.length > 1 || porAlmacen.some((s) => s.almacenId === null);

  function empezarAjuste() {
    // Arranca en un almacén donde el insumo ya tiene stock, si lo hay.
    const inicial = almacenes.find((a) => cantidadEn(a.id) !== 0)?.id ?? almacenes[0]?.id ?? "";
    setAlmacenId(inicial);
    setContado(String(cantidadEn(inicial)));
    setError(null);
    setAjustando(true);
  }

  function cancelar() {
    setAjustando(false);
    setMotivo("");
    setError(null);
  }

  function guardar() {
    setError(null);
    const cantidad = Number(contado);
    iniciar(async () => {
      const resultado = await ajustarInventario(id, almacenId, cantidad, motivo);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setAjustando(false);
      setMotivo("");
      setGuardado(true);
      router.refresh();
      setTimeout(() => setGuardado(false), 2000);
    });
  }

  return (
    <Tr>
      <Td className="font-medium text-tinta">{nombre}</Td>
      <Td>{categoriaNombre}</Td>
      <Td>
        {ajustando ? (
          <div className="flex flex-col gap-1.5">
            <Selector
              value={almacenId}
              onChange={(e) => {
                setAlmacenId(e.target.value);
                setContado(String(cantidadEn(e.target.value)));
              }}
              className="text-xs"
            >
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Selector>
            <div className="flex items-center gap-1.5">
              <Entrada
                type="number"
                step="0.001"
                min="0"
                autoFocus
                value={contado}
                onChange={(e) => setContado(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-tinta-suave">{unidad} contadas</span>
            </div>
            <Entrada
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="text-xs"
            />
          </div>
        ) : (
          <div>
            <span>
              {stockActual} {unidad}
              {guardado && <span className="ml-2 text-xs font-normal text-exito">✓ Guardado</span>}
            </span>
            {mostrarDesglose && porAlmacen.length > 0 && (
              <p className="mt-0.5 text-xs font-normal text-tinta-suave">
                {porAlmacen.map((s) => `${s.nombre}: ${s.cantidad}`).join(" · ")}
              </p>
            )}
          </div>
        )}
        {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
      </Td>
      <Td>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {ajustando ? (
            <>
              <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal", "sm")}>
                Guardar
              </button>
              <button type="button" onClick={cancelar} className="text-tinta-media hover:underline">
                Cancelar
              </button>
            </>
          ) : (
            <>
              {almacenes.length > 0 && (
                <button type="button" onClick={empezarAjuste} className={clasesBoton("suave", "sm")}>
                  Ajustar
                </button>
              )}
              <Link href={`/admin/stock/inventario/${id}`} className={clasesBoton("navegar", "sm")}>
                Historial
              </Link>
            </>
          )}
        </div>
      </Td>
    </Tr>
  );
}
