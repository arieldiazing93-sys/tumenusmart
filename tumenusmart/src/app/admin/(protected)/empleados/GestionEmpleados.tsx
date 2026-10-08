"use client";

import { useState, useTransition } from "react";
import { Boton, Campo, Entrada, Pastilla, Selector, Tarjeta, Vacio, clasesBoton } from "@/components/ui";
import { PERFILES_DE_SEGURIDAD, esPerfilDeSeguridad, etiquetaDePerfil, type PerfilDeSeguridad } from "@/lib/seguridad";
import {
  alternarActivoEmpleado,
  cambiarPerfilSeguridadEmpleado,
  crearEmpleado,
  restablecerPasswordEmpleado,
} from "./actions";

export type EmpleadoFila = {
  id: string;
  nombre: string | null;
  email: string;
  activo: boolean;
  /** Quién puede dar la autorización de los eventos de Ajustes → Seguridad: administrador (todos) o caja (los que se tilden). */
  perfil: PerfilDeSeguridad;
  ultimoIngreso: string | null;
};

/**
 * El alta de empleados, del lado del dueño.
 *
 * La contraseña se muestra UNA sola vez, apenas se crea, junto con el mensaje
 * listo para pegar en WhatsApp. Es el mismo patrón del alta de locales, y por
 * el mismo motivo: la contraseña no se guarda en claro en ningún lado, así que
 * si se cierra esta tarjeta sin copiarla hay que restablecerla.
 */
