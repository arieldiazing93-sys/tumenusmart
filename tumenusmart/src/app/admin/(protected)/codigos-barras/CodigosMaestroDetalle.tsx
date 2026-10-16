"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Entrada, MensajeError, Pastilla, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { BarrasSvg } from "@/components/BarrasSvg";
import { barrasDeCodigo, esCodigoInterno, medirBarras } from "@/lib/codigo-barras";
import { formatearGuarani } from "@/lib/format";
import { asignarCodigoProducto, generarCodigosFaltantes } from "./actions";
import { CodigoBarrasProducto } from "./CodigoBarrasProducto";
import { ProbarLector } from "./ProbarLector";

export type ProductoCodigo = {
  id: string;
  nombre: string;
  categoryId: string;
  categoria: string;
  precio: number;
  disponible: boolean;
  codigoBarras: string | null;
};
type Categoria = { id: string; nombre: string };
type EstadoFiltro = "todos" | "sin" | "con";

const TODAS = "";

/** Sin tildes ni mayúsculas, para que «cafe» encuentre «Café» al buscar. */
function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * La pantalla de Códigos de barras: la lista de productos con su código (y cuáles no tienen), el modo «asignar escaneando» para cargar el código
 * de muchos productos seguidos con el lector, «generar los que faltan» y la ficha del código del producto abierto. Todo el filtrado se hace
 * acá, en el navegador.
 *
 * Modo «asignar escaneando»: se muestra UN producto (el primero sin código), se escanea su código con el lector (que termina con Enter), se
 * guarda y salta solo al siguiente sin código. Así se codifican cientos de productos en pocos minutos.
 */
