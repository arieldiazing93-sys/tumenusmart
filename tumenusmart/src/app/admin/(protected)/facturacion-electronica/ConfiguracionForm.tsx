"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { guardarConfiguracionElectronica } from "./actions";

/**
 * El ambiente al que apunta la facturación electrónica y el código de seguridad del contribuyente (CSC), que la DNIT
 * entrega con su identificador de 4 dígitos y sirve para firmar el QR de cada comprobante. El CSC se guarda cifrado y
 * nunca se vuelve a mostrar.
 */
export function ConfiguracionForm({ ambiente, idCsc, tieneCsc }: { ambiente: "pruebas" | "produccion"; idCsc: string | null; tieneCsc: boolean }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [elegido, setElegido] = useState<"pruebas" | "produccion">(ambiente);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardar(formulario: HTMLFormElement) {
    const datos = new FormData(formulario);
    datos.set("ambiente", elegido);
    setError(null);
    setGuardado(false);
    iniciar(async () => {
      try {
        const resultado = await guardarConfiguracionElectronica(datos);
        if (!resultado.ok) {
          setError(resultado.error);
          return;
        }
        setGuardado(true);
        formulario.reset();
        router.refresh();
      } catch {
        setError("No se pudo guardar. Probá de nuevo.");
      }
    });
  }

  const opcion = (valor: "pruebas" | "produccion", titulo: string, detalle: string) => (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 ${
        elegido === valor ? "border-azul bg-azul-luz" : "border-linea bg-superficie hover:border-azul/50"
      }`}
    >
      <input type="radio" name="ambiente-visible" checked={elegido === valor} onChange={() => setElegido(valor)} className="mt-1" />
      <span>
        <span className="block text-[0.88rem] font-semibold text-tinta">{titulo}</span>
        <span className="block text-[0.78rem] text-tinta-media">{detalle}</span>
      </span>
    </label>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        guardar(e.currentTarget);
      }}
      autoComplete="off"
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opcion("pruebas", "Pruebas", "El ambiente de la DNIT para probar (sifen-test). Los comprobantes no tienen valor.")}
        {opcion("produccion", "Producción", "El ambiente real. Usalo solo cuando la DNIT te haya habilitado como facturador electrónico.")}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo etiqueta="Identificador del CSC" ayuda="4 dígitos, por ejemplo 0001">
          <Entrada name="idCsc" inputMode="numeric" maxLength={4} defaultValue={idCsc ?? ""} placeholder="0001" />
        </Campo>
        <Campo etiqueta="Código de seguridad (CSC)" ayuda={tieneCsc ? "Ya hay uno guardado; escribí uno nuevo solo para cambiarlo" : "32 letras o números, como lo entrega la DNIT"} className="sm:col-span-2">
          <Entrada name="csc" type="password" maxLength={32} autoComplete="new-password" placeholder={tieneCsc ? "•••••••••••••••• (guardado)" : ""} />
        </Campo>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendiente} className={clasesBoton("navegar", "md")}>
          {pendiente ? "Guardando…" : "Guardar configuración"}
        </button>
        {guardado && <span className="text-[0.84rem] font-medium text-exito">✓ Guardado</span>}
      </div>
      {error && <MensajeError>{error}</MensajeError>}
    </form>
  );
}
