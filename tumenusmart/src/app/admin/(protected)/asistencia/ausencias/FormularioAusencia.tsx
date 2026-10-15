"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { TIPOS_AUSENCIA, datosDeTipo, diasEntre } from "@/lib/ausencias";
import { eliminarAusencia, guardarAusencia } from "./actions";

export type PersonaOpcion = { id: string; nombre: string; activo: boolean };

/** Un registro de ausencia tal como lo edita el formulario. */
export type AusenciaParaEditar = {
  id: string;
  colaboradorId: string;
  tipo: string;
  desde: string;
  hasta: string;
  pagado: boolean;
  nota: string | null;
};

/**
 * El formulario para anotar (o corregir) una ausencia: a quién, qué pasó, desde qué día hasta qué día, si ese día se le paga y un
 * comentario. Vive adentro de un panel lateral: el cuerpo se desliza y el pie con los botones queda fijo abajo.
 *
 * Sirve para tres cosas: anotar una ausencia nueva, justificar una falta que apareció en Marcaciones (llega con la persona y el día
 * ya puestos) y anotar un feriado para todo el personal de una vez.
 */
export function FormularioAusencia({
  ausencia,
  inicial,
  personas,
  onCerrar,
}: {
  /** null para anotar una nueva. */
  ausencia: AusenciaParaEditar | null;
  /** Lo que ya viene puesto al anotar una nueva (por ejemplo, al justificar una falta). */
  inicial?: { colaboradorId?: string; dia?: string; tipo?: string };
  personas: PersonaOpcion[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrar, setConfirmandoBorrar] = useState(false);

  const editando = ausencia !== null;
  const tipoInicial = ausencia?.tipo ?? inicial?.tipo ?? TIPOS_AUSENCIA[0].valor;
  const [colaboradorId, setColaboradorId] = useState(ausencia?.colaboradorId ?? inicial?.colaboradorId ?? "");
  const [tipo, setTipo] = useState<string>(tipoInicial);
  const [desde, setDesde] = useState(ausencia?.desde ?? inicial?.dia ?? "");
  const [hasta, setHasta] = useState(ausencia?.hasta ?? inicial?.dia ?? "");
  const [pagado, setPagado] = useState(ausencia ? ausencia.pagado : (datosDeTipo(tipoInicial)?.pagado ?? false));
  // Mientras el dueño no toque la casilla, sigue lo que corresponde al tipo (un reposo se paga, un aviso no); después, lo que él diga.
  const [pagadoTocado, setPagadoTocado] = useState(editando);
  const [nota, setNota] = useState(ausencia?.nota ?? "");

  const dias = desde && hasta && desde <= hasta ? diasEntre(desde, hasta, 400).length : 0;
  const tipoElegido = datosDeTipo(tipo);

  // La persona de un registro que ya existe no se cambia: se borra y se anota de nuevo. Las inactivas solo aparecen si ya eran la elegida.
  const opciones = personas.filter((p) => p.activo || p.id === colaboradorId);

  function cambiarTipo(nuevo: string) {
    setTipo(nuevo);
    if (!pagadoTocado) setPagado(datosDeTipo(nuevo)?.pagado ?? false);
  }

  function cambiarDesde(valor: string) {
    setDesde(valor);
    // Lo habitual es un solo día: "hasta" acompaña a "desde" hasta que se lo cambie a mano.
    if (!hasta || hasta < valor || hasta === desde) setHasta(valor);
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!colaboradorId) return setError("Elegí a quién.");
    if (!desde || !hasta) return setError("Elegí desde qué día y hasta qué día.");
    if (desde > hasta) return setError("El primer día no puede ser posterior al último.");
    iniciar(async () => {
      const r = await guardarAusencia({
        id: ausencia?.id,
        colaboradorId,
        tipo,
        desde,
        hasta,
        pagado,
        nota,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onCerrar();
    });
  }

  function borrar() {
    if (!ausencia) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarAusencia(ausencia.id);
      if (!r.ok) {
        setError(r.error);
        setConfirmandoBorrar(false);
        return;
      }
      router.refresh();
      onCerrar();
    });
  }

  return (
    <form onSubmit={alEnviar} className="flex min-h-0 flex-1 flex-col">
      <div className="campos-grises flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
        <Campo etiqueta="Persona">
          <Selector
            value={colaboradorId}
            onChange={(e) => setColaboradorId(e.target.value)}
            disabled={editando}
            aria-label="Persona"
          >
            <option value="">Elegí a quién…</option>
            {!editando && <option value="todos">Todo el personal activo</option>}
            {opciones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.activo ? "" : " (inactivo)"}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo etiqueta="Qué pasó" ayuda={tipoElegido?.detalle}>
          <Selector value={tipo} onChange={(e) => cambiarTipo(e.target.value)} aria-label="Qué pasó">
            {TIPOS_AUSENCIA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Desde el día">
            <Entrada type="date" value={desde} onChange={(e) => cambiarDesde(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Hasta el día">
            <Entrada type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} required />
          </Campo>
        </div>
        {dias > 1 && (
          <p className="-mt-2 text-[0.78rem] text-tinta-media">
            Son <strong className="text-tinta">{dias} días corridos</strong>. Solo cuentan los que la persona tenía que ir: sus
            días de descanso no se tocan.
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-linea bg-papel-suave p-3">
          <input
            type="checkbox"
            checked={pagado}
            onChange={(e) => {
              setPagado(e.target.checked);
              setPagadoTocado(true);
            }}
            className="mt-0.5 h-4 w-4 flex-none accent-azul"
          />
          <span>
            <span className="block text-[0.86rem] font-semibold text-tinta">Ese día se le paga</span>
            <span className="block text-[0.78rem] leading-snug text-tinta-suave">
              Si lo tildás, no se le descuenta (mensual) y se le paga el jornal (jornal). Si no, cuenta como día sin goce.
            </span>
          </span>
        </label>

        <Campo etiqueta="Comentario (opcional)" ayuda="Por ejemplo: «Presentó certificado del Dr. Pérez» o «Avisó por WhatsApp a las 6:40».">
          <Area value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={300} placeholder="Escribí lo que quieras recordar" />
        </Campo>
      </div>

      <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-5 py-4">
        {error && <MensajeError>{error}</MensajeError>}
        {confirmandoBorrar ? (
          <div className="flex flex-col gap-2">
            <p className="text-[0.82rem] leading-snug text-tinta-media">
              ¿Borrar este registro? Esos días vuelven a contar como falta sin aviso.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmandoBorrar(false)} className={clasesBoton("suave", "md")}>
                No, dejarlo
              </button>
              <button type="button" onClick={borrar} disabled={pendiente} className={clasesBoton("peligro", "md")}>
                {pendiente ? "Borrando…" : "Sí, borrar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {editando && (
              <button
                type="button"
                onClick={() => setConfirmandoBorrar(true)}
                disabled={pendiente}
                className={`${clasesBoton("peligro", "md")} mr-auto`}
              >
                Eliminar
              </button>
            )}
            <button type="button" onClick={onCerrar} className={clasesBoton("peligro", "md")}>
              Cancelar
            </button>
            <button type="submit" disabled={pendiente} className={clasesBoton(editando ? "navegar" : "nuevo", "md")}>
              {pendiente ? "Guardando…" : editando ? "Guardar" : "Anotar"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
