"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { PAISES_TELEFONO, separarTelefono, type MiembroFila } from "@/lib/agenda-personal";
import { comprimirImagen, PARA_LOGO } from "@/lib/comprimir-imagen";
import { actualizarPersonal, crearPersonal, subirFotoDelPersonal } from "./actions";
import { EnlaceTrabajoPersonal } from "./EnlaceTrabajoPersonal";
import { TrabajosYComision } from "./TrabajosYComision";

/**
 * El formulario para dar de alta (o editar) a un miembro del personal. Vive
 * adentro del panel lateral: el cuerpo se desliza y el pie con "Cancelar" y
 * "Crear" queda fijo abajo, siempre a la vista, también en el celular.
 *
 * No usa `action={...}` del formulario a propósito: React vacía los campos al
 * terminar una acción, y con un error de validación la persona tendría que
 * volver a escribir todo.
 */

function Icono({ children, tam = 16 }: { children: React.ReactNode; tam?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="flex-none"
    >
      {children}
    </svg>
  );
}

export function FormularioPersonal({
  miembro,
  onCerrar,
}: {
  /** null para dar de alta a uno nuevo. */
  miembro: MiembroFila | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState(miembro?.fotoUrl ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const editando = miembro !== null;
  const telefono = separarTelefono(miembro?.telefono);

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    setErrorFoto(null);
    setSubiendo(true);
    try {
      // Se achica en el propio celular antes de subirla: una foto de cámara pesa
      // varios MB y en el calendario se ve del tamaño de un botón.
      const { archivo: liviano } = await comprimirImagen(elegido, PARA_LOGO);
      const datos = new FormData();
      datos.set("archivo", liviano);
      const subida = await subirFotoDelPersonal(datos);
      if (!subida.ok) {
        setErrorFoto(subida.error);
        return;
      }
      setFotoUrl(subida.url);
    } catch (err) {
      setErrorFoto(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    iniciar(async () => {
      const resultado = miembro ? await actualizarPersonal(miembro.id, datos) : await crearPersonal(datos);
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
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {/* ---------- foto ---------- */}
        <div className="flex flex-col items-center gap-3 border-b border-linea pb-5">
          <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full bg-brand-light text-brand sm:h-32 sm:w-32">
            {fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoUrl} alt="Foto" className="h-full w-full object-cover" />
            ) : (
              <Icono tam={56}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
              </Icono>
            )}
          </div>
          <label className={`${clasesBoton("suave", "md")} cursor-pointer`}>
            <Icono>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </Icono>
            {subiendo ? "Subiendo…" : fotoUrl ? "Cambiar foto" : "Subir foto"}
            <input
              ref={archivo}
              type="file"
              accept="image/*"
              onChange={alElegirFoto}
              disabled={subiendo}
              className="hidden"
            />
          </label>
          {fotoUrl && (
            <button
              type="button"
              onClick={() => setFotoUrl("")}
              className="text-[0.78rem] font-medium text-peligro hover:underline"
            >
              Quitar foto
            </button>
          )}
          {errorFoto && <MensajeError>{errorFoto}</MensajeError>}
          <input type="hidden" name="fotoUrl" value={fotoUrl} />
        </div>

        {/* ---------- datos ---------- */}
        <Campo etiqueta="Nombre">
          <Entrada
            name="nombre"
            required
            autoFocus
            maxLength={60}
            defaultValue={miembro?.nombre ?? ""}
            placeholder="Ingresá el primer nombre del personal"
          />
        </Campo>

        <Campo etiqueta="Apellido">
          <Entrada
            name="apellido"
            required
            maxLength={60}
            defaultValue={miembro?.apellido ?? ""}
            placeholder="Ingresá el apellido del personal"
          />
        </Campo>

        <div>
          <span className="mb-1.5 flex items-center gap-1.5 text-[0.82rem] font-semibold text-tinta">
            <Icono tam={15}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
            </Icono>
            Número de teléfono
          </span>
          {/* El ancho va en un contenedor y no en el campo: el campo ya trae w-full. */}
          <div className="flex gap-2">
            <div className="w-[7.5rem] flex-none">
              <Selector name="codigoPais" aria-label="País" defaultValue={telefono.codigo}>
                {PAISES_TELEFONO.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.sigla} +{p.codigo}
                  </option>
                ))}
              </Selector>
            </div>
            <div className="min-w-0 flex-1">
              <Entrada
                name="telefono"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                required
                defaultValue={telefono.numero}
                placeholder="Ej: 984 123 456"
                aria-label="Número de teléfono"
              />
            </div>
          </div>
          <p className="mt-1.5 text-[0.78rem] text-tinta-suave">Ejemplo: +595 984 123 456</p>
        </div>

        <Campo etiqueta="Profesión (opcional)">
          <Entrada
            name="profesion"
            maxLength={60}
            defaultValue={miembro?.profesion ?? ""}
            placeholder="Ej: Barbero, Colorista, Manicurista"
          />
        </Campo>

        {/* La comisión por trabajo: el porcentaje de lo que se cobra en cada cita suya. */}
        <Campo
          etiqueta="Comisión por trabajo (opcional)"
          ayuda="Lo que le toca de cada trabajo que cobrás a su nombre. Vacío = no cobra comisión."
        >
          <div className="flex items-center gap-2">
            <div className="w-28 flex-none">
              <Entrada
                name="comision"
                type="number"
                min={0}
                max={100}
                step={0.5}
                inputMode="decimal"
                defaultValue={miembro?.comisionPorcentaje ?? ""}
                placeholder="Ej.: 40"
              />
            </div>
            <span className="text-[0.95rem] font-semibold text-tinta-media">%</span>
          </div>
        </Campo>

        {/* Sus trabajos terminados y lo que gana de comisión (solo de una persona que ya existe). */}
        {miembro && <TrabajosYComision id={miembro.id} />}

        {miembro && (
          <EnlaceTrabajoPersonal
            id={miembro.id}
            nombre={miembro.nombre}
            telefono={miembro.telefono}
            activo={miembro.activo}
          />
        )}

        {miembro && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-linea bg-papel-suave p-3">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={miembro.activo}
              className="mt-0.5 h-4 w-4 flex-none accent-brand"
            />
            <span>
              <span className="block text-[0.86rem] font-semibold text-tinta">Activo</span>
              <span className="block text-[0.78rem] leading-snug text-tinta-suave">
                Si lo desactivás, deja de aparecer en el calendario para elegirlo, pero sus turnos anteriores se
                conservan.
              </span>
            </span>
          </label>
        )}
      </div>

      {/* ---------- pie fijo ---------- */}
      <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-5 py-4">
        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={clasesBoton("suave", "md")}>
            Cancelar
          </button>
          <button type="submit" disabled={pendiente || subiendo} className={clasesBoton("principal", "md")}>
            {pendiente ? "Guardando…" : editando ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </form>
  );
}
