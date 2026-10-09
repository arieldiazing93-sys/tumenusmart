"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { sacarCertificado, subirCertificado } from "./actions";

/**
 * Subir el certificado digital del contribuyente (el .p12 / .pfx que entrega el prestador de servicios de certificación)
 * con su contraseña. La contraseña viaja una sola vez, sirve para abrir el archivo y se descarta: lo que queda guardado es
 * la clave privada cifrada.
 */
export function CertificadoForm({ hayCertificado }: { hayCertificado: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const formulario = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [listo, setListo] = useState(false);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);

  function subir() {
    const datos = new FormData(formulario.current ?? undefined);
    setError(null);
    setAvisos([]);
    setListo(false);
    iniciar(async () => {
      try {
        const resultado = await subirCertificado(datos);
        if (!resultado.ok) {
          setError(resultado.error);
          return;
        }
        setAvisos(resultado.avisos ?? []);
        setListo(true);
        formulario.current?.reset();
        router.refresh();
      } catch {
        setError("No se pudo subir el certificado. Probá de nuevo.");
      }
    });
  }

  function quitar() {
    setError(null);
    iniciar(async () => {
      try {
        const resultado = await sacarCertificado();
        if (!resultado.ok) setError(resultado.error);
        setConfirmandoQuitar(false);
        router.refresh();
      } catch {
        setError("No se pudo quitar el certificado.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        ref={formulario}
        onSubmit={(e) => {
          e.preventDefault();
          subir();
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        autoComplete="off"
      >
        <Campo etiqueta={hayCertificado ? "Reemplazar el certificado" : "Archivo del certificado"} ayuda="El .p12 o .pfx que te dio el prestador">
          <input
            type="file"
            name="archivo"
            accept=".p12,.pfx,application/x-pkcs12"
            required
            className="block w-full text-[0.84rem] text-tinta file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-azul/35 file:bg-azul-luz file:px-3 file:py-2 file:text-[0.82rem] file:font-semibold file:text-azul-oscuro"
          />
        </Campo>
        <Campo etiqueta="Contraseña del certificado" ayuda="Se usa una vez para abrirlo y no se guarda">
          <Entrada type="password" name="clave" required autoComplete="new-password" />
        </Campo>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={pendiente} className={clasesBoton("navegar", "md")}>
            {pendiente ? "Guardando…" : hayCertificado ? "Guardar el certificado nuevo" : "Guardar certificado"}
          </button>
          {hayCertificado && !confirmandoQuitar && (
            <button type="button" disabled={pendiente} onClick={() => setConfirmandoQuitar(true)} className={clasesBoton("peligro", "md")}>
              Quitar el certificado
            </button>
          )}
          {hayCertificado && confirmandoQuitar && (
            <>
              <span className="text-[0.82rem] text-tinta-media">Se borra su clave privada del servidor. ¿Seguro?</span>
              <button type="button" disabled={pendiente} onClick={quitar} className={clasesBoton("peligro", "md")}>
                Sí, quitarlo
              </button>
              <button type="button" disabled={pendiente} onClick={() => setConfirmandoQuitar(false)} className={clasesBoton("suave", "md")}>
                No
              </button>
            </>
          )}
        </div>
      </form>

      {error && <MensajeError>{error}</MensajeError>}
      {listo && <p className="rounded-lg bg-exito-luz px-3 py-2 text-[0.84rem] font-medium text-exito">✓ Certificado guardado. La clave privada quedó cifrada en el servidor.</p>}
      {avisos.length > 0 && (
        <div className="rounded-lg border border-aviso/30 bg-aviso-luz px-3 py-2 text-[0.82rem] text-tinta-media">
          <p className="font-medium text-tinta">A tener en cuenta:</p>
          <ul className="mt-1 list-disc pl-5">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
