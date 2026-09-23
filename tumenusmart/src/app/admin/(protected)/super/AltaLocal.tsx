"use client";

import { clasesBoton } from "@/components/ui";
import { useState, useTransition } from "react";
import { crearLocal, type ResultadoAlta } from "./actions";
import { PLANTILLAS, contarProductos } from "@/lib/plantillas-menu";

const CAMPO =
  "w-full rounded-lg border border-linea px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

export function AltaLocal({
  dominio,
  asesores,
}: {
  dominio: string;
  asesores: { id: string; nombre: string }[];
}) {
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoAlta | null>(null);
  const [copiado, setCopiado] = useState(false);

  function enviar(datos: FormData) {
    setResultado(null);
    setCopiado(false);
    iniciar(async () => {
      try {
        setResultado(await crearLocal(datos));
      } catch (err) {
        setResultado({
          ok: false,
          error: err instanceof Error ? err.message : "No se pudo crear el local",
        });
      }
    });
  }

  // Cuando salió bien, la pantalla cambia de propósito: ya no es un formulario,
  // es la ficha para pasarle al cliente. La contraseña se muestra UNA vez.
  if (resultado?.ok && resultado.local && resultado.acceso) {
    const { local, acceso } = resultado;
    const url = `${dominio}${local.url}`;
    const paraPasar =
      `¡Listo! Tu carta digital ya está online:\n${url}\n\n` +
      `Para administrarla entrá a ${dominio}/admin\n` +
      `Usuario: ${acceso.email}\n` +
      `Contraseña: ${acceso.password}\n\n` +
      `Te recomiendo cambiar la contraseña apenas entres, desde Mi cuenta.`;

    return (
      <div className="rounded-lg border-2 border-exito/30 bg-exito-luz/60 p-4">
        <h3 className="font-semibold text-exito">
          {local.nombre} quedó creado
        </h3>

        <div className="mt-3 rounded-lg border border-exito/25 bg-white p-3 font-mono text-sm">
          <p className="text-tinta-media">Carta pública</p>
          <p className="mb-2 font-medium text-tinta">{url}</p>
          <p className="text-tinta-media">Usuario</p>
          <p className="mb-2 font-medium text-tinta">{acceso.email}</p>
          <p className="text-tinta-media">Contraseña</p>
          <p className="text-[1.1rem] font-semibold tracking-titular tracking-wide text-tinta">
            {acceso.password}
          </p>
        </div>

        <p className="mt-2 text-sm font-medium text-aviso">
          Copiala ahora: no se puede volver a ver. Si se pierde, se la restablecés desde
          Usuarios.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(paraPasar).then(
                () => setCopiado(true),
                () => setCopiado(false)
              );
            }}
            className={clasesBoton("principal")}
          >
            {copiado ? "Copiado ✓" : "Copiar el mensaje para el cliente"}
          </button>
          <button
            type="button"
            onClick={() => setResultado(null)}
            className="rounded-lg border border-linea px-4 py-2 text-sm font-medium text-tinta-media hover:bg-papel-suave"
          >
            Crear otro local
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={enviar} className="grid gap-3 sm:grid-cols-2">
      {resultado?.error && (
        <p className="rounded-lg bg-peligro-luz px-3 py-2 text-sm text-peligro sm:col-span-2">
          {resultado.error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Nombre del negocio
        <input name="nombre" required placeholder="Mas Pizza" className={CAMPO} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Dirección de la carta
        <input name="slug" placeholder="maspizza" className={CAMPO} />
        <span className="text-xs text-tinta-suave">
          Si lo dejás vacío se arma con el nombre. Queda como {dominio}/maspizza
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        WhatsApp del negocio
        <input name="whatsapp" required placeholder="0982 951807" className={CAMPO} />
        <span className="text-xs text-tinta-suave">
          Como lo escribís normalmente. Yo le pongo el código de país.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Correo del dueño
        <input
          type="email"
          name="email"
          required
          placeholder="juan@maspizza.com"
          className={CAMPO}
        />
        <span className="text-xs text-tinta-suave">
          Con esto entra al panel. La contraseña la genero yo.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Nombre y apellido del titular
        <input name="titularNombre" placeholder="Juan Pérez" className={CAMPO} />
        <span className="text-xs text-tinta-suave">Opcional — el dueño real del negocio.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Teléfono del titular
        <input name="titularTelefono" placeholder="0981 234 567" className={CAMPO} />
        <span className="text-xs text-tinta-suave">
          Opcional — para contactarlo a él directamente, aparte del WhatsApp del negocio.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Razón social
        <input name="razonSocial" placeholder="Juan Pérez S.A." className={CAMPO} />
        <span className="text-xs text-tinta-suave">Opcional — para facturación.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        RUC
        <input name="ruc" placeholder="80012345-6" className={CAMPO} />
        <span className="text-xs text-tinta-suave">Opcional — para facturación.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Carta de arranque
        <select name="plantilla" defaultValue="pizzeria" className={CAMPO}>
          {PLANTILLAS.map((p) => (
            <option key={p.clave} value={p.clave}>
              {p.etiqueta}
              {contarProductos(p) > 0 ? ` — ${contarProductos(p)} productos` : ""}
            </option>
          ))}
        </select>
        <span className="text-xs text-tinta-suave">
          Se cargan productos de ejemplo que el dueño después edita. Es lo que evita que
          abandone con la carta a medio hacer.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Plan
        <input name="plan" defaultValue="basico" className={CAMPO} />
        <span className="text-xs text-tinta-suave">
          Arranca sin fecha de vencimiento: mientras cargás la carta y capacitás al cliente no
          corre su plazo. Cuando esté listo, tocás Activar en la Cartera y ahí empiezan sus
          30 días.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-tinta-media">
        Asesor comercial
        <select name="asesorId" defaultValue="" className={CAMPO}>
          <option value="">Sin asignar</option>
          {asesores.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <span className="text-xs text-tinta-suave">
          Quién trajo o atiende este cliente. Se puede dejar sin asignar.
        </span>
      </label>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pendiente}
          className={clasesBoton("principal")}
        >
          {pendiente ? "Creando..." : "Crear local"}
        </button>
      </div>
    </form>
  );
}
