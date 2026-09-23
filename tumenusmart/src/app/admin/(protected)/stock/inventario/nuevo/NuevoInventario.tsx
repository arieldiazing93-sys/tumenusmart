"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tarjeta, Campo, Entrada, Selector, Tabla, Th, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { guardarInventario } from "../actions";

type Almacen = { id: string; nombre: string };
type Categoria = { id: string; nombre: string };
type InsumoInventario = {
  id: string;
  nombre: string;
  categoriaId: string | null;
  /** Ya con su etiqueta ("Unidad", "Kilogramo"...). */
  unidad: string;
  /** Costo de una unidad de stock. Null si el insumo todavía no tiene costo. */
  costoUnitario: number | null;
  /** Cuánto hay en cada almacén (id de almacén → cantidad). */
  stock: Record<string, number>;
};

const SIN_CATEGORIA = "sin";

function claveDeCategoria(i: InsumoInventario): string {
  return i.categoriaId ?? SIN_CATEGORIA;
}

function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Lo escrito como cantidad contada: vacío o inválido es "todavía no contado" (null). */
function cantidadContada(texto: string): number | null {
  if (texto.trim() === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Una toma de inventario en dos pasos: primero se elige el almacén y qué
 * categorías se cuentan; después aparece la planilla con el stock del sistema,
 * una columna para escribir lo contado y otra con la diferencia. Nada se guarda
 * hasta apretar "Guardar inventario".
 */
export function NuevoInventario({
  almacenes,
  categorias,
  insumos,
}: {
  almacenes: Almacen[];
  categorias: Categoria[];
  insumos: InsumoInventario[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [almacenId, setAlmacenId] = useState(almacenes[0]?.id ?? "");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [comenzado, setComenzado] = useState(false);
  const [conteo, setConteo] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<{ ajustados: number; contados: number } | null>(null);

  // Solo se ofrecen las categorías que tienen insumos (más "Sin categoría" si hay).
  const opciones = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const i of insumos) {
      const clave = claveDeCategoria(i);
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
    }
    const lista = categorias
      .filter((c) => cuenta.has(c.id))
      .map((c) => ({ clave: c.id, nombre: c.nombre, cantidad: cuenta.get(c.id) ?? 0 }));
    if (cuenta.has(SIN_CATEGORIA)) {
      lista.push({ clave: SIN_CATEGORIA, nombre: "Sin categoría", cantidad: cuenta.get(SIN_CATEGORIA) ?? 0 });
    }
    return lista;
  }, [insumos, categorias]);

  const todasMarcadas = opciones.length > 0 && opciones.every((o) => seleccion.has(o.clave));

  function alternarTodas() {
    setSeleccion(todasMarcadas ? new Set() : new Set(opciones.map((o) => o.clave)));
  }

  function alternar(clave: string) {
    setSeleccion((actual) => {
      const nueva = new Set(actual);
      if (nueva.has(clave)) nueva.delete(clave);
      else nueva.add(clave);
      return nueva;
    });
  }

  function cambiarAlmacen(id: string) {
    setAlmacenId(id);
    // Lo contado era de otro almacén: no sirve para este.
    setConteo({});
  }

  function comenzar() {
    setError(null);
    if (!almacenId) {
      setError("Elegí el almacén que vas a contar.");
      return;
    }
    if (seleccion.size === 0) {
      setError("Marcá al menos una categoría para contar.");
      return;
    }
    setComenzado(true);
  }

  const nombreDeCategoria = useMemo(() => new Map(opciones.map((o) => [o.clave, o.nombre])), [opciones]);
  const ordenDeCategoria = useMemo(() => new Map(opciones.map((o, i) => [o.clave, i])), [opciones]);

  // Los insumos de las categorías marcadas, agrupados por categoría (el
  // orden por nombre que ya traen se mantiene dentro de cada una).
  const filas = useMemo(
    () =>
      insumos
        .filter((i) => seleccion.has(claveDeCategoria(i)))
        .sort((a, b) => (ordenDeCategoria.get(claveDeCategoria(a)) ?? 0) - (ordenDeCategoria.get(claveDeCategoria(b)) ?? 0)),
    [insumos, seleccion, ordenDeCategoria]
  );

  const calculadas = filas.map((insumo) => {
    const sistema = insumo.stock[almacenId] ?? 0;
    const escrito = conteo[insumo.id] ?? "";
    const contado = cantidadContada(escrito);
    return {
      insumo,
      sistema,
      escrito,
      contado,
      diferencia: contado != null ? redondear3(contado - sistema) : null,
    };
  });

  // Lo que no se contó se toma como está en el sistema: el valor del
  // inventario es el de todo lo que se ve en la planilla, ya con lo contado.
  let valorSistema = 0;
  let valorContado = 0;
  let cantidadContadas = 0;
  let conDiferencia = 0;
  let sinCosto = 0;
  for (const c of calculadas) {
    const costo = c.insumo.costoUnitario;
    if (costo == null) sinCosto += 1;
    valorSistema += c.sistema * (costo ?? 0);
    valorContado += (c.contado ?? c.sistema) * (costo ?? 0);
    if (c.contado != null) cantidadContadas += 1;
    if (c.diferencia != null && c.diferencia !== 0) conDiferencia += 1;
  }
  const diferenciaValor = valorContado - valorSistema;

  const nombreAlmacen = almacenes.find((a) => a.id === almacenId)?.nombre ?? "";
  const categoriasElegidas = opciones.filter((o) => seleccion.has(o.clave)).map((o) => o.nombre);

  function guardar() {
    setError(null);
    if (calculadas.some((c) => c.escrito.trim() !== "" && c.contado == null)) {
      setError("Hay cantidades que no son válidas (marcadas en rojo): tienen que ser un número mayor o igual a cero.");
      return;
    }
    const contadas = calculadas.filter((c) => c.contado != null);
    if (contadas.length === 0) {
      setError("Escribí al menos una cantidad en la columna Ajuste.");
      return;
    }
    const mensaje =
      conDiferencia === 0
        ? `Contaste ${contadas.length} insumos en ${nombreAlmacen} y todos coinciden con el sistema. ¿Guardar el inventario?`
        : `Vas a guardar el inventario de ${nombreAlmacen}: ${conDiferencia} de ${contadas.length} insumos contados tienen diferencia y su stock se va a corregir. ¿Continuar?`;
    if (!confirm(mensaje)) return;

    iniciar(async () => {
      const resultado = await guardarInventario(
        almacenId,
        // Toda la planilla, también lo que no se contó: queda en el registro.
        calculadas.map((c) => ({ insumoId: c.insumo.id, contado: c.contado })),
        categoriasElegidas.join(", ")
      );
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setGuardado({ ajustados: resultado.ajustados, contados: resultado.contados });
    });
  }

  function otroInventario() {
    setGuardado(null);
    setComenzado(false);
    setConteo({});
    setSeleccion(new Set());
    setError(null);
    // Los datos del sistema cambiaron con lo que se acaba de guardar.
    router.refresh();
  }

  // ------------------------------------------------------------------ guardado
  if (guardado) {
    return (
      <Tarjeta className="flex flex-col gap-3">
        <p className="text-[1rem] font-semibold text-exito">✓ Inventario guardado</p>
        <p className="text-sm text-tinta-media">
          Contaste {guardado.contados} {guardado.contados === 1 ? "insumo" : "insumos"} en {nombreAlmacen}.{" "}
          {guardado.ajustados === 0
            ? "Todos coincidían con el sistema, no hizo falta ajustar nada."
            : `Se ajustó el stock de ${guardado.ajustados} — cada diferencia quedó en el historial del insumo.`}{" "}
          El inventario quedó registrado: lo abrís con doble clic desde Registro de inventario.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/stock/inventario" className={clasesBoton("principal")}>
            Volver a Registro de inventario
          </Link>
          <button type="button" onClick={otroInventario} className={clasesBoton("suave")}>
            Hacer otro inventario
          </button>
        </div>
      </Tarjeta>
    );
  }

  // ------------------------------------------------------- paso 1: qué contar
  if (!comenzado) {
    return (
      <Tarjeta className="flex flex-col gap-4">
        <Campo etiqueta="Almacén que vas a contar">
          <Selector value={almacenId} onChange={(e) => cambiarAlmacen(e.target.value)} className="sm:max-w-xs">
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Selector>
        </Campo>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[0.82rem] font-semibold text-tinta">¿De qué categorías querés hacer el inventario?</legend>
          <label className="flex items-center gap-2 rounded-lg border border-linea bg-papel-suave px-3 py-2 text-sm font-medium">
            <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} />
            Todas las categorías
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {opciones.map((o) => (
              <label key={o.clave} className="flex items-center gap-2 rounded-lg border border-linea px-3 py-2 text-sm">
                <input type="checkbox" checked={seleccion.has(o.clave)} onChange={() => alternar(o.clave)} />
                <span className="min-w-0 flex-1 truncate">{o.nombre}</span>
                <span className="text-xs text-tinta-suave">{o.cantidad}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm font-medium text-peligro">{error}</p>}
        <div>
          <button type="button" onClick={comenzar} className={clasesBoton("principal")}>
            Traer stock del sistema
          </button>
        </div>
      </Tarjeta>
    );
  }

  // ------------------------------------------------------ paso 2: la planilla
  const gruposVisibles = categoriasElegidas.length > 1;
  let categoriaAnterior: string | null = null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-tinta-media">
          <span className="font-semibold text-tinta">{nombreAlmacen}</span> · {categoriasElegidas.join(", ")} ·{" "}
          {calculadas.length} {calculadas.length === 1 ? "insumo" : "insumos"}
        </p>
        <button type="button" onClick={() => setComenzado(false)} className={clasesBoton("suave", "sm")}>
          Cambiar almacén o categorías
        </button>
      </div>

      <Tabla>
        <thead>
          <tr>
            <Th>Insumo</Th>
            <Th className="text-right">Stock del sistema</Th>
            <Th className="w-40">Ajuste (lo que contaste)</Th>
            <Th className="text-right">Diferencia</Th>
          </tr>
        </thead>
        <tbody>
          {calculadas.map((c, idx) => {
            const clave = claveDeCategoria(c.insumo);
            const nuevoGrupo = gruposVisibles && clave !== categoriaAnterior;
            categoriaAnterior = clave;
            const invalida = c.escrito.trim() !== "" && c.contado == null;
            return (
              <FilaConGrupo key={c.insumo.id} grupo={nuevoGrupo ? (nombreDeCategoria.get(clave) ?? "") : null}>
                <td className="border-b border-linea-fina px-3.5 py-1.5 text-[0.86rem] font-medium text-tinta">
                  {c.insumo.nombre}
                </td>
                <td className="border-b border-linea-fina px-3.5 py-1.5 text-right text-[0.86rem] text-tinta-media">
                  {c.sistema} <span className="text-xs text-tinta-suave">{c.insumo.unidad}</span>
                </td>
                <td className="border-b border-linea-fina px-3.5 py-1.5">
                  <Entrada
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder="—"
                    data-conteo={idx}
                    invalido={invalida}
                    value={c.escrito}
                    onChange={(e) => setConteo((actual) => ({ ...actual, [c.insumo.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      // Enter pasa al siguiente insumo, para contar sin tocar el mouse.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        document.querySelector<HTMLInputElement>(`input[data-conteo="${idx + 1}"]`)?.focus();
                      }
                    }}
                  />
                </td>
                <td className="border-b border-linea-fina px-3.5 py-1.5 text-right text-[0.86rem]">
                  {c.diferencia == null ? (
                    <span className="text-tinta-suave">—</span>
                  ) : c.diferencia === 0 ? (
                    <span className="text-tinta-media">0</span>
                  ) : (
                    <span className={`font-semibold ${c.diferencia < 0 ? "text-peligro" : "text-exito"}`}>
                      {c.diferencia > 0 ? "+" : ""}
                      {c.diferencia}
                    </span>
                  )}
                </td>
              </FilaConGrupo>
            );
          })}
        </tbody>
      </Tabla>

      <Tarjeta className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1 text-sm text-tinta-media">
          <p>
            Contaste <span className="font-semibold text-tinta">{cantidadContadas}</span> de {calculadas.length}{" "}
            insumos · <span className="font-semibold text-tinta">{conDiferencia}</span> con diferencia.
          </p>
          <p className="text-xs text-tinta-suave">
            Los que no contaste se toman como están en el sistema.
            {sinCosto > 0 &&
              ` ${sinCosto} ${sinCosto === 1 ? "insumo" : "insumos"} sin costo cargado no suman al valor.`}
          </p>
        </div>
        <dl className="cifra flex min-w-[18rem] flex-col gap-1.5 text-[0.88rem]">
          <div className="flex justify-between gap-4">
            <dt className="text-tinta-media">Valor según el sistema</dt>
            <dd>{formatearGuarani(valorSistema)}</dd>
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
            <dd>{formatearGuarani(valorContado)}</dd>
          </div>
        </dl>
      </Tarjeta>

      {error && <p className="text-sm font-medium text-peligro">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal")}>
          {pendiente ? "Guardando…" : "Guardar inventario"}
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => {
            if (Object.keys(conteo).length === 0 || confirm("¿Borrar todo lo que escribiste en la columna Ajuste?")) {
              setConteo({});
              setError(null);
            }
          }}
          className={clasesBoton("suave")}
        >
          Limpiar ajustes
        </button>
      </div>
    </div>
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
            className="border-b border-linea-fina bg-papel-suave px-3.5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-media"
          >
            {grupo}
          </td>
        </tr>
      )}
      <tr className="transition-colors duration-100 hover:bg-papel-suave">{children}</tr>
    </>
  );
}
