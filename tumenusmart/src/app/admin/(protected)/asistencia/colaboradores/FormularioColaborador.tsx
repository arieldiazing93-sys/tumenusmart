"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { VerificadorPersona, type ResultadoVerificacion } from "@/components/VerificadorPersona";
import { comprimirImagen, PARA_LOGO } from "@/lib/comprimir-imagen";
import { pinDemasiadoFacil, type ColaboradorFila } from "@/lib/asistencia";
import { rostroDeFoto, rostroDeFotoGuardada } from "@/lib/reconocimiento-cliente";
import { actualizarColaborador, crearColaborador, subirFotoDelColaborador } from "./actions";

/**
 * El formulario para dar de alta (o editar) a un colaborador. Vive adentro del panel lateral: el cuerpo se
 * desliza y el pie con "Cancelar" y "Crear" queda fijo abajo, también en el celular.
 *
 * El alta se hace EN PERSONA: el dueño le saca la selfie ahí mismo (es la foto de referencia con la que después
 * compara a ojo las fotos de cada marcación) y le elige un PIN. De esa selfie el navegador saca además el "rostro" de la persona
 * (128 números, ver src/lib/reconocimiento-facial.ts): con él el celular fijo comprueba, al marcar, que la cara sea la suya.
 * No usa `action={...}` del formulario a propósito: React vacía los campos al terminar una acción, y con un error de validación
 * habría que volver a escribir todo.
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

/**
 * Un PIN de 6 números al azar, para no tener que inventarlo (con muchas personas, más largo se repite menos y es más difícil
 * de adivinar). Si sale uno demasiado fácil (111111, 123456) se tira de nuevo, porque el panel no lo aceptaría.
 */
