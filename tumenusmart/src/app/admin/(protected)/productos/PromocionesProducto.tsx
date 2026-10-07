"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Campo, Entrada, Pastilla, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { DIAS_ORDENADOS, NOMBRES_DIA } from "@/lib/horario-atencion";
import {
  SEGUNDOS_DIA,
  describirTramo,
  precioEnPosicion,
  segundosDeHora,
  textoDeHora,
  validarTramos,
  type TramoPromocion,
} from "@/lib/precio-promocion";
import { guardarPromocionesProducto } from "./actions";

/** Una fila de la hoja: un día de inicio, con su franja y su precio. `aplica` = la casilla "Aplica Lunes". */
type Fila = {
  dia: number;
  aplica: boolean;
  horaInicio: string;
  diaFin: number;
  horaFin: string;
  precio: string;
};

const DIAS_CORTOS = ["D", "L", "M", "X", "J", "V", "S"];

function filaVacia(dia: number): Fila {
  return { dia, aplica: false, horaInicio: "00:00:00", diaFin: dia, horaFin: "23:59:59", precio: "" };
}

/** Las siete filas en el orden de la semana del negocio (lunes primero), con lo ya guardado. */
function filasDesde(promociones: TramoPromocion[]): Fila[] {
  return DIAS_ORDENADOS.map((dia) => {
    const guardada = promociones.find((p) => p.diaInicio === dia);
    return guardada
      ? {
          dia,
          aplica: true,
          horaInicio: guardada.horaInicio,
          diaFin: guardada.diaFin,
          horaFin: guardada.horaFin,
          precio: String(Math.round(guardada.precio)),
        }
      : filaVacia(dia);
  });
}

/** Lo que se manda al servidor: solo las filas con la casilla puesta. */
function entradasDe(filas: Fila[]) {
  return filas
    .filter((f) => f.aplica)
    .map((f) => ({ diaInicio: f.dia, horaInicio: f.horaInicio, diaFin: f.diaFin, horaFin: f.horaFin, precio: f.precio }));
}

/**
 * El botón "Precios de promoción" de la ficha de un producto y el cuadro donde se configuran: por cada día de la semana, desde qué
 * hora hasta qué hora (el fin puede caer en otro día, para cruzar la medianoche) y a qué precio se vende. Cuando pasa la franja,
 * el producto vuelve solo a su precio normal. Vale en todos los canales de venta (mostrador, comedor, delivery, mozo y carta pública).
 *
 * Es la misma hoja que "Precios de promoción" de SoftRestaurant, con una carga rápida arriba para el caso de todos los días
 * ("de lunes a viernes de 18 a 20 horas a 27.000") y un probador para comprobar a qué precio sale en un día y hora cualquiera.
 * Lo que se escribe se revisa en el acto con las mismas reglas con que lo revisa el servidor al guardar.
 */
