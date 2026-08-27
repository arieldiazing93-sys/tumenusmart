import { clasesBoton } from "@/components/ui";
import { faltaCrearElPrimerUsuario, faltaSecretoDeSesion } from "@/lib/auth";
import { crearPrimerUsuario } from "./actions";
import { FormularioIngreso } from "./FormularioIngreso";

export const dynamic = "force-dynamic";

const MENSAJES: Record<string, string> = {
  credenciales: "Correo o contraseña incorrectos.",
  arranque_cerrado: "La cuenta de administrador ya estaba creada. Entrá con tu correo.",
  arranque_password: "La contraseña del sistema no es correcta.",
  arranque_email: "Escribí un correo válido.",
  arranque_repetida: "Las dos contraseñas no coinciden.",
  arranque_debil:
    "La contraseña tiene que tener al menos 8 caracteres, con letras y números.",
};

const CAMPO =
  "w-full rounded-lg border border-linea px-3 py-2 text-tinta placeholder:text-tinta-suave focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; minutos?: string }>;
}) {
  const { error, minutos } = await searchParams;

  // Sin la clave que firma las sesiones no se puede entrar de forma segura.
  // Se avisa acá, antes de que nadie escriba nada, en lugar de fallar recién
  // al apretar el botón.
  if (faltaSecretoDeSesion()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">TuMenuSmart</h1>
        <div className="mt-4 rounded-lg border border-aviso/30 bg-aviso-luz p-4">
          <p className="font-semibold text-aviso">Falta una configuración</p>
          <p className="mt-1 text-sm text-aviso">
            No está cargada la variable <code className="font-mono">SESSION_SECRET</code>, que
            es la clave con la que se firman las sesiones del panel. Hasta que esté, el
            ingreso queda cerrado.
          </p>
          <p className="mt-2 text-sm text-aviso">
            Cargala en Vercel, en Settings → Environment Variables, con cualquier texto largo
            y aleatorio. Después volvé a publicar y entrá de nuevo.
          </p>
        </div>
        <p className="mt-4 text-xs text-tinta-suave">
          Las cartas públicas de los locales siguen funcionando con normalidad.
        </p>
      </main>
    );
  }

  const primerArranque = await faltaCrearElPrimerUsuario();

  const aviso =
    error === "frenado"
      ? `Demasiados intentos fallidos. Probá de nuevo en ${minutos ?? 10} minutos.`
      : error
        ? (MENSAJES[error] ?? "No se pudo entrar.")
        : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">TuMenuSmart</h1>

      {primerArranque ? (
        <>
          <p className="mb-6 text-sm text-tinta-media">
            Primer ingreso: creá tu cuenta de administrador.
          </p>

          {aviso && (
            <p className="mb-4 rounded-lg bg-peligro-luz px-3 py-2 text-sm text-peligro">{aviso}</p>
          )}

          <form action={crearPrimerUsuario} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm text-tinta-media">
              Contraseña actual del sistema
              <input type="password" name="passwordSistema" required autoFocus className={CAMPO} />
            </label>

            <hr className="my-1 border-linea" />

            <label className="flex flex-col gap-1 text-sm text-tinta-media">
              Tu nombre
              <input type="text" name="nombre" placeholder="Ariel" className={CAMPO} />
            </label>

            <label className="flex flex-col gap-1 text-sm text-tinta-media">
              Tu correo
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                placeholder="vos@ejemplo.com"
                className={CAMPO}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-tinta-media">
              Contraseña nueva
              <input
                type="password"
                name="passwordNueva"
                required
                autoComplete="new-password"
                className={CAMPO}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-tinta-media">
              Repetila
              <input
                type="password"
                name="passwordRepetida"
                required
                autoComplete="new-password"
                className={CAMPO}
              />
            </label>

            <p className="text-xs text-tinta-suave">
              Al menos 8 caracteres, con letras y números. Desde acá vas a poder crear los
              usuarios de cada local.
            </p>

            <button
              type="submit"
              className={`mt-1 ${clasesBoton("principal")}`}
            >
              Crear mi cuenta y entrar
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-6 text-sm text-tinta-media">Panel de administración</p>

          {aviso && (
            <p className="mb-4 rounded-lg bg-peligro-luz px-3 py-2 text-sm text-peligro">{aviso}</p>
          )}

          <FormularioIngreso />

          <p className="mt-6 text-xs text-tinta-suave">
            ¿Olvidaste tu contraseña? Pedile al administrador que te la restablezca.
          </p>
        </>
      )}
    </main>
  );
}
