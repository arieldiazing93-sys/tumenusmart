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
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setElegido(c)}
                      className="flex w-full items-center gap-3 rounded-lg border border-linea bg-superficie p-2.5 text-left hover:bg-papel-suave"
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
  onActualizado,
}: {
  personalId: string;
  cliente: ClienteEncontrado;
  onVolver: () => void;
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
      <button type="button" onClick={onVolver} className="text-[0.78rem] font-medium text-tinta-suave hover:underline">
        ← Buscar otro cliente
      </button>

      <p className="mt-2 text-[0.95rem] font-semibold text-tinta">{cliente.nombre}</p>
      <p className="text-[0.78rem] text-tinta-suave">{cliente.telefono ?? "—"}</p>

      <div className="mt-3 flex h-48 w-full items-center justify-center overflow-hidden rounded-lg border border-linea bg-papel-suave">
        {cliente.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cliente.fotoUrl} alt={`Último peinado de ${cliente.nombre}`} className="h-full w-full object-cover" />
        ) : (
          <span className="px-4 text-center text-[0.82rem] text-tinta-suave">Todavía no tiene una foto cargada</span>
        )}
      </div>

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
