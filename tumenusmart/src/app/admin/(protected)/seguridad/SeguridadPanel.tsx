"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MensajeError, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { EVENTOS_DE_SEGURIDAD, PERFILES_DE_SEGURIDAD, etiquetaDePerfil, type EventoSeguridad, type PerfilDeSeguridad } from "@/lib/seguridad";
import { guardarSeguridad } from "./actions";

const ORDEN = EVENTOS_DE_SEGURIDAD.map((e) => e.id);

function mismos(a: EventoSeguridad[], b: EventoSeguridad[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Cada evento que se puede proteger, con tres casillas (como la matriz de permisos de los sistemas de restaurante):
 *  - "Pide contraseña": al hacerlo, el sistema exige la contraseña de un usuario autorizado.
 *  - Administrador: siempre puede autorizarlo (tildada y fija).
 *  - Caja: si el perfil Caja puede autorizarlo con su propia contraseña.
 * Abajo, qué perfil tiene cada persona (se asigna en Empleados). Se guarda con un botón: nada cambia hasta tocarlo.
 */
export function SeguridadPanel({
  activos,
  permisosCaja,
  personas,
}: {
  activos: string[];
  permisosCaja: string[];
  personas: { id: string; nombre: string; perfil: PerfilDeSeguridad }[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const guardadosPide = ORDEN.filter((id) => activos.includes(id));
  const guardadosCaja = ORDEN.filter((id) => permisosCaja.includes(id));
  const [pide, setPide] = useState<EventoSeguridad[]>(guardadosPide);
  const [caja, setCaja] = useState<EventoSeguridad[]>(guardadosCaja);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const hayCambios = !mismos(pide, guardadosPide) || !mismos(caja, guardadosCaja);

  function alternar(lista: EventoSeguridad[], poner: (l: EventoSeguridad[]) => void, id: EventoSeguridad) {
    setAviso(null);
    poner(lista.includes(id) ? lista.filter((e) => e !== id) : [...lista, id]);
  }

  function guardar() {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await guardarSeguridad(pide, caja);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setAviso(pide.length > 0 ? "Listo: esas acciones ahora piden la contraseña de un usuario autorizado." : "Listo: ninguna acción pide contraseña.");
        router.refresh();
      } catch {
        setError("No se pudo guardar. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3 !border-2 !border-azul/50">
        <div>
          <p className="rotulo text-[0.78rem] font-bold">Eventos de seguridad</p>
          <p className="mt-1 text-[0.8rem] leading-snug text-tinta-suave">
            Tildá “Pide contraseña” en lo que querés proteger. Después elegí si el perfil Caja puede dar esa autorización con su propia contraseña (si no, solo la da un
            Administrador). Quien está en la caja escribe la contraseña de quien autoriza; si es incorrecta, la acción no se hace.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {EVENTOS_DE_SEGURIDAD.map((e) => (
            <div key={e.id} className="rounded-lg border border-linea px-3 py-2.5">
              <p className="text-[0.92rem] font-semibold text-tinta">{e.etiqueta}</p>
              <p className="text-[0.78rem] leading-snug text-tinta-suave">{e.detalle}</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-[0.84rem] font-medium text-tinta">
                  <input
                    type="checkbox"
                    aria-label={`${e.etiqueta}: pide contraseña`}
                    checked={pide.includes(e.id)}
                    onChange={() => alternar(pide, setPide, e.id)}
                    className="h-4 w-4 accent-azul"
                  />
                  Pide contraseña
                </label>
                <label className="flex items-center gap-2 text-[0.84rem] text-tinta-suave">
                  <input type="checkbox" aria-label={`${e.etiqueta}: Administrador puede autorizar`} checked disabled readOnly className="h-4 w-4 accent-azul" />
                  Administrador puede autorizar
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[0.84rem] font-medium text-tinta">
                  <input
                    type="checkbox"
                    aria-label={`${e.etiqueta}: Caja puede autorizar`}
                    checked={caja.includes(e.id)}
                    onChange={() => alternar(caja, setCaja, e.id)}
                    className="h-4 w-4 accent-azul"
                  />
                  Caja puede autorizar
                </label>
              </div>
            </div>
          ))}
        </div>

        {error && <MensajeError>{error}</MensajeError>}
        {aviso && <p className="rounded-lg bg-exito-luz px-3 py-2 text-[0.82rem] font-medium text-exito">{aviso}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {hayCambios && <span className="text-[0.78rem] text-tinta-suave">Hay cambios sin guardar.</span>}
          <button type="button" disabled={pendiente || !hayCambios} onClick={guardar} className={`${clasesBoton("navegar")} disabled:opacity-50`}>
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rotulo text-[0.78rem] font-bold">Perfiles de seguridad</p>
          <Link href="/admin/empleados" className={clasesBoton("navegar", "sm")}>
            Asignar perfiles en Empleados
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {PERFILES_DE_SEGURIDAD.map((p) => {
            const gente = personas.filter((x) => x.perfil === p.id);
            return (
              <div key={p.id} className="rounded-lg border border-linea px-3 py-2.5">
                <p className="text-[0.9rem] font-semibold text-tinta">{p.etiqueta}</p>
                <p className="text-[0.78rem] leading-snug text-tinta-suave">{p.detalle}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {gente.length > 0 ? (
                    gente.map((x) => (
                      <Pastilla key={x.id} color={p.id === "administrador" ? "azul" : "amarillo"}>
                        {x.nombre}
                      </Pastilla>
                    ))
                  ) : (
                    <span className="text-[0.78rem] text-tinta-suave">Nadie tiene este perfil.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!personas.some((x) => x.perfil === "administrador") && (
          <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
            No hay ningún usuario {etiquetaDePerfil("administrador")} activo: sin él nadie puede dar la contraseña de lo que Caja no autoriza.
          </p>
        )}
        <p className="text-[0.78rem] leading-snug text-tinta-suave">
          La contraseña que se pide es la de entrar al panel de quien autoriza. El dueño siempre es Administrador; a cada empleado se le asigna el perfil al
          crearlo o después, en Empleados. Con 5 contraseñas incorrectas seguidas el cuadro se bloquea 3 minutos, y todo queda en la Bitácora (módulo Seguridad).
        </p>
      </Tarjeta>
    </div>
  );
}
