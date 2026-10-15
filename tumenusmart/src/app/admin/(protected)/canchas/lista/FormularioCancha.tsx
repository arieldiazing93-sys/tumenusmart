"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { Interruptor } from "@/components/Interruptor";
import {
  DEPORTES_CANCHA,
  DURACIONES_DISPONIBLES,
  PASOS_DE_CANCHA,
  etiquetaDeDeporte,
  lineasDePreciosEspeciales,
  textoDuracionCancha,
  type CanchaFila,
  type DatosCancha,
} from "@/lib/canchas";
import { comprimirImagen, PARA_LOGO } from "@/lib/comprimir-imagen";
import { TASAS_IVA } from "@/lib/iva";
import { PromocionesProducto } from "../../productos/PromocionesProducto";
import { actualizarCancha, crearCancha, eliminarCancha, guardarPreciosDeCancha, subirFotoDeCancha } from "./actions";

/** Cómo se escribe un precio en la pantalla: "80000" → "80.000". */
function textoDePrecio(n: number | null): string {
  return n == null ? "" : n.toLocaleString("es-PY");
}

/**
 * El formulario para dar de alta (o editar) una cancha. Vive adentro del panel lateral: el cuerpo se desliza y el pie con
 * "Cancelar" y "Crear" queda fijo abajo, siempre a la vista, también en el celular.
 *
 * No usa `action={...}` del formulario a propósito: React vacía los campos al terminar una acción, y con un error de
 * validación la persona tendría que volver a escribir todo.
 */