export function GestionEmpleados({
  empleados,
  nombreLocal,
}: {
  empleados: EmpleadoFila[];
  nombreLocal: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recienCreado, setRecienCreado] = useState<{
    nombre: string;
    email: string;
    password: string;
  } | null>(null);
  const [copiado, setCopiado] = useState(false);

  function mensajeWhatsapp(datos: { nombre: string; email: string; password: string }) {
    return (
      `Hola ${datos.nombre}, te doy acceso al sistema de pedidos de ${nombreLocal}.\n\n` +
      `Entrás en: ${typeof window !== "undefined" ? window.location.origin : ""}/admin/login\n` +
      `Usuario: ${datos.email}\n` +
      `Contraseña: ${datos.password}\n\n` +
      `Apenas entres te va a pedir que la cambies por una tuya.`
    );
  }

  function alCrear(formData: FormData) {
    setError(null);
    setCopiado(false);
    const nombre = String(formData.get("nombre") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    iniciar(async () => {
      const resultado = await crearEmpleado(formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setRecienCreado({ nombre, email, password: resultado.password });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- la contraseña recién generada ---------- */}
      {recienCreado && (
        <div className="rounded-xl border border-exito/30 bg-exito-luz p-4">
          <p className="text-[0.95rem] font-semibold tracking-titular text-exito">
            {recienCreado.nombre} ya puede entrar
          </p>
          <p className="mt-1 text-[0.84rem] text-tinta-media">
            Esta contraseña se muestra <strong>una sola vez</strong>. Copiala ahora: no queda
            guardada en ningún lado y, si la perdés, hay que generar otra.
          </p>

          <p className="cifra mt-3 rounded-lg border border-exito/30 bg-white px-3 py-2.5 text-[1.05rem] font-semibold tracking-wide text-tinta">
            {recienCreado.password}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Boton
              tono="principal"
              tam="sm"
              onClick={() => {
                void navigator.clipboard.writeText(mensajeWhatsapp(recienCreado));
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2500);
              }}
            >
              {copiado ? "Copiado" : "Copiar mensaje para WhatsApp"}
            </Boton>
            <Boton tono="suave" tam="sm" onClick={() => setRecienCreado(null)}>
              Listo, ya la copié
            </Boton>
          </div>
        </div>
      )}

      {/* ---------- alta ---------- */}
      <Tarjeta>
        <p className="text-[0.95rem] font-semibold tracking-titular">Agregar un empleado</p>
        <p className="mt-1 text-[0.83rem] leading-snug text-tinta-media">
          Va a poder ver los pedidos y cambiarles el estado, ver las reservas, ver los
          repartidores y marcar productos como agotados. No puede tocar precios, borrar nada,
          ni ver la facturación.
        </p>

        <form action={alCrear} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_11rem_auto]">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required placeholder="Ej: Carlos Giménez" autoComplete="off" />
          </Campo>
          <Campo etiqueta="Correo con el que va a entrar">
            <Entrada
              name="email"
              type="email"
              required
              placeholder="carlos@ejemplo.com"
              autoComplete="off"
            />
          </Campo>
          <Campo etiqueta="Perfil de seguridad">
            <Selector name="perfilSeguridad" defaultValue="caja">
              {PERFILES_DE_SEGURIDAD.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <div className="flex items-end">
            <Boton tono="nuevo" type="submit" disabled={pendiente} className="w-full sm:w-auto">
              {pendiente ? "Creando…" : "Crear empleado"}
            </Boton>
          </div>
        </form>

        <p className="mt-2 text-[0.78rem] leading-snug text-tinta-suave">
          El perfil de seguridad decide quién puede dar la contraseña de autorización de lo que protegiste en Ajustes → Seguridad (descuentos, cancelaciones…):
          el Administrador puede con todo y Caja solo con lo que le hayas tildado. Se puede cambiar después, en la lista.
        </p>

        {error && <p className="mt-2 text-[0.82rem] text-peligro">{error}</p>}
      </Tarjeta>

      {/* ---------- lista ---------- */}
      {empleados.length === 0 ? (
        <Vacio
          titulo="Todavía no hay empleados"
          detalle="Cuando agregues uno, va a poder entrar con su propio correo y contraseña. Vos seguís siendo el único que puede tocar precios y configuración."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {empleados.map((e) => (
            <FilaEmpleado key={e.id} empleado={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaEmpleado({ empleado }: { empleado: EmpleadoFila }) {
  const [pendiente, iniciar] = useTransition();
  const [nuevaPassword, setNuevaPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<PerfilDeSeguridad>(empleado.perfil);

  function cambiarPerfil(valor: string) {
    if (!esPerfilDeSeguridad(valor) || valor === perfil) return;
    const anterior = perfil;
    setError(null);
    setPerfil(valor);
    iniciar(async () => {
      const resultado = await cambiarPerfilSeguridadEmpleado(empleado.id, valor);
      if (!resultado.ok) {
        setPerfil(anterior);
        setError(resultado.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-linea bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[0.9rem] font-semibold tracking-titular">
            {empleado.nombre || empleado.email}
            <Pastilla color={perfil === "administrador" ? "azul" : "amarillo"}>{etiquetaDePerfil(perfil)}</Pastilla>
            {!empleado.activo && <Pastilla color="neutro">Sin acceso</Pastilla>}
          </p>
          <p className="text-[0.8rem] text-tinta-suave">
            {empleado.email}
            {empleado.ultimoIngreso && ` · última vez: ${empleado.ultimoIngreso}`}
            {!empleado.ultimoIngreso && " · todavía no entró"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-none">
          <Selector
            aria-label={`Perfil de seguridad de ${empleado.nombre || empleado.email}`}
            value={perfil}
            disabled={pendiente}
            onChange={(ev) => cambiarPerfil(ev.target.value)}
            className="!w-auto !py-1.5 text-[0.82rem]"
          >
            {PERFILES_DE_SEGURIDAD.map((p) => (
              <option key={p.id} value={p.id}>
                {p.etiqueta}
              </option>
            ))}
          </Selector>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              setError(null);
              iniciar(async () => {
                const resultado = await restablecerPasswordEmpleado(empleado.id);
                if (!resultado.ok) {
                  setError(resultado.error);
                  return;
                }
                setNuevaPassword(resultado.password);
              });
            }}
            className={clasesBoton("suave", "sm")}
          >
            Nueva contraseña
          </button>
          <button
            type="button"
            disabled={pendiente}
            onClick={() => {
              setError(null);
              iniciar(async () => {
                const resultado = await alternarActivoEmpleado(empleado.id, !empleado.activo);
                if (!resultado.ok) setError(resultado.error);
              });
            }}
            className={clasesBoton(empleado.activo ? "peligro" : "suave", "sm")}
          >
            {empleado.activo ? "Quitar acceso" : "Devolver acceso"}
          </button>
        </div>
      </div>

      {nuevaPassword && (
        <p className="mt-3 rounded-lg border border-exito/30 bg-exito-luz px-3 py-2 text-[0.84rem] text-tinta-media">
          Nueva contraseña, anotala ahora:{" "}
          <span className="cifra font-semibold text-tinta">{nuevaPassword}</span>
        </p>
      )}
      {error && <p className="mt-2 text-[0.8rem] text-peligro">{error}</p>}
    </div>
  );
}