export function PromocionesProducto({
  productId,
  nombreProducto,
  precioNormal,
  promociones,
}: {
  productId: string;
  nombreProducto: string;
  precioNormal: number;
  promociones: TramoPromocion[];
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={clasesBoton("navegar", "sm")}>
        🏷 Precios de promoción{promociones.length > 0 ? ` (${promociones.length})` : ""}
      </button>
      {abierto && (
        <CuadroPromociones
          productId={productId}
          nombreProducto={nombreProducto}
          precioNormal={precioNormal}
          promociones={promociones}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function CuadroPromociones({
  productId,
  nombreProducto,
  precioNormal,
  promociones,
  onCerrar,
}: {
  productId: string;
  nombreProducto: string;
  precioNormal: number;
  promociones: TramoPromocion[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [montado, setMontado] = useState(false);
  const [filas, setFilas] = useState<Fila[]>(() => filasDesde(promociones));
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  // Carga rápida
  const [diasRapidos, setDiasRapidos] = useState<number[]>([]);
  const [desde, setDesde] = useState("18:00:00");
  const [hasta, setHasta] = useState("20:00:00");
  const [precioRapido, setPrecioRapido] = useState("");
  const [errorRapido, setErrorRapido] = useState<string | null>(null);

  // Probador
  const [diaProbado, setDiaProbado] = useState(DIAS_ORDENADOS[0]);
  const [horaProbada, setHoraProbada] = useState("19:00:00");

  useEffect(() => setMontado(true), []);
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !pendiente) onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = previo;
    };
  }, [onCerrar, pendiente]);

  function cambiar(dia: number, cambios: Partial<Fila>) {
    setErrorServidor(null);
    setFilas((actuales) => actuales.map((f) => (f.dia === dia ? { ...f, ...cambios } : f)));
  }

  function aplicarRapido() {
    setErrorRapido(null);
    if (diasRapidos.length === 0) return setErrorRapido("Elegí al menos un día.");
    const si = segundosDeHora(desde);
    const sf = segundosDeHora(hasta);
    if (si === null || sf === null) return setErrorRapido("Escribí la hora de inicio y la de fin.");
    const precio = Number(precioRapido.replace(",", "."));
    if (!Number.isFinite(precio) || precio <= 0) return setErrorRapido("Escribí el precio de promoción.");
    if (si === sf) return setErrorRapido("El inicio y el fin no pueden ser la misma hora.");
    // Si el fin queda antes que el inicio (22:00 a 02:00) la promoción cruza la medianoche: termina al día siguiente.
    const cruza = sf < si;
    setErrorServidor(null);
    setFilas((actuales) =>
      actuales.map((f) =>
        diasRapidos.includes(f.dia)
          ? {
              dia: f.dia,
              aplica: true,
              horaInicio: textoDeHora(si),
              diaFin: cruza ? (f.dia + 1) % 7 : f.dia,
              horaFin: textoDeHora(sf),
              precio: String(Math.round(precio)),
            }
          : f
      )
    );
  }

  function elegirDias(dias: number[]) {
    setDiasRapidos(dias);
    setErrorRapido(null);
  }

  // Lo que escribió, revisado con las reglas del servidor: un solo precio por momento, nada que termine antes de empezar.
  const validacion = useMemo(() => validarTramos(entradasDe(filas)), [filas]);

  const resultadoProbador = useMemo(() => {
    if (!validacion.ok) return null;
    const s = segundosDeHora(horaProbada);
    if (s === null) return null;
    const v = precioEnPosicion(precioNormal, validacion.tramos, diaProbado * SEGUNDOS_DIA + s);
    return v;
  }, [validacion, horaProbada, diaProbado, precioNormal]);

  function guardar() {
    setErrorServidor(null);
    if (!validacion.ok) return;
    iniciar(async () => {
      const r = await guardarPromocionesProducto(productId, entradasDe(filas));
      if (!r.ok) {
        setErrorServidor(r.error);
        return;
      }
      router.refresh();
      onCerrar();
    });
  }

  function quitarTodas() {
    if (!confirm("¿Quitar todas las promociones de este producto? Vuelve a venderse siempre a su precio normal.")) return;
    setErrorServidor(null);
    setFilas(DIAS_ORDENADOS.map(filaVacia));
  }

  const cantidadActivas = filas.filter((f) => f.aplica).length;

  const contenido = (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-tinta/45 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!pendiente) onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Precios de promoción de ${nombreProducto}`}
        className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-alta sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-linea px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[1.05rem] font-semibold tracking-titular text-tinta">Precios de promoción</p>
            <p className="break-words text-[0.85rem] text-tinta-media">
              {nombreProducto} · precio normal <span className="cifra font-semibold">{formatearGuarani(precioNormal)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            aria-label="Cerrar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
          <p className="text-[0.84rem] leading-snug text-tinta-media">
            En los días y horas que cargues, el producto se vende al precio de promoción — en el mostrador, el comedor, el delivery, la tablet
            del mozo y la carta pública. Cuando termina la franja, vuelve solo a su precio normal. Las horas son las de Asunción. A la hora de fin
            ya rige el precio normal: <strong>“hasta las 20:00”</strong> y <strong>19:59:59</strong> son lo mismo.
          </p>

          {/* ---------------- carga rápida ---------------- */}
          <div className="campos-grises flex flex-col gap-3 rounded-xl border border-azul/30 bg-azul-luz p-3.5">
            <p className="rotulo text-[0.78rem] font-bold text-azul-oscuro">Carga rápida</p>
            <p className="text-[0.8rem] text-tinta-media">
              Elegí los días, el horario y el precio, y se completan esos días en la hoja de abajo. Por ejemplo: lunes a viernes, de 18:00 a 20:00,
              a {formatearGuarani(Math.round(precioNormal * 0.9))}.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {DIAS_ORDENADOS.map((dia) => {
                const activo = diasRapidos.includes(dia);
                return (
                  <button
                    key={dia}
                    type="button"
                    aria-pressed={activo}
                    aria-label={NOMBRES_DIA[dia]}
                    title={NOMBRES_DIA[dia]}
                    onClick={() => elegirDias(activo ? diasRapidos.filter((d) => d !== dia) : [...diasRapidos, dia])}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border text-[0.85rem] font-semibold transition-colors ${
                      activo ? "border-azul bg-azul text-white" : "border-linea bg-white text-tinta-media hover:border-azul"
                    }`}
                  >
                    {DIAS_CORTOS[dia]}
                  </button>
                );
              })}
              <button type="button" onClick={() => elegirDias([1, 2, 3, 4, 5])} className={clasesBoton("suave", "sm")}>
                Lunes a viernes
              </button>
              <button type="button" onClick={() => elegirDias([6, 0])} className={clasesBoton("suave", "sm")}>
                Fin de semana
              </button>
              <button type="button" onClick={() => elegirDias(DIAS_ORDENADOS)} className={clasesBoton("suave", "sm")}>
                Todos
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo etiqueta="Desde">
                <Entrada type="time" step={1} value={desde} onChange={(e) => setDesde(e.target.value)} />
              </Campo>
              <Campo etiqueta="Hasta">
                <Entrada type="time" step={1} value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </Campo>
              <Campo etiqueta="Precio de promoción">
                <Entrada
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={precioRapido}
                  onChange={(e) => setPrecioRapido(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="Gs."
                />
              </Campo>
              <div className="flex items-end">
                <button type="button" onClick={aplicarRapido} className={`w-full ${clasesBoton("nuevo")}`}>
                  Aplicar a esos días
                </button>
              </div>
            </div>
            {errorRapido && <p className="text-[0.82rem] font-medium text-peligro">{errorRapido}</p>}
          </div>

          {/* ---------------- la hoja, día por día ---------------- */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="rotulo text-[0.78rem] font-bold">Hoja por día</p>
              {cantidadActivas > 0 && (
                <button type="button" onClick={quitarTodas} className={clasesBoton("peligro", "sm")}>
                  Quitar todas
                </button>
              )}
            </div>
            {filas.map((f) => (
              <div
                key={f.dia}
                className={`campos-grises rounded-lg border p-3 transition-colors ${
                  f.aplica ? "border-azul/40 bg-white" : "border-linea bg-papel-suave"
                }`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-[0.9rem] font-semibold text-tinta">
                  <input
                    type="checkbox"
                    checked={f.aplica}
                    onChange={(e) => cambiar(f.dia, { aplica: e.target.checked })}
                    className="h-4 w-4 accent-azul"
                  />
                  Aplica {NOMBRES_DIA[f.dia]}
                </label>
                <div className={`mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 ${f.aplica ? "" : "pointer-events-none opacity-50"}`}>
                  <Campo etiqueta="Inicio">
                    <Entrada
                      type="time"
                      step={1}
                      value={f.horaInicio}
                      disabled={!f.aplica}
                      onChange={(e) => cambiar(f.dia, { horaInicio: e.target.value })}
                    />
                  </Campo>
                  <Campo etiqueta="Fin (día)">
                    <Selector
                      value={f.diaFin}
                      disabled={!f.aplica}
                      onChange={(e) => cambiar(f.dia, { diaFin: Number(e.target.value) })}
                    >
                      {DIAS_ORDENADOS.map((d) => (
                        <option key={d} value={d}>
                          {NOMBRES_DIA[d]}
                          {d === f.dia ? "" : d === (f.dia + 1) % 7 ? " (día siguiente)" : ""}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Fin (hora)">
                    <Entrada
                      type="time"
                      step={1}
                      value={f.horaFin}
                      disabled={!f.aplica}
                      onChange={(e) => cambiar(f.dia, { horaFin: e.target.value })}
                    />
                  </Campo>
                  <Campo etiqueta="Precio promoción">
                    <Entrada
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={f.precio}
                      disabled={!f.aplica}
                      onChange={(e) => cambiar(f.dia, { precio: e.target.value })}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="Gs."
                    />
                  </Campo>
                </div>
              </div>
            ))}
          </div>

          {/* ---------------- resultado de la revisión ---------------- */}
          {!validacion.ok ? (
            <div role="alert" className="rounded-lg border border-peligro/30 bg-peligro-luz px-3 py-2.5 text-[0.85rem] font-medium text-peligro">
              {validacion.error}
            </div>
          ) : validacion.tramos.length > 0 ? (
            <div className="rounded-lg border border-exito/30 bg-exito-luz px-3 py-2.5">
              <p className="mb-1 text-[0.8rem] font-semibold text-exito">Así queda:</p>
              <ul className="flex flex-col gap-0.5 text-[0.84rem] text-tinta">
                {validacion.tramos.map((t) => (
                  <li key={t.diaInicio}>• {describirTramo(t)}</li>
                ))}
              </ul>
              <p className="mt-1 text-[0.78rem] text-tinta-media">Fuera de esas franjas se vende a {formatearGuarani(precioNormal)}.</p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-linea px-3 py-3 text-center text-[0.84rem] text-tinta-suave">
              Sin promociones: este producto se vende siempre a {formatearGuarani(precioNormal)}.
            </p>
          )}

          {/* ---------------- probador ---------------- */}
          {validacion.ok && validacion.tramos.length > 0 && (
            <div className="campos-grises flex flex-col gap-2 rounded-lg border border-linea bg-papel-suave p-3">
              <p className="rotulo text-[0.78rem] font-bold">Probar un horario</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_2fr]">
                <Campo etiqueta="Día">
                  <Selector value={diaProbado} onChange={(e) => setDiaProbado(Number(e.target.value))}>
                    {DIAS_ORDENADOS.map((d) => (
                      <option key={d} value={d}>
                        {NOMBRES_DIA[d]}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <Campo etiqueta="Hora">
                  <Entrada type="time" step={1} value={horaProbada} onChange={(e) => setHoraProbada(e.target.value)} />
                </Campo>
                <div className="col-span-2 flex items-end sm:col-span-1">
                  {resultadoProbador ? (
                    <p className="text-[0.88rem] text-tinta">
                      Se vende a <span className="cifra font-semibold">{formatearGuarani(resultadoProbador.precio)}</span>{" "}
                      {resultadoProbador.enPromocion ? <Pastilla color="exito">Promoción</Pastilla> : <Pastilla color="neutro">Precio normal</Pastilla>}
                    </p>
                  ) : (
                    <p className="text-[0.82rem] text-tinta-suave">Escribí una hora válida.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {errorServidor && (
            <p role="alert" className="text-[0.85rem] font-medium text-peligro">
              {errorServidor}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-linea px-4 py-3 sm:px-5">
          <button type="button" onClick={onCerrar} disabled={pendiente} className={clasesBoton("peligro")}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={pendiente || !validacion.ok} className={clasesBoton("navegar")}>
            {pendiente ? "Guardando…" : "Guardar promociones"}
          </button>
        </div>
      </div>
    </div>
  );

  // En el cuerpo de la página (no dentro del panel de la ficha), así ningún panel lo tapa ni lo recorta.
  return montado ? createPortal(contenido, document.body) : null;
}