export function FormularioCancha({
  cancha,
  grupos = [],
  onCerrar,
}: {
  cancha: CanchaFila | null;
  /** Los grupos de canchas que ya existen en el punto de venta (para sugerirlos). */
  grupos?: string[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const editando = cancha !== null;
  const [datos, setDatos] = useState<DatosCancha>({
    nombre: cancha?.nombre ?? "",
    deporte: cancha?.deporte ?? "futbol5",
    superficie: cancha?.superficie ?? "",
    techada: cancha?.techada ?? false,
    descripcion: cancha?.descripcion ?? "",
    fotoUrl: cancha?.fotoUrl ?? "",
    precioHora: textoDePrecio(cancha?.precioHora ?? null),
    precioNocturnoHora: textoDePrecio(cancha?.precioNocturnoHora ?? null),
    nocheDesde: cancha?.nocheDesde ?? "18:00",
    duraciones: cancha?.duraciones ?? [60, 90, 120],
    pasoMin: cancha?.pasoMin ?? 30,
    activa: cancha?.activa ?? true,
    categoria: cancha?.categoria ?? "",
    iva: cancha?.iva ?? "gravado10",
  });
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);

  function cambiar(parche: Partial<DatosCancha>) {
    setDatos((d) => ({ ...d, ...parche }));
    setError(null);
  }

  function alternarDuracion(minutos: number) {
    // Con la función del estado (y no con `datos`): dos toques seguidos parten siempre de lo último, no de lo que se veía.
    setDatos((d) => {
      const ya = d.duraciones.includes(minutos);
      // Siempre queda al menos una: una cancha sin duraciones no se podría reservar.
      if (ya && d.duraciones.length === 1) return d;
      const nuevas = ya ? d.duraciones.filter((x) => x !== minutos) : [...d.duraciones, minutos];
      return { ...d, duraciones: nuevas.sort((a, b) => a - b) };
    });
    setError(null);
  }

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    setErrorFoto(null);
    setSubiendo(true);
    try {
      // Se achica en el propio celular antes de subirla: una foto de cámara pesa varios MB.
      const { archivo: liviano } = await comprimirImagen(elegido, PARA_LOGO);
      const formData = new FormData();
      formData.set("archivo", liviano);
      const subida = await subirFotoDeCancha(formData);
      if (!subida.ok) {
        setErrorFoto(subida.error);
        return;
      }
      cambiar({ fotoUrl: subida.url });
    } catch (err) {
      setErrorFoto(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const resultado = cancha ? await actualizarCancha(cancha.id, datos) : await crearCancha(datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      onCerrar();
    });
  }

  function borrar() {
    if (!cancha) return;
    setError(null);
    iniciar(async () => {
      const resultado = await eliminarCancha(cancha.id);
      if (!resultado.ok) {
        setError(resultado.error);
        setConfirmandoBorrar(false);
        return;
      }
      router.refresh();
      onCerrar();
    });
  }

  return (
    <form onSubmit={alEnviar} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {/* ---------- foto ---------- */}
        <div className="flex flex-col items-center gap-3 border-b border-linea pb-5">
          <div className="flex h-32 w-full max-w-xs items-center justify-center overflow-hidden rounded-xl bg-brand-light text-[2.4rem]">
            {datos.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={datos.fotoUrl} alt="Foto de la cancha" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true">⚽</span>
            )}
          </div>
          <label className={`${clasesBoton("suave", "md")} cursor-pointer`}>
            {subiendo ? "Subiendo…" : datos.fotoUrl ? "Cambiar foto" : "Subir foto"}
            <input
              ref={archivo}
              type="file"
              accept="image/*"
              onChange={alElegirFoto}
              disabled={subiendo}
              className="hidden"
            />
          </label>
          {datos.fotoUrl && (
            <button
              type="button"
              onClick={() => cambiar({ fotoUrl: "" })}
              className="text-[0.78rem] font-medium text-peligro hover:underline"
            >
              Quitar foto
            </button>
          )}
          {errorFoto && <MensajeError>{errorFoto}</MensajeError>}
        </div>

        {/* ---------- datos ---------- */}
        <Campo etiqueta="Nombre de la cancha">
          <Entrada
            required
            autoFocus
            maxLength={60}
            value={datos.nombre}
            onChange={(e) => cambiar({ nombre: e.target.value })}
            placeholder="Ej: Cancha 1, Pádel A"
          />
        </Campo>

        <Campo etiqueta="Tipo de cancha" ayuda="Es lo que el cliente elige primero al reservar.">
          <Selector value={datos.deporte} onChange={(e) => cambiar({ deporte: e.target.value })}>
            {DEPORTES_CANCHA.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo etiqueta="Superficie (opcional)">
          <Entrada
            maxLength={40}
            value={datos.superficie}
            onChange={(e) => cambiar({ superficie: e.target.value })}
            placeholder="Ej: Césped sintético, Cemento, Arena"
          />
        </Campo>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-linea bg-papel-suave px-3 py-1.5">
          <span>
            <span className="block text-[0.86rem] font-semibold text-tinta">Techada</span>
            <span className="block text-[0.78rem] leading-snug text-tinta-suave">Se juega aunque llueva.</span>
          </span>
          <Interruptor activo={datos.techada} onChange={(v) => cambiar({ techada: v })} etiqueta="Cancha techada" />
        </div>

        <Campo etiqueta="Descripción (opcional)">
          <Area
            rows={2}
            maxLength={300}
            value={datos.descripcion}
            onChange={(e) => cambiar({ descripcion: e.target.value })}
            placeholder="Ej: 5 contra 5, con vestuarios e iluminación LED"
          />
        </Campo>

        {/* ---------- cómo se vende y se factura: el grupo del punto de venta y el IVA ---------- */}
        <div className="rounded-xl border-2 border-azul/50 p-3.5">
          <h3 className="mb-1 text-[0.92rem] font-semibold tracking-titular text-tinta">En el punto de venta y en la factura</h3>
          <p className="mb-3 text-[0.78rem] leading-snug text-tinta-suave">
            Cada cancha se ve en el punto de venta como un producto (alquiler por hora), dentro de su grupo. Así podés cobrar en el
            mostrador a quien no reservó, con ticket o factura.
          </p>
          <div className="flex flex-col gap-3.5">
            <Campo
              etiqueta="Grupo en el punto de venta"
              ayuda="Como las categorías de la carta: «Fútbol 5», «Pádel»… Si lo dejás vacío se usa el tipo de cancha."
            >
              <Entrada
                list="grupos-de-canchas"
                maxLength={40}
                value={datos.categoria}
                onChange={(e) => cambiar({ categoria: e.target.value })}
                placeholder={etiquetaDeDeporte(datos.deporte)}
              />
              <datalist id="grupos-de-canchas">
                {grupos.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Campo>

            <Campo etiqueta="IVA del alquiler">
              <Selector value={datos.iva} onChange={(e) => cambiar({ iva: e.target.value })}>
                {TASAS_IVA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Selector>
            </Campo>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-papel-suave px-3 py-2.5 text-[0.8rem]">
              <dt className="text-tinta-suave">Unidad de medida</dt>
              <dd className="font-semibold text-tinta">Hora</dd>
              <dt className="text-tinta-suave">Tipo</dt>
              <dd className="font-semibold text-tinta">Prestación de servicios</dd>
            </dl>
            <p className="-mt-1 text-[0.76rem] leading-snug text-tinta-suave">
              En el punto de venta, para 1 hora tocás la cancha; para 1 h 30 escribís <strong>1,5</strong> en «Cantidad» y después tocás
              la cancha. La factura electrónica sale con el IVA de acá y la unidad Hora.
            </p>
          </div>
        </div>

        {/* ---------- precio ---------- */}
        <div className="rounded-xl border-2 border-azul/50 p-3.5">
          <h3 className="mb-3 text-[0.92rem] font-semibold tracking-titular text-tinta">Precio</h3>
          <div className="flex flex-col gap-3.5">
            <Campo etiqueta="Precio por hora (Gs.)" ayuda="Lo que cuesta una hora de día. Una hora y media cuesta una vez y media.">
              <Entrada
                required
                inputMode="numeric"
                value={datos.precioHora}
                onChange={(e) => cambiar({ precioHora: e.target.value })}
                placeholder="Ej: 80.000"
                className="cifra"
              />
            </Campo>

            <Campo
              etiqueta="Precio por hora de noche (opcional)"
              ayuda="Si de noche cobrás más (por la luz), escribilo acá. Vacío = cuesta lo mismo todo el día."
            >
              <Entrada
                inputMode="numeric"
                value={datos.precioNocturnoHora}
                onChange={(e) => cambiar({ precioNocturnoHora: e.target.value })}
                placeholder="Ej: 100.000"
                className="cifra"
              />
            </Campo>

            {datos.precioNocturnoHora.trim() !== "" && (
              <Campo etiqueta="La tarifa de noche rige desde las">
                <Entrada
                  type="time"
                  value={datos.nocheDesde}
                  onChange={(e) => cambiar({ nocheDesde: e.target.value })}
                  className="cifra max-w-[10rem]"
                />
              </Campo>
            )}
          </div>
        </div>

        {/* ---------- precios por día y horario (sábado y domingo, una franja…) ---------- */}
        <div className="rounded-xl border-2 border-azul/50 p-3.5">
          <h3 className="mb-1 text-[0.92rem] font-semibold tracking-titular text-tinta">Precios por día y horario</h3>
          <p className="mb-3 text-[0.78rem] leading-snug text-tinta-suave">
            Si la hora cuesta distinto según el día (por ejemplo, de lunes a viernes 80.000 y sábado y domingo 100.000), cargalo acá: el precio
            de arriba es el de siempre y estos mandan en sus días y horas. Valen en las reservas y en el mostrador del punto de venta.
          </p>
          {editando && cancha ? (
            <div className="flex flex-col items-start gap-2.5">
              <PromocionesProducto
                productId={cancha.id}
                nombreProducto={cancha.nombre}
                precioNormal={cancha.precioHora}
                promociones={cancha.promos}
                modo="cancha"
                guardar={guardarPreciosDeCancha}
              />
              {cancha.promos.length > 0 ? (
                <ul className="flex flex-col gap-0.5 text-[0.84rem] text-tinta">
                  {lineasDePreciosEspeciales(cancha.promos).map((linea) => (
                    <li key={linea}>• {linea}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[0.8rem] text-tinta-suave">Todavía no cargaste ninguno: la cancha cuesta siempre lo mismo.</p>
              )}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-linea px-3 py-2.5 text-[0.82rem] text-tinta-suave">
              Guardá la cancha primero; después, abriéndola de nuevo, cargás acá los precios por día y horario.
            </p>
          )}
        </div>

        {/* ---------- cuánto tiempo y cada cuánto ---------- */}
        <div className="rounded-xl border-2 border-azul/50 p-3.5">
          <h3 className="mb-1 text-[0.92rem] font-semibold tracking-titular text-tinta">Cuánto tiempo se puede reservar</h3>
          <p className="mb-3 text-[0.78rem] leading-snug text-tinta-suave">
            Marcá las duraciones que ofrecés. El cliente elige una al reservar.
          </p>
          <div className="flex flex-wrap gap-2">
            {DURACIONES_DISPONIBLES.map((d) => {
              const marcada = datos.duraciones.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => alternarDuracion(d)}
                  className={`rounded-full border px-4 py-2 text-[0.86rem] font-semibold transition-colors ${
                    marcada
                      ? "border-azul bg-azul-luz text-azul-oscuro"
                      : "border-linea bg-superficie text-tinta-media hover:border-azul/50"
                  }`}
                >
                  {textoDuracionCancha(d)}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <Campo
              etiqueta="Los horarios arrancan cada"
              ayuda="Cada 30 minutos ofrece 18:00, 18:30, 19:00… Cada hora ofrece 18:00, 19:00, 20:00…"
            >
              <Selector value={datos.pasoMin} onChange={(e) => cambiar({ pasoMin: Number(e.target.value) })}>
                {PASOS_DE_CANCHA.map((p) => (
                  <option key={p} value={p}>
                    {p === 60 ? "1 hora" : `${p} minutos`}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>
        </div>

        {editando && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-linea bg-papel-suave px-3 py-1.5">
            <span>
              <span className="block text-[0.86rem] font-semibold text-tinta">Activa</span>
              <span className="block text-[0.78rem] leading-snug text-tinta-suave">
                Si la desactivás, deja de aparecer para reservar, pero sus reservas anteriores se conservan.
              </span>
            </span>
            <Interruptor activo={datos.activa} onChange={(v) => cambiar({ activa: v })} etiqueta="Cancha activa" />
          </div>
        )}

        {editando && !cancha.tieneReservas && (
          <div className="border-t border-linea pt-4">
            {confirmandoBorrar ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[0.84rem] font-medium text-tinta">¿Borrar esta cancha?</span>
                <button type="button" onClick={borrar} disabled={pendiente} className={clasesBoton("peligro", "sm")}>
                  Sí, borrar
                </button>
                <button type="button" onClick={() => setConfirmandoBorrar(false)} className={clasesBoton("suave", "sm")}>
                  No
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmandoBorrar(true)} className={clasesBoton("peligro", "sm")}>
                Borrar cancha
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------- pie fijo ---------- */}
      <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-5 py-4">
        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={clasesBoton("peligro", "md")}>
            Cancelar
          </button>
          <button type="submit" disabled={pendiente || subiendo} className={clasesBoton(editando ? "navegar" : "nuevo", "md")}>
            {pendiente ? "Guardando…" : editando ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </form>
  );
}