function pinAlAzar(): string {
  for (let intento = 0; intento < 20; intento++) {
    const valores = new Uint32Array(1);
    crypto.getRandomValues(valores);
    const pin = String(100000 + (valores[0] % 900000));
    if (!pinDemasiadoFacil(pin)) return pin;
  }
  return "739204";
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
  // El rostro NUEVO (de la selfie que se acaba de sacar o de la foto actual), que se guarda con el formulario. null = no hay uno
  // nuevo: se conserva el que ya tenía la persona (si tenía).
  const [rostro, setRostro] = useState<number[] | null>(null);
  const [leyendoRostro, setLeyendoRostro] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  const editando = colaborador !== null;
  const rostroYaGuardado = colaborador !== null && !colaborador.sinRostro;

  async function subir(foto: File, rostroDeLaFoto: number[]) {
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
      // La foto y su rostro cambian juntos: nunca queda un rostro de una foto distinta de la que se ve.
      setFotoUrl(subida.url);
      setRostro(rostroDeLaFoto);
    } catch (err) {
      setErrorFoto(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
    }
  }

  /** Saca el rostro de una foto en este navegador. Si no se ve ninguna cara o no se puede leer, lo dice y devuelve null. */
  async function leerRostro(sacar: () => Promise<number[] | null>, sinCara: string): Promise<number[] | null> {
    setErrorFoto(null);
    setLeyendoRostro(true);
    try {
      const r = await sacar();
      if (!r) setErrorFoto(sinCara);
      return r;
    } catch {
      setErrorFoto("No se pudo leer la cara de la foto. Revisá el internet y probá de nuevo.");
      return null;
    } finally {
      setLeyendoRostro(false);
    }
  }

  const SIN_CARA = "No se vio ninguna cara en esa foto. Sacala de nuevo, de frente, sin anteojos oscuros y con buena luz.";

  async function alSacarSelfie(r: ResultadoVerificacion) {
    setCamara(false);
    const rostroDeLaSelfie = await leerRostro(() => rostroDeFoto(r.foto), SIN_CARA);
    if (!rostroDeLaSelfie) return;
    await subir(new File([r.foto], "selfie.jpg", { type: "image/jpeg" }), rostroDeLaSelfie);
  }

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    try {
      // El rostro se saca de la foto original (más nítida que la achicada que se sube).
      const rostroDelArchivo = await leerRostro(() => rostroDeFoto(elegido), SIN_CARA);
      if (!rostroDelArchivo) return;
      // Se achica en el propio dispositivo antes de subirla: una foto de cámara pesa varios MB.
      const { archivo: liviano } = await comprimirImagen(elegido, PARA_LOGO);
      await subir(liviano, rostroDelArchivo);
    } finally {
      if (archivo.current) archivo.current.value = "";
    }
  }

  /** Para quien ya tenía foto pero no rostro (se dio de alta antes de que existiera): lo saca de la foto que ya está guardada. */
  async function registrarRostroDeLaFotoActual() {
    if (!fotoUrl) return;
    const r = await leerRostro(
      () => rostroDeFotoGuardada(fotoUrl),
      "No se vio ninguna cara en la foto guardada. Sacá una selfie nueva, de frente y con buena luz."
    );
    if (r) setRostro(r);
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    if (!editando && !rostro) {
      setError("Sacale la selfie para registrar su rostro: con él el celular comprueba que sea esa persona al marcar.");
      return;
    }
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
                  disabled={subiendo || leyendoRostro}
                  className={clasesBoton("navegar", "md")}
                >
                  <Icono>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </Icono>
                  {subiendo ? "Subiendo…" : leyendoRostro ? "Leyendo la cara…" : fotoUrl ? "Sacar otra selfie" : "Sacar selfie"}
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
                    disabled={subiendo || leyendoRostro}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="max-w-xs text-center text-[0.78rem] leading-snug text-tinta-suave">
                Sacala con la persona delante, de frente y con buena luz. Es la foto de referencia para revisar sus
                marcaciones, y de ella se registra su rostro: el celular fijo lo usa para comprobar que sea esa persona al
                marcar.
              </p>

              {/* Si ya hay un rostro registrado (o uno nuevo listo para guardar), o falta registrarlo. */}
              {leyendoRostro ? (
                <p className="text-center text-[0.8rem] font-semibold text-tinta-media">Leyendo la cara… la primera vez tarda unos segundos.</p>
              ) : rostro ? (
                <p className="text-center text-[0.8rem] font-semibold text-exito">
                  ✓ Rostro listo: se guarda al tocar {editando ? "Guardar" : "Crear"}.
                </p>
              ) : rostroYaGuardado ? (
                <p className="text-center text-[0.8rem] font-semibold text-exito">✓ Rostro registrado.</p>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-center text-[0.8rem] font-semibold text-aviso">
                    {editando
                      ? "Todavía no tiene rostro registrado: marca sin que el celular compruebe que sea esta persona."
                      : "Falta el rostro: sacá la selfie o subí una foto de frente."}
                  </p>
                  {editando && fotoUrl && (
                    <button
                      type="button"
                      onClick={() => void registrarRostroDeLaFotoActual()}
                      disabled={subiendo}
                      className={clasesBoton("navegar", "sm")}
                    >
                      Registrar el rostro con la foto actual
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {errorFoto && <MensajeError>{errorFoto}</MensajeError>}
          <input type="hidden" name="fotoUrl" value={fotoUrl} />
          <input type="hidden" name="rostro" value={rostro ? JSON.stringify(rostro) : ""} />
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
          etiqueta={editando && !colaborador?.sinPin ? "Nuevo PIN (opcional)" : "PIN"}
          ayuda={
            editando && !colaborador?.sinPin
              ? "Dejalo vacío para no cambiarlo."
              : "De 4 a 6 números. Es lo que identifica a la persona en el celular fijo, así que no puede repetirse. Con muchas personas conviene de 5 o 6 números."
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
                required={!editando || colaborador?.sinPin}
                placeholder="Ej: 48271"
              />
            </div>
            <button type="button" onClick={() => setPin(pinAlAzar())} className={clasesBoton("suave", "md")}>
              Generar
            </button>
          </div>
        </Campo>

        {/* ---------- almuerzo ---------- */}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-linea bg-papel-suave p-3">
          <input
            type="checkbox"
            name="haceAlmuerzo"
            defaultChecked={colaborador?.haceAlmuerzo ?? true}
            className="mt-0.5 h-4 w-4 flex-none accent-azul"
          />
          <span>
            <span className="block text-[0.86rem] font-semibold text-tinta">Sale a almorzar</span>
            <span className="block text-[0.78rem] leading-snug text-tinta-suave">
              Si lo tildás, lo que marque dentro del horario de almuerzo del negocio (después de haber entrado) queda como
              salida a almorzar, y lo siguiente como la vuelta. Si no, después de la entrada lo siguiente es siempre la
              salida. Quien pasa el día afuera o se olvida de marcar el almuerzo no necesita cambiar nada: lo que marca
              fuera del horario de almuerzo queda como salida.
            </span>
          </span>
        </label>

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
                Si lo desactivás, su PIN deja de funcionar en el celular fijo, pero sus marcaciones anteriores se
                conservan en los reportes.
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
          <button
            type="submit"
            disabled={pendiente || subiendo || leyendoRostro || camara}
            className={clasesBoton(editando ? "navegar" : "nuevo", "md")}
          >
            {pendiente ? "Guardando…" : editando ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </form>
  );
}
