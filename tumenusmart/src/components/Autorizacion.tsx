"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Campo, Entrada, MensajeError, clasesBoton } from "./ui";

/**
 * El cuadro que pide la contraseña de un usuario autorizado cuando una acción protegida lo exige (Ajustes → Seguridad, ver
 * src/lib/seguridad.ts). Quien decide si hace falta es el servidor: la pantalla no sabe qué eventos están protegidos.
 *
 * Cómo se usa, en cualquier pantalla que llame a una acción protegida:
 *
 *     const { autorizar, dialogo } = useAutorizacion();
 *     ...
 *     const r = await autorizar((clave) => anularProductos(cuentaId, partes, motivo, clave));
 *     ...
 *     return (<> ...pantalla... {dialogo} </>);
 *
 * `autorizar` llama a la acción SIN contraseña. Si el servidor contesta `requiereClave`, abre este cuadro; al escribir la
 * contraseña vuelve a llamar a la MISMA acción con ella, y si sigue sin ser correcta, muestra el motivo ahí mismo (queda abierto).
 * Si la persona cancela, devuelve un error ("No se autorizó") y la acción no se hace. La acción devuelta es la que cuenta: la respuesta
 * final, tal cual la dio el servidor.
 */

/** Lo mínimo que tiene que tener la respuesta de una acción protegida. */
export type RespuestaProtegida = { ok: boolean; error?: string; requiereClave?: boolean };

type Pedido = {
  accion: (clave?: string) => Promise<RespuestaProtegida>;
  resolver: (respuesta: RespuestaProtegida) => void;
};

export function useAutorizacion(): {
  autorizar: <R extends RespuestaProtegida>(accion: (clave?: string) => Promise<R>) => Promise<R>;
  dialogo: ReactNode;
  /** Si el cuadro de la contraseña está abierto (un panel que cierra con Escape tiene que dejar que Escape cierre este cuadro, no a él). */
  pidiendoClave: boolean;
} {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  const autorizar = useCallback(async <R extends RespuestaProtegida>(accion: (clave?: string) => Promise<R>): Promise<R> => {
    const primera = await accion(undefined);
    if (primera.ok || !primera.requiereClave) return primera;
    return new Promise<R>((resolver) => {
      setPedido({
        accion,
        resolver: (respuesta) => {
          setPedido(null);
          resolver(respuesta as R);
        },
      });
    });
  }, []);

  const dialogo = pedido ? <DialogoClave pedido={pedido} /> : null;
  return { autorizar, dialogo, pidiendoClave: pedido !== null };
}

function DialogoClave({ pedido }: { pedido: Pedido }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    // El cuadro se dibuja en un portal pero, para React, sigue "adentro" de quien lo abrió: sin esto, el Enter de la contraseña también
    // enviaría el formulario de la pantalla de atrás (por ejemplo, el de la cita).
    e.stopPropagation();
    if (enviando) return;
    if (clave.length === 0) {
      setError("Escribí la contraseña.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await pedido.accion(clave);
      if (!respuesta.ok && respuesta.requiereClave) {
        // Contraseña incorrecta o cuadro bloqueado: se explica acá y se puede volver a probar.
        setError(respuesta.error ?? "La contraseña no es correcta.");
        setClave("");
        setEnviando(false);
        return;
      }
      pedido.resolver(respuesta);
    } catch {
      setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      setEnviando(false);
    }
  }

  function cancelar() {
    pedido.resolver({ ok: false, error: "No se autorizó: la acción no se hizo." });
  }

  return (
    <Modal titulo="Hace falta una autorización" onCerrar={cancelar}>
      <form onSubmit={enviar} className="flex flex-col gap-3">
        <p className="text-[0.88rem] leading-snug text-tinta-media">
          Esta acción pide la contraseña de un usuario autorizado (el dueño). Si no la tenés, avisale para que la escriba él.
        </p>
        <Campo etiqueta="Contraseña de quien autoriza *">
          <Entrada
            type="password"
            autoFocus
            autoComplete="new-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            maxLength={200}
            invalido={!!error}
          />
        </Campo>
        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={cancelar} className={clasesBoton("peligro", "md")}>
            Cancelar
          </button>
          <button type="submit" disabled={enviando} className={clasesBoton("navegar", "md")}>
            {enviando ? "Comprobando…" : "Autorizar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
