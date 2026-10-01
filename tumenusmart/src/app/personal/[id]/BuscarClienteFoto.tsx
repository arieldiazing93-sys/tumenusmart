"use client";

import { useRef, useState } from "react";
import { clasesBoton } from "@/components/ui";
import { comprimirImagen, PARA_PRODUCTO } from "@/lib/comprimir-imagen";
import {
  buscarClientePorTelefono,
  subirFotoClienteDesdeEnlace,
  type ClienteEncontrado,
} from "./actions";

/**
 * Buscar un cliente por teléfono desde el enlace público del personal, y ver
 * (o subir) su último peinado/corte. Mismo cliente de siempre — Reserva de
 * turnos — pero desde el celular del barbero, sin entrar al panel.
 */
export function BuscarClienteFoto({ personalId }: { personalId: string }) {
  const [telefono, setTelefono] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ClienteEncontrado[] | null>(null);
  const [elegido, setElegido] = useState<ClienteEncontrado | null>(null);

  // Vuelve todo a cero: lo usa la X de arriba, para cerrar sin tener que apretar
  // "atrás" del navegador (que en un enlace abierto desde WhatsApp saca de la
  // página entera, obligando a volver a pedir el enlace).
  function cerrarTodo() {
    setTelefono("");
    setError(null);
    setResultados(null);
    setElegido(null);
  }

  async function buscar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setElegido(null);
    setBuscando(true);
    try {
      const r = await buscarClientePorTelefono(personalId, telefono);
      if (!r.ok) {
        setError(r.error);
        setResultados(null);
        return;
      }
      setResultados(r.clientes);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[0.8rem] font-semibold uppercase tracking-wide text-tinta-suave">
        Último peinado de un cliente
      </h2>

      {!elegido && (
        <>
          <form onSubmit={buscar} className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Teléfono del cliente"
              className="w-full rounded-lg border border-linea bg-superficie px-3 py-2 text-[0.88rem]"
            />
            <button type="submit" disabled={buscando} className={clasesBoton("navegar", "md")}>
              {buscando ? "Buscando…" : "Buscar"}
            </button>
          </form>

          {error && <p className="mt-2 text-[0.8rem] font-medium text-peligro">{error}</p>}

          {resultados && (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {resultados.length === 0 ? (
                <li className="rounded-lg border border-dashed border-linea bg-papel-suave px-3 py-4 text-center text-[0.82rem] text-tinta-media">
                  Ningún cliente de este negocio tiene ese teléfono.
                </li>
              ) : (
                resultados.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg border border-linea bg-superficie p-2.5"
                  >
                    <div className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-full border border-linea bg-papel-suave">
                      {c.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.fotoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[0.62rem] text-tinta-suave">Sin foto</span>
                      )}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.88rem] font-semibold text-tinta">{c.nombre}</span>
                      <span className="block text-[0.76rem] text-tinta-suave">{c.telefono ?? "—"}</span>
                    </span>
                    <button type="button" onClick={() => setElegido(c)} className={clasesBoton("navegar", "sm")}>
                      Ver
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}

      {elegido && (
        <FichaFotoCliente
          personalId={personalId}
          cliente={elegido}
          onVolver={() => setElegido(null)}
          onCerrar={cerrarTodo}
          onActualizado={(url) => {
            setElegido((prev) => (prev ? { ...prev, fotoUrl: url } : prev));
            setResultados((prev) => prev?.map((c) => (c.id === elegido.id ? { ...c, fotoUrl: url } : c)) ?? prev);
          }}
        />
      )}
    </section>
  );
}

function FichaFotoCliente({
  personalId,
  cliente,
  onVolver,
  onCerrar,
  onActualizado,
}: {
  personalId: string;
  cliente: ClienteEncontrado;
  onVolver: () => void;
  /** Cierra del todo (vuelve a la búsqueda vacía), para no tener que usar "atrás" del navegador. */
  onCerrar: () => void;
  onActualizado: (url: string) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function alElegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);
    setSubiendo(true);
    try {
      const { archivo: liviano } = await comprimirImagen(archivo, PARA_PRODUCTO);
      const datos = new FormData();
      datos.set("archivo", liviano);
      const r = await subirFotoClienteDesdeEnlace(personalId, cliente.id, datos);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onActualizado(r.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-linea bg-superficie p-3.5">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onVolver} className={clasesBoton("navegar", "sm")}>
          ← Atrás
        </button>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          title="Cerrar"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
        >
          ✕
        </button>
      </div>

      <p className="mt-2 text-[0.95rem] font-semibold text-tinta">{cliente.nombre}</p>
      <p className="text-[0.78rem] text-tinta-suave">{cliente.telefono ?? "—"}</p>

      {cliente.fotoUrl ? (
        // La mayoría de las cámaras de celular sacan en vertical (9:16): un
        // cuadro 4:3 con object-cover las recortaba arriba y abajo. Acá se ve
        // COMPLETA siempre, sin cortar nada — se adapta sola a vertical u
        // horizontal, con relleno arriba/abajo o a los costados si hace falta.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cliente.fotoUrl}
          alt={`Último peinado de ${cliente.nombre}`}
          className="mt-3 max-h-[70vh] w-full rounded-lg border border-linea bg-papel-suave object-contain"
        />
      ) : (
        <div className="mt-3 flex h-64 w-full items-center justify-center rounded-lg border border-linea bg-papel-suave">
          <span className="px-4 text-center text-[0.82rem] text-tinta-suave">Todavía no tiene una foto cargada</span>
        </div>
      )}

      <label className={`mt-3 block w-full cursor-pointer text-center ${clasesBoton("principal", "md")}`}>
        {subiendo ? "Subiendo…" : cliente.fotoUrl ? "Cambiar foto" : "Subir foto de cómo quedó"}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={alElegirFoto}
          disabled={subiendo}
          className="hidden"
        />
      </label>
      {error && <p className="mt-2 text-[0.8rem] font-medium text-peligro">{error}</p>}
    </div>
  );
}
