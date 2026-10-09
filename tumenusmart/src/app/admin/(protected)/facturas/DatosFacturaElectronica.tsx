"use client";

import { useState, useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { obtenerDocumentoElectronico, type ResultadoDocumentoElectronico } from "./actions";

/**
 * "Datos para factura electrónica": el comprobante armado como documento
 * electrónico completo de SIFEN (con los nombres de campo del esquema de la
 * DNIT, su CDC y su XML) y la lista de lo que todavía falta cargar o corregir.
 * No firma ni envía nada.
 */
export function DatosFacturaElectronica({ origen, id }: { origen: "pedido" | "venta"; id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoDocumentoElectronico | null>(null);
  const [copiado, setCopiado] = useState<"json" | "xml" | null>(null);

  function cargar() {
    setCopiado(null);
    iniciar(async () => {
      try {
        setResultado(await obtenerDocumentoElectronico(origen, id));
      } catch {
        setResultado({ ok: false, error: "No se pudo armar el documento. Probá de nuevo." });
      }
    });
  }

  function copiar(texto: string, que: "json" | "xml") {
    navigator.clipboard.writeText(texto).then(
      () => setCopiado(que),
      () => setCopiado(null)
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={cargar} disabled={pendiente} className={clasesBoton("navegar", "sm")}>
          {pendiente ? "Armando…" : resultado ? "Actualizar datos para factura electrónica" : "Ver datos para factura electrónica"}
        </button>
        {resultado && (
          <button type="button" onClick={() => setResultado(null)} className={clasesBoton("suave", "sm")}>
            Ocultar
          </button>
        )}
      </div>

      {resultado && !resultado.ok && (
        <p className="mt-2 rounded-lg bg-papel-suave px-3 py-2 text-[0.82rem] text-tinta-media">{resultado.error}</p>
      )}

      {resultado && resultado.ok && (
        <div className="mt-3 flex flex-col gap-3 text-[0.82rem]">
          <p className="text-tinta-media">
            Comprobante <strong className="text-tinta">{resultado.numero}</strong> · emitido como{" "}
            <strong className="text-tinta">{resultado.modalidad === "electronico" ? "electrónico" : "autoimpresor"}</strong>
            {resultado.estado === "anulado" && <span className="text-peligro"> · anulado</span>}
          </p>

          {resultado.faltantes.length > 0 ? (
            <div className="rounded-lg border border-aviso/30 bg-aviso-luz px-3 py-2">
              <p className="font-medium text-tinta">Para emitir esta factura electrónica falta:</p>
              <ul className="mt-1 list-disc pl-5 text-tinta-media">
                {resultado.faltantes.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg bg-exito-luz px-3 py-2 font-medium text-exito">
              ✓ Tiene todos los datos obligatorios que pide SIFEN.
            </p>
          )}

          {resultado.avisos.length > 0 && (
            <div className="rounded-lg bg-papel-suave px-3 py-2">
              <p className="font-medium text-tinta">A tener en cuenta:</p>
              <ul className="mt-1 list-disc pl-5 text-tinta-media">
                {resultado.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                Documento (formato SIFEN){resultado.cdc ? ` · CDC ${resultado.cdc}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copiar(JSON.stringify(resultado.documento, null, 2), "json")}
                  className={clasesBoton("suave", "sm")}
                >
                  {copiado === "json" ? "Copiado ✓" : "Copiar JSON"}
                </button>
                {resultado.xml && (
                  <button
                    type="button"
                    onClick={() => copiar(resultado.xml ?? "", "xml")}
                    className={clasesBoton("suave", "sm")}
                  >
                    {copiado === "xml" ? "Copiado ✓" : "Copiar XML (sin firmar)"}
                  </button>
                )}
              </div>
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg border border-linea bg-papel-suave p-3 text-[0.72rem] leading-snug text-tinta">
              {JSON.stringify(resultado.documento, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
