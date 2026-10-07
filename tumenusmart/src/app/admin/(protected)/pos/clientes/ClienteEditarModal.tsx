"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Boton, Campo, Entrada, Selector, MensajeError, clasesBoton } from "@/components/ui";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { formatearNumero } from "@/lib/format";
import { comprimirImagen, PARA_PRODUCTO } from "@/lib/comprimir-imagen";
import { actualizarCliente, subirFotoDelCliente } from "./actions";

/**
 * Edición de un cliente ya existente, en ventana modal (mismo estilo que
 * ClienteFiscalModal del POS).
 *
 * Se puede corregir todo menos la Clave (correlativo interno, no algo que se
 * "corrige"): nombre o razón social, teléfono, tipo y N° de identificación
 * (RUC, cédula…) y correo. Los datos de una venta ya emitida quedan
 * congelados en sus propios campos (VentaPos), así que editar esta ficha no
 * altera ningún ticket ya impreso — sirve para arreglar un RUC, un teléfono
 * o una razón social mal tipeados de acá en adelante.
 */
export function ClienteEditarModal({
  id,
  numero,
  nombre,
  telefono,
  email,
  tipoIdentificacion,
  numeroIdentificacion,
  fotoUrl,
  onCerrar,
  onGuardado,
}: {
  id: string;
  numero: number | null;
  nombre: string;
  telefono: string | null;
  email: string | null;
  tipoIdentificacion: string | null;
  numeroIdentificacion: string | null;
  /** El último peinado/corte que se le hizo (Reserva de turnos). */
  fotoUrl?: string | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [valorNombre, setValorNombre] = useState(nombre);
  const [valorTelefono, setValorTelefono] = useState(telefono ?? "");
  const [valorEmail, setValorEmail] = useState(email ?? "");
  const [valorTipo, setValorTipo] = useState(tipoIdentificacion ?? TIPOS_IDENTIFICACION_FISCAL[0].valor);
  const [valorNumeroIdent, setValorNumeroIdent] = useState(numeroIdentificacion ?? "");
  const [valorFoto, setValorFoto] = useState(fotoUrl ?? "");
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    setErrorFoto(null);
    setSubiendoFoto(true);
    try {
      // El barbero necesita ver el detalle del corte, no solo reconocer una
      // cara chica: mismo tamaño que la foto de un producto, más grande que
      // el avatar redondo del personal.
      const { archivo: liviano } = await comprimirImagen(elegido, PARA_PRODUCTO);
      const datos = new FormData();
      datos.set("archivo", liviano);
      const subida = await subirFotoDelCliente(datos);
      if (!subida.ok) {
        setErrorFoto(subida.error);
        return;
      }
      setValorFoto(subida.url);
    } catch (err) {
      setErrorFoto(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendoFoto(false);
      if (inputFoto.current) inputFoto.current.value = "";
    }
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const r = await actualizarCliente(id, {
        nombre: valorNombre,
        telefono: valorTelefono,
        email: valorEmail,
        // Sin número no hay identificación: el tipo solo vale acompañando a un número.
        tipoIdentificacion: valorNumeroIdent.trim() ? valorTipo : "",
        numeroIdentificacion: valorNumeroIdent,
        fotoUrl: valorFoto,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onGuardado();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar cliente"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-sm sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Editar cliente
          </p>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <Campo etiqueta="Clave">
            <Entrada value={numero != null ? formatearNumero(numero) : "—"} disabled />
          </Campo>

          <Campo etiqueta="Nombre / Razón social">
            <Entrada value={valorNombre} onChange={(e) => setValorNombre(e.target.value)} autoFocus />
          </Campo>

          <Campo etiqueta="Teléfono">
            <Entrada
              type="tel"
              inputMode="tel"
              value={valorTelefono}
              onChange={(e) => setValorTelefono(e.target.value)}
              placeholder="0981 123 456"
            />
          </Campo>

          <Campo etiqueta="Tipo de identificación">
            <Selector value={valorTipo} onChange={(e) => setValorTipo(e.target.value)}>
              {TIPOS_IDENTIFICACION_FISCAL.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="N° de RUC / Cédula / etc.">
            <Entrada
              value={valorNumeroIdent}
              onChange={(e) => setValorNumeroIdent(e.target.value)}
              placeholder="Dejalo vacío si no tiene"
            />
          </Campo>

          <Campo etiqueta="Correo electrónico">
            <Entrada
              type="email"
              value={valorEmail}
              onChange={(e) => setValorEmail(e.target.value)}
              placeholder="cliente@correo.com"
            />
          </Campo>

          <div>
            <label className="mb-1 block text-sm font-semibold text-tinta">
              Último peinado/corte (opcional)
            </label>
            <p className="mb-1.5 text-xs leading-snug text-tinta-media">
              Se pisa cada vez que subís una foto nueva: siempre queda solo la última.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-lg border border-linea bg-papel-suave">
                {valorFoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={valorFoto} alt="Último peinado" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-tinta-suave">Sin foto</span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className={`${clasesBoton("suave", "sm")} cursor-pointer`}>
                  {subiendoFoto ? "Subiendo…" : valorFoto ? "Cambiar foto" : "Subir foto"}
                  <input
                    ref={inputFoto}
                    type="file"
                    accept="image/*"
                    onChange={alElegirFoto}
                    disabled={subiendoFoto}
                    className="hidden"
                  />
                </label>
                {valorFoto && (
                  <button
                    type="button"
                    onClick={() => setValorFoto("")}
                    className="text-left text-xs text-peligro hover:underline"
                  >
                    Quitar foto
                  </button>
                )}
              </div>
            </div>
            {errorFoto && <MensajeError>{errorFoto}</MensajeError>}
          </div>

          {error && <MensajeError>{error}</MensajeError>}
        </div>

        <div className="mt-5 flex gap-2">
          <div className="flex-1">
            <Boton tono="peligro" tam="lg" onClick={onCerrar} className="w-full">
              Cancelar
            </Boton>
          </div>
          <div className="flex-[2]">
            <Boton tono="navegar" tam="lg" onClick={guardar} disabled={pending} className="w-full">
              {pending ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