export function CodigosMaestroDetalle({
  productos,
  categorias,
  puedeEditar,
}: {
  productos: ProductoCodigo[];
  categorias: Categoria[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  // Una copia local de la lista: al guardar un código se ve al instante y recién después llegan los datos nuevos del servidor.
  const [lista, setLista] = useState(productos);
  useEffect(() => setLista(productos), [productos]);

  const [categoriaFiltro, setCategoriaFiltro] = useState(TODAS);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);

  // El modo «asignar escaneando».
  const [escaneando, setEscaneando] = useState(false);
  const [actualId, setActualId] = useState<string | null>(null);
  const [textoEscaneo, setTextoEscaneo] = useState("");
  const [errorEscaneo, setErrorEscaneo] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<{ id: string; nombre: string } | null>(null);
  const [ultimoGuardado, setUltimoGuardado] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  // «Generar los que faltan».
  const [generando, iniciarGeneracion] = useTransition();
  const [mensajeGeneracion, setMensajeGeneracion] = useState<{ texto: string; error: boolean } | null>(null);

  const total = lista.length;
  const conCodigo = lista.filter((p) => p.codigoBarras).length;
  const sinCodigo = total - conCodigo;

  const textoBuscado = sinTildes(busqueda.trim());
  const visibles = useMemo(
    () =>
      lista.filter((p) => {
        if (categoriaFiltro !== TODAS && p.categoryId !== categoriaFiltro) return false;
        if (estadoFiltro === "sin" && p.codigoBarras) return false;
        if (estadoFiltro === "con" && !p.codigoBarras) return false;
        if (textoBuscado && !sinTildes(`${p.nombre} ${p.categoria} ${p.codigoBarras ?? ""}`).includes(textoBuscado)) return false;
        return true;
      }),
    [lista, categoriaFiltro, estadoFiltro, textoBuscado]
  );

  const abierto = abiertoId ? (lista.find((p) => p.id === abiertoId) ?? null) : null;
  // El producto al que le toca el próximo código: el que se tocó, o el primero sin código de la lista.
  const actual = escaneando ? (lista.find((p) => p.id === actualId) ?? visibles.find((p) => !p.codigoBarras) ?? null) : null;

  // Después de cada guardado (y al saltar de producto), el cursor vuelve al campo para escanear el siguiente sin tocar nada.
  useEffect(() => {
    if (escaneando) document.getElementById("codigo-escaneo")?.focus();
  }, [escaneando, actual?.id, ultimoGuardado]);

  function actualizarCodigo(id: string, codigo: string | null) {
    setLista((l) => l.map((p) => (p.id === id ? { ...p, codigoBarras: codigo } : p)));
  }

  function entrarAlModoEscaneo() {
    setAbiertoId(null);
    setEscaneando(true);
    // Lo que sirve es recorrer los que faltan.
    setEstadoFiltro("sin");
    setActualId(null);
    setTextoEscaneo("");
    setErrorEscaneo(null);
    setConflicto(null);
    setUltimoGuardado(null);
  }

  /** El producto sin código que sigue al `id` en el orden de la lista (da la vuelta al llegar al final). Null si ya no queda ninguno. */
  function siguienteSinCodigo(id: string, orden: ProductoCodigo[], actualizada: ProductoCodigo[]): string | null {
    const sinCodigoAhora = new Set(actualizada.filter((p) => !p.codigoBarras).map((p) => p.id));
    const desde = orden.findIndex((p) => p.id === id);
    for (let i = 1; i <= orden.length; i++) {
      const candidato = orden[(desde + i) % orden.length];
      if (candidato && candidato.id !== id && sinCodigoAhora.has(candidato.id)) return candidato.id;
    }
    return null;
  }

  function saltar() {
    if (!actual) return;
    setErrorEscaneo(null);
    setConflicto(null);
    setTextoEscaneo("");
    setActualId(siguienteSinCodigo(actual.id, visibles, lista));
  }

  function guardarEscaneo(moverDeOtro = false) {
    if (!actual || !textoEscaneo.trim()) return;
    const producto = actual;
    setErrorEscaneo(null);
    if (!moverDeOtro) setConflicto(null);
    iniciar(async () => {
      const r = await asignarCodigoProducto(producto.id, textoEscaneo, moverDeOtro);
      if (!r.ok) {
        setErrorEscaneo(r.error);
        setConflicto(r.conflicto ?? null);
        (document.getElementById("codigo-escaneo") as HTMLInputElement | null)?.select();
        return;
      }
      const nueva = lista.map((p) => {
        if (p.id === producto.id) return { ...p, codigoBarras: r.codigo };
        // Si el código se le sacó a otro producto (con «pasárselo»), ese queda sin código.
        if (moverDeOtro && conflicto && p.id === conflicto.id) return { ...p, codigoBarras: null };
        return p;
      });
      setLista(nueva);
      setUltimoGuardado(`${producto.nombre} · ${r.codigo}`);
      setTextoEscaneo("");
      setConflicto(null);
      setActualId(siguienteSinCodigo(producto.id, visibles, nueva));
      router.refresh();
    });
  }

  function generarFaltantes() {
    if (
      !confirm(
        `Se va a generar un código propio para los ${sinCodigo} productos que no tienen uno. Después podés imprimir sus etiquetas. ¿Seguir?`
      )
    )
      return;
    setMensajeGeneracion(null);
    iniciarGeneracion(async () => {
      const r = await generarCodigosFaltantes();
      if (!r.ok) return setMensajeGeneracion({ texto: r.error, error: true });
      setMensajeGeneracion({
        texto:
          r.pendientes > 0
            ? `✓ Se generaron ${r.generados} códigos. Quedan ${r.pendientes} sin código: tocá el botón de nuevo para seguir.`
            : `✓ Se generaron ${r.generados} códigos. Todos los productos tienen código.`,
        error: false,
      });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-[0.84rem] text-tinta-media">
          <strong className="text-tinta">{conCodigo}</strong> de {total} productos tienen código
          {sinCodigo > 0 && (
            <>
              {" · "}
              <strong className="text-aviso">{sinCodigo}</strong> sin código
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {puedeEditar && (
            <button
              type="button"
              aria-pressed={escaneando}
              onClick={() => (escaneando ? setEscaneando(false) : entrarAlModoEscaneo())}
              className={clasesBoton(escaneando ? "suave" : "navegar", "md")}
            >
              {escaneando ? "✕ Salir de «asignar escaneando»" : "📷 Asignar escaneando"}
            </button>
          )}
          {puedeEditar && sinCodigo > 0 && (
            <button type="button" onClick={generarFaltantes} disabled={generando} className={clasesBoton("nuevo", "md")}>
              {generando ? "Generando…" : `+ Generar los que faltan (${sinCodigo})`}
            </button>
          )}
          <button type="button" aria-pressed={probando} onClick={() => setProbando((v) => !v)} className={clasesBoton("suave", "md")}>
            {probando ? "✕ Cerrar la prueba" : "Probar lector"}
          </button>
        </div>
      </div>

      {mensajeGeneracion && (
        <p className={`mb-3 text-[0.84rem] font-semibold ${mensajeGeneracion.error ? "text-peligro" : "text-exito"}`}>{mensajeGeneracion.texto}</p>
      )}
      {probando && (
        <div className="mb-3">
          <ProbarLector />
        </div>
      )}

      {/* El modo «asignar escaneando»: un producto a la vez; se escanea su código y salta solo al siguiente sin código. */}
      {escaneando && (
        <Tarjeta className="campos-grises mb-3 flex flex-col gap-3 !border-2 !border-azul/50">
          {actual ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!pendiente) guardarEscaneo();
              }}
              className="flex flex-col gap-3"
            >
              <div>
                <p className="rotulo text-[0.75rem] font-bold">Escaneá el código de</p>
                <p className="break-words text-[1.35rem] font-semibold leading-tight tracking-titular text-tinta">{actual.nombre}</p>
                <p className="text-[0.8rem] text-tinta-suave">
                  {actual.categoria} · {formatearGuarani(actual.precio)}
                  {actual.codigoBarras && <> · ya tiene el código {actual.codigoBarras} (se va a reemplazar)</>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[14rem] flex-1">
                  <Entrada
                    id="codigo-escaneo"
                    autoFocus
                    value={textoEscaneo}
                    onChange={(e) => {
                      setTextoEscaneo(e.target.value.slice(0, 40));
                      setErrorEscaneo(null);
                      setConflicto(null);
                    }}
                    autoComplete="off"
                    placeholder="Apuntá el lector al producto…"
                    aria-label="Código de barras del producto"
                    invalido={!!errorEscaneo}
                    className="!h-12 !border-2 !border-azul/50 !text-[1.1rem]"
                  />
                </div>
                <button type="submit" disabled={pendiente || !textoEscaneo.trim()} className={clasesBoton("navegar", "md")}>
                  {pendiente ? "Guardando…" : "Guardar"}
                </button>
                <button type="button" onClick={saltar} className={clasesBoton("suave", "md")} title="Dejarlo sin código por ahora y pasar al siguiente">
                  Saltar →
                </button>
              </div>
              {errorEscaneo && (
                <div className="flex flex-col gap-2">
                  <MensajeError>{errorEscaneo}</MensajeError>
                  {conflicto && (
                    <div>
                      <button type="button" onClick={() => guardarEscaneo(true)} disabled={pendiente} className={clasesBoton("navegar", "sm")}>
                        Pasárselo a este producto (se lo saca a «{conflicto.nombre}»)
                      </button>
                    </div>
                  )}
                </div>
              )}
              {ultimoGuardado && <p className="text-[0.82rem] font-semibold text-exito">✓ Guardado: {ultimoGuardado}</p>}
              <p className="text-[0.76rem] text-tinta-suave">
                El lector termina con Enter y el código se guarda solo. Quedan <strong>{sinCodigo}</strong> productos sin código.
              </p>
            </form>
          ) : (
            <div>
              <p className="text-[1rem] font-semibold text-exito">✓ Todos los productos de esta lista tienen código.</p>
              {ultimoGuardado && <p className="mt-1 text-[0.82rem] text-tinta-media">El último: {ultimoGuardado}</p>}
              <p className="mt-1 text-[0.82rem] text-tinta-media">Podés salir del modo con el botón de arriba o imprimir las etiquetas de los productos nuevos.</p>
            </div>
          )}
        </Tarjeta>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[30rem_minmax(0,1fr)]">
        {/* ---------------- izquierda: filtros + lista ---------------- */}
        <Tarjeta padding={false} className="!border-2 !border-azul/50 flex flex-col overflow-hidden">
          <div className="campos-grises flex flex-col gap-2 border-b border-linea p-3">
            <Entrada
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value.slice(0, 60))}
              placeholder="Buscar por nombre, grupo o código"
              aria-label="Buscar producto"
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2">
              <div className="min-w-[10rem] flex-1">
                <Selector aria-label="Grupo" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                  <option value={TODAS}>Todos los grupos</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Selector>
              </div>
              <div className="min-w-[10rem] flex-1">
                <Selector aria-label="Estado del código" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}>
                  <option value="todos">Todos ({total})</option>
                  <option value="sin">Sin código ({sinCodigo})</option>
                  <option value="con">Con código ({conCodigo})</option>
                </Selector>
              </div>
            </div>
          </div>

          <div className="max-h-[34rem] overflow-y-auto">
            {visibles.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-tinta-suave">
                {total === 0 ? "Todavía no cargaste productos." : "Ningún producto coincide con lo elegido."}
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-superficie">
                  <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                    <th scope="col" className="px-2 py-2 sm:px-3">
                      Producto
                    </th>
                    <th scope="col" className="px-2 py-2 sm:px-3">
                      Código
                    </th>
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Ver</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => {
                    const esActual = escaneando ? actual?.id === p.id : abiertoId === p.id;
                    return (
                      <tr
                        key={p.id}
                        tabIndex={0}
                        title={escaneando ? "Tocá para codificar este producto" : "Doble clic para ver el código"}
                        onClick={() => {
                          if (escaneando) {
                            setActualId(p.id);
                            setErrorEscaneo(null);
                            setConflicto(null);
                            setTextoEscaneo("");
                          }
                        }}
                        onDoubleClick={() => {
                          if (!escaneando) setAbiertoId(p.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          if (escaneando) setActualId(p.id);
                          else setAbiertoId(p.id);
                        }}
                        className={`cursor-pointer border-b border-linea-fina text-[0.84rem] outline-none transition-colors focus-visible:bg-papel-hundido ${
                          esActual ? "bg-brand-light text-brand-texto" : "hover:bg-papel-suave"
                        } ${p.disponible ? "" : "opacity-60"}`}
                      >
                        <td className="px-2 py-2 font-medium sm:px-3">
                          {p.nombre}
                          <span className="block text-[0.72rem] font-normal text-tinta-suave">{p.categoria}</span>
                        </td>
                        <td className="px-2 py-2 sm:px-3">
                          {p.codigoBarras ? (
                            <span className="cifra text-[0.8rem]">
                              <span className="whitespace-nowrap">{p.codigoBarras}</span>
                              {/* En el celular la marca «propio» baja debajo del número: así la tabla no se ensancha más que la pantalla. */}
                              {esCodigoInterno(p.codigoBarras) && (
                                <span className="mt-0.5 block align-middle sm:ml-1.5 sm:mt-0 sm:inline">
                                  <Pastilla color="azul">propio</Pastilla>
                                </span>
                              )}
                            </span>
                          ) : (
                            <Pastilla color="aviso">Sin código</Pastilla>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {!escaneando && (
                            <button type="button" onClick={() => setAbiertoId(p.id)} className={clasesBoton("suave", "sm")}>
                              Ver
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="border-t border-linea px-3 py-2 text-[0.74rem] text-tinta-suave">
            {escaneando
              ? "Tocá un producto para codificar ese primero; si no, sigue el orden de la lista."
              : "Doble clic en un producto, o el botón Ver, para ver y cambiar su código."}
          </p>
        </Tarjeta>

        {/* ---------------- derecha: el código del producto abierto ---------------- */}
        <div>
          {abierto ? (
            <Tarjeta className="!border-2 !border-azul/50 flex flex-col gap-3">
              <div>
                <h2 className="break-words text-[1.1rem] font-semibold tracking-titular text-tinta">{abierto.nombre}</h2>
                <p className="text-[0.8rem] text-tinta-suave">
                  {abierto.categoria} · {formatearGuarani(abierto.precio)}
                </p>
              </div>
              {puedeEditar ? (
                <CodigoBarrasProducto
                  key={abierto.id}
                  productId={abierto.id}
                  codigo={abierto.codigoBarras}
                  onCambio={(c) => actualizarCodigo(abierto.id, c)}
                />
              ) : (
                <SoloVerCodigo codigo={abierto.codigoBarras} />
              )}
            </Tarjeta>
          ) : (
            <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">
                {escaneando ? "Cargando códigos escaneando" : "Ningún producto abierto"}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] leading-snug text-tinta-media">
                {escaneando
                  ? "Escaneá un producto tras otro: cada código se guarda solo. Al terminar, salí de este modo para ver o cambiar el código de cada producto."
                  : puedeEditar
                    ? "Hacé doble clic en un producto para ver su código, escanearlo o generarle uno propio. Para cargar muchos de una vez, usá «Asignar escaneando»."
                    : "Hacé doble clic en un producto para ver su código."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** El código de un producto para quien no puede editar: solo se ve. */
function SoloVerCodigo({ codigo }: { codigo: string | null }) {
  if (!codigo) return <p className="text-[0.84rem] text-tinta-media">Este producto todavía no tiene código.</p>;
  const barras = barrasDeCodigo(codigo);
  const medida = barras ? medirBarras(barras.tipo, 38, 203) : null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="cifra text-[1.15rem] font-semibold tracking-wider text-tinta">{codigo}</p>
      {barras && medida?.ok && (
        <div className="overflow-hidden rounded-lg border border-linea bg-white p-1.5">
          <BarrasSvg codigo={codigo} moduloMm={medida.moduloMm} altoBarrasMm={11} altoNumerosMm={2.6} />
        </div>
      )}
    </div>
  );
}
