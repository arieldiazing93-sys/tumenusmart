"use client";

import { AvatarPersonal } from "@/app/admin/(protected)/agenda/AvatarPersonal";
import { PAISES_TELEFONO } from "@/lib/agenda-personal";
import { formatearGuarani } from "@/lib/format";
import type { CampoFormulario } from "@/lib/pagina-reservas";
import type { DatosCliente, PersonalPublico } from "@/lib/reserva-cliente";
import { textoDuracion } from "@/lib/servicios-agenda";

const CAMPO =
  "w-full rounded-xl border border-linea bg-superficie px-3.5 py-3 text-[0.92rem] text-tinta " +
  "placeholder:text-tinta-suave focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

function Etiqueta({ texto, opcional }: { texto: string; opcional: boolean }) {
  return (
    <span className="mb-1.5 block text-[0.86rem] font-medium text-tinta">
      {texto}
      {opcional && <span className="font-normal text-tinta-suave"> (opcional)</span>}
    </span>
  );
}

export type ResumenCita = {
  profesional: PersonalPublico;
  fechaTexto: string;
  horaInicio: string;
  horaFin: string;
  servicios: { categoria: string; nombre: string; duracionMin: number; precio: number }[];
  total: number;
};

/**
 * Paso 4: el resumen de la cita (con quién, cuándo, qué servicios y cuánto) y el
 * formulario con los datos del cliente. Muestra solo los campos que el negocio
 * pidió, y marca como opcionales los que no son obligatorios.
 */
export function PasoDatos({
  resumen,
  campos,
  datos,
  onCambiar,
}: {
  resumen: ResumenCita;
  campos: CampoFormulario[];
  datos: DatosCliente;
  onCambiar: (parche: Partial<DatosCliente>) => void;
}) {
  const activo = (clave: string) => campos.find((c) => c.clave === clave && c.activo);
  const pide = (clave: string) => {
    const c = activo(clave);
    return c ? { etiqueta: c.etiqueta, opcional: !c.obligatorio } : null;
  };

  const nombre = pide("nombre");
  const apellido = pide("apellido");
  const telefono = pide("telefono");
  const email = pide("email");
  const direccion = pide("direccion");

  return (
    <div>
      {/* ---------- resumen ---------- */}
      <div className="flex items-center gap-3 py-2">
        <AvatarPersonal
          nombre={resumen.profesional.nombre}
          fotoUrl={resumen.profesional.fotoUrl}
          indice={0}
          className="h-11 w-11 text-[0.9rem]"
        />
        <div className="min-w-0">
          <p className="truncate text-[0.95rem] font-semibold text-tinta">{resumen.profesional.nombre}</p>
          {resumen.profesional.profesion && (
            <p className="truncate text-[0.8rem] text-tinta-suave">{resumen.profesional.profesion}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-linea py-3.5">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-light text-brand-texto"
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </span>
        <div>
          <p className="text-[0.8rem] text-tinta-suave">{resumen.fechaTexto}</p>
          <p className="cifra text-[0.95rem] font-semibold text-tinta">
            {resumen.horaInicio} – {resumen.horaFin}
          </p>
        </div>
      </div>

      <div className="border-t border-linea py-3.5">
        <h3 className="mb-2.5 text-[1rem] font-semibold text-tinta">Servicios</h3>
        <ul className="flex flex-col gap-3">
          {resumen.servicios.map((s, i) => (
            <li key={i} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.9rem] text-tinta">
                  {s.categoria}, {s.nombre}
                </p>
                <p className="text-[0.8rem] text-tinta-suave">{textoDuracion(s.duracionMin)}</p>
              </div>
              <span className="cifra flex-none text-[0.9rem] font-medium text-tinta">{formatearGuarani(s.precio)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3.5 flex items-center justify-between border-t border-linea pt-3.5">
          <span className="text-[0.95rem] font-semibold text-tinta">Precio total</span>
          <span className="cifra text-[1.05rem] font-bold text-tinta">{formatearGuarani(resumen.total)}</span>
        </div>
      </div>

      {/* ---------- datos del cliente ---------- */}
      <div className="flex flex-col gap-4 border-t border-linea pt-5">
        {nombre && (
          <label className="block">
            <Etiqueta texto={nombre.etiqueta} opcional={nombre.opcional} />
            <input
              value={datos.nombre}
              onChange={(e) => onCambiar({ nombre: e.target.value })}
              maxLength={60}
              autoComplete="given-name"
              placeholder="Ingresá tu nombre"
              className={CAMPO}
            />
          </label>
        )}

        {apellido && (
          <label className="block">
            <Etiqueta texto={apellido.etiqueta} opcional={apellido.opcional} />
            <input
              value={datos.apellido}
              onChange={(e) => onCambiar({ apellido: e.target.value })}
              maxLength={60}
              autoComplete="family-name"
              placeholder="Ingresá tu apellido"
              className={CAMPO}
            />
          </label>
        )}

        {telefono && (
          <div>
            <Etiqueta texto={telefono.etiqueta} opcional={telefono.opcional} />
            {/* El ancho va en un contenedor y no en el campo: el campo ya trae w-full. */}
            <div className="flex gap-2">
              <div className="w-[7.5rem] flex-none">
                <select
                  aria-label="País"
                  value={datos.telefonoPais}
                  onChange={(e) => onCambiar({ telefonoPais: e.target.value })}
                  className={CAMPO}
                >
                  {PAISES_TELEFONO.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.sigla} +{p.codigo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={datos.telefono}
                  onChange={(e) => onCambiar({ telefono: e.target.value })}
                  placeholder="Ej: 984 123 456"
                  aria-label={telefono.etiqueta}
                  className={CAMPO}
                />
              </div>
            </div>
          </div>
        )}

        {email && (
          <label className="block">
            <Etiqueta texto={email.etiqueta} opcional={email.opcional} />
            <input
              type="email"
              value={datos.email}
              onChange={(e) => onCambiar({ email: e.target.value })}
              maxLength={120}
              autoComplete="email"
              placeholder="Ingresá tu correo electrónico"
              className={CAMPO}
            />
          </label>
        )}

        {direccion && (
          <label className="block">
            <Etiqueta texto={direccion.etiqueta} opcional={direccion.opcional} />
            <input
              value={datos.direccion}
              onChange={(e) => onCambiar({ direccion: e.target.value })}
              maxLength={120}
              autoComplete="street-address"
              placeholder="Ingresá tu dirección"
              className={CAMPO}
            />
          </label>
        )}

        {campos
          .filter((c) => c.tipo === "personalizado" && c.activo)
          .map((c) => (
            <label key={c.clave} className="block">
              <Etiqueta texto={c.etiqueta} opcional={!c.obligatorio} />
              <input
                value={datos.extras[c.clave] ?? ""}
                onChange={(e) => onCambiar({ extras: { ...datos.extras, [c.clave]: e.target.value } })}
                maxLength={100}
                className={CAMPO}
              />
            </label>
          ))}
      </div>
    </div>
  );
}
