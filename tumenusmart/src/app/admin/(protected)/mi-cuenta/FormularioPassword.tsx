"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cambiarMiPassword } from "./actions";

const CAMPO =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

/**
 * Cambio de contraseña.
 *
 * Está armado a mano en vez de dejar que el navegador maneje el formulario,
 * por un motivo concreto: Chrome ve tres casillas de contraseña y las rellena
 * solo con la que tiene guardada del sitio. El usuario ve la casilla llena sin
 * haber escrito nada, aprieta Guardar, y el sistema le dice que su contraseña
 * actual es incorrecta — porque efectivamente lo era, la puso el navegador.
 *
 * Tres defensas contra eso:
 *   1. Los tres campos se declaran como "contraseña nueva", que es lo que le
 *      dice al navegador que no complete nada.
 *   2. Los valores los maneja esta pantalla, no el navegador.
 *   3. Lo que se envía sale de acá y no de lo que quedó escrito en la casilla,
 *      así que aunque el navegador llegue a completar algo, no viaja.
 */
export function FormularioPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Si el navegador alcanzó a completar algo antes de que esta pantalla tomara
  // el control, se limpia.
  useEffect(() => {
    formRef.current?.reset();
  }, []);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setListo(false);

    iniciar(async () => {
      const datos = new FormData();
      datos.set("actual", actual);
      datos.set("nueva", nueva);
      datos.set("repetida", repetida);

      try {
        const r = await cambiarMiPassword(datos);
        if (r.ok) {
          setListo(true);
          setActual("");
          setNueva("");
          setRepetida("");
        } else {
          setError(r.error ?? "No se pudo cambiar la contraseña.");
        }
      } catch {
        setError("No se pudo cambiar la contraseña. Probá de nuevo.");
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={enviar}
      autoComplete="off"
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-neutral-800">Cambiar mi contraseña</h2>

      {listo && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Listo, tu contraseña quedó cambiada. La próxima vez entrá con la nueva.
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <label className="flex flex-col gap-1 text-sm text-neutral-600">
        Contraseña actual
        <input
          type="password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          required
          className={CAMPO}
        />
        <span className="text-xs text-neutral-400">
          La que usás ahora para entrar. Si te la dimos nosotros, es esa.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-600">
        Contraseña nueva
        <input
          type="password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          required
          className={CAMPO}
        />
        <span className="text-xs text-neutral-400">
          Al menos 8 caracteres, con letras y números.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-600">
        Repetila
        <input
          type="password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          required
          className={CAMPO}
        />
      </label>

      <button
        type="submit"
        disabled={pendiente}
        className="mt-1 self-start rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
      >
        {pendiente ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}
