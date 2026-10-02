"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { VerificadorPersona, type ResultadoVerificacion } from "@/components/VerificadorPersona";
import { comprimirImagen, PARA_LOGO } from "@/lib/comprimir-imagen";
import type { ColaboradorFila } from "@/lib/asistencia";
import { actualizarColaborador, crearColaborador, subirFotoDelColaborador } from "./actions";

/**
 * El formulario para dar de alta (o editar) a un colaborador. Vive adentro del panel lateral: el cuerpo se
 * desliza y el pie con "Cancelar" y "Crear" queda fijo abajo, también en el celular.
 *
 * El alta se hace EN PERSONA: el dueño le saca la selfie ahí mismo (es la foto de referencia con la que después
 * compara a ojo las fotos de cada marcación) y le elige un PIN. No usa `action={...}` del formulario a propósito:
 * React vacía los campos al terminar una acción, y con un error de validación habría que volver a escribir todo.
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

/** Un PIN de 4 números al azar, para no tener que inventarlo. */
function pinAlAzar(): string {
  const valores = new Uint32Array(1);
  crypto.getRandomValues(valores);
  return String(valores[0] % 10000).padStart(4, "0");
}

export function FormularioColaborador({
  colaborador,
  onCerrar,
}: {
  /** null para dar de alta a uno nuevo. */
  colaborador: ColaboradorFila | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState(colaborador?.fotoUrl ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [camara, setCamara] = useState(false);
  const [pin, setPin] = useState("");
  const archivo = useRef<HTMLInputElement>(null);

  const editando = colaborador !== null;

  async function subir(foto: File) {
    setErrorFoto(null);
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.set("archivo", foto);
      const subida = await subirFotoDelColaborador(datos);
      if (!subida.ok) {
        setErrorFoto(subida.error);
        return;
      }
      setFotoUrl(subida.url);
    } catch (err) {
      setErrorFoto(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
    }
  }

  async function alSacarSelfie(r: ResultadoVerificacion) {
    setCamara(false);
    await subir(new File([r.foto], "selfie.jpg", { type: "image/jpeg" }));
  }

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    try {
      // Se achica en el propio dispositivo antes de subirla: una foto de cámara pesa varios MB.
      const { archivo: liviano } = await comprimirImagen(elegido, PARA_LOGO);
      await subir(liviano);
    } finally {
      if (archivo.current) archivo.current.value = "";
    }
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    iniciar(async () => {
      const resultado = colaborador ? await actualizarColaborador(colaborador.id, datos) : await crearColaborador(datos);
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
      <div className="campos-grises flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        {/* ---------- selfie ---------- */}
        <div className="flex flex-col items-center gap-3 border-b border-linea pb-5">
          {camara ? (
            <VerificadorPersona modo="selfie" onResultado={alSacarSelfie} onCancelar={() => setCamara(false)} />
          ) : (
            <>
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-azul/50 bg-brand-light text-brand">
                {fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoUrl} alt="Selfie de referencia" className="h-full w-full object-cover" />
                ) : (
                  <Icono tam={56}>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
                  </Icono>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCamara(true)}
                  disabled={subiendo}
                  className={clasesBoton("navegar", "md")}
                >
                  <Icono>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </Icono>
                  {subiendo ? "Subiendo…" : fotoUrl ? "Sacar otra selfie" : "Sacar selfie"}
                </button>
                <label className={`${clasesBoton("suave", "md")} cursor-pointer`}>
                  <Icono>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </Icono>
                  Subir una foto
                  <input
                    ref={archivo}
                    type="file"
                    accept="image/*"
                    onChange={alElegirArchivo}
                    disabled={subiendo}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="max-w-xs text-center text-[0.78rem] leading-snug text-tinta-suave">
                Sacala con la persona delante, de frente y con buena luz. Es la foto de referencia para revisar sus
                marcaciones.
              </p>
            </>
          )}
          {errorFoto && <MensajeError>{errorFoto}</MensajeError>}
          <input type="hidden" name="fotoUrl" value={fotoUrl} />
        </div>

        {/* ---------- datos ---------- */}
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" required maxLength={60} defaultValue={colaborador?.nombre ?? ""} placeholder="Primer nombre" />
        </Campo>

        <Campo etiqueta="Apellido (opcional)">
          <Entrada name="apellido" maxLength={60} defaultValue={colaborador?.apellido ?? ""} placeholder="Apellido" />
        </Campo>

        <Campo etiqueta="Cargo (opcional)">
          <Entrada name="cargo" maxLength={60} defaultValue={colaborador?.cargo ?? ""} placeholder="Ej: Cajero, Cocinero, Barbero" />
        </Campo>

        {/* ---------- PIN ---------- */}
        <Campo
          etiqueta={editando ? "Nuevo PIN (opcional)" : "PIN"}
          ayuda={
            editando
              ? "Dejalo vacío para no cambiarlo. Si lo cambiás, también se desbloquea si se había bloqueado."
              : "De 4 a 6 números. Es el que va a poner en el celular fijo para marcar."
          }
        >
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Entrada
                name="pin"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                required={!editando}
                placeholder="Ej: 4827"
              />
            </div>
            <button type="button" onClick={() => setPin(pinAlAzar())} className={clasesBoton("suave", "md")}>
              Generar
            </button>
          </div>
        </Campo>

        {/* ---------- horario ---------- */}
        <div className="rounded-xl border-2 border-azul/50 p-3">
          <p className="mb-2 text-[0.82rem] font-semibold text-tinta">Control de tardanza (opcional)</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Hora de entrada">
              <Entrada name="horaEntrada" type="time" defaultValue={colaborador?.horaEntrada ?? ""} />
            </Campo>
            <Campo etiqueta="Tolerancia (min)">
              <Entrada
                name="toleranciaMin"
                type="number"
                min={0}
                max={120}
                step={1}
                inputMode="numeric"
                defaultValue={colaborador?.toleranciaMin ?? 10}
              />
            </Campo>
          </div>
          <p className="mt-2 text-[0.78rem] leading-snug text-tinta-suave">
            Si le ponés la hora a la que tiene que entrar, el reporte marca cuántos minutos llegó tarde pasada la
            tolerancia. Vacío = no se controla.
          </p>
        </div>

        {colaborador && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-linea bg-papel-suave p-3">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={colaborador.activo}
              className="mt-0.5 h-4 w-4 flex-none accent-azul"
            />
            <span>
              <span className="block text-[0.86rem] font-semibold text-tinta">Activo</span>
              <span className="block text-[0.78rem] leading-snug text-tinta-suave">
                Si lo desactivás, deja de aparecer en el celular fijo, pero sus marcaciones anteriores se conservan en
                los reportes.
              </span>
            </span>
          </label>
        )}
      </div>

      {/* ---------- pie fijo ---------- */}
      <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-5 py-4">
        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={clasesBoton("peligro", "md")}>
            Cancelar
          </button>
          <button type="submit" disabled={pendiente || subiendo || camara} className={clasesBoton("principal", "md")}>
            {pendiente ? "Guardando…" : editando ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </form>
  );
}
