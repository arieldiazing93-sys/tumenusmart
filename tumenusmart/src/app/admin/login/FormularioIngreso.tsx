"use client";

import { clasesBoton } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { iniciarSesion } from "./actions";

const CAMPO =
  "w-full rounded-lg border border-linea px-3 py-2 text-tinta placeholder:text-tinta-suave focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

/**
 * Ingreso al panel.
 *
 * A diferencia del cambio de contraseña, acá el autocompletado del navegador
 * SE DEJA: es donde corresponde que funcione. Quitarlo obligaría a cada dueño
 * a escribir su contraseña todos los días, y eso empuja a elegir contraseñas
 * cortas.
 *
 * Lo que sí se corrige es el bucle: antes, al fallar, la página se recargaba,
 * el navegador volvía a completar exactamente lo mismo que acababa de fallar,
 * y el intento siguiente fallaba igual. Ahora el error aparece sin recargar y
 * la contraseña se vacía, así el próximo intento arranca limpio.
 */
export function FormularioIngreso() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fallos, setFallos] = useState(0);
  const [pendiente, iniciar] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    iniciar(async () => {
      try {
        const r = await iniciarSesion(email, password);
        if (r.ok) {
          router.push("/admin/pedidos");
          router.refresh();
          return;
        }
        setError(r.error ?? "No se pudo entrar.");
        setFallos((n) => n + 1);
        // Se vacía la contraseña para que el próximo intento no repita
        // exactamente lo que ya falló.
        setPassword("");
      } catch {
        setError("No se pudo conectar. Probá de nuevo.");
        setPassword("");
      }
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3">
      {error && (
        <p className="rounded-lg bg-peligro-luz px-3 py-2 text-sm text-peligro">{error}</p>
      )}

      {fallos >= 2 && (
        <p className="rounded-lg bg-aviso-luz px-3 py-2 text-sm text-aviso">
          Si el navegador completó los campos solo, borralos y escribí tu correo y tu
          contraseña a mano. A veces guarda los de otra cuenta.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Correo
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="username"
          spellCheck={false}
          placeholder="vos@ejemplo.com"
          className={CAMPO}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Contraseña
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={CAMPO}
        />
      </label>

      <button
        type="submit"
        disabled={pendiente}
        className={`mt-1 ${clasesBoton("principal")}`}
      >
        {pendiente ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
