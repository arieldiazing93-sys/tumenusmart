"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { BarrasSvg } from "@/components/BarrasSvg";
import { barrasDeCodigo, esCodigoInterno, medirBarras } from "@/lib/codigo-barras";
import { llamarAlServidor, MENSAJE_SIN_RED } from "@/lib/llamar-servidor";
import { asignarCodigoProducto, generarCodigoProducto, quitarCodigoProducto } from "./actions";

/**
 * El código de barras de UN producto: se ve el que tiene (con sus barras), se escanea o se escribe el de fábrica, se genera uno propio si no
 * tiene, se quita y se llega a su etiqueta. Cada botón guarda en el momento (no espera a «Guardar» de ninguna ficha): el código es de otro
 * ámbito que los datos del producto.
 *
 * Con el lector: se hace clic en el campo y se escanea el producto; el lector termina con Enter y el código se guarda solo.
 */
export function CodigoBarrasProducto({
  productId,
  codigo,
  onCambio,
}: {
  productId: string;
  /** El código que tiene ahora, o null. */
  codigo: string | null;
  /** Se llama cuando el código cambió (para que la pantalla de afuera se actualice). */
  onCambio?: (codigo: string | null) => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<{ id: string; nombre: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Se busca el campo por su id (en vez de una referencia): así no depende de cómo pase React la referencia a un componente.
  const idCampo = `codigo-barras-${productId}`;
  const enCampo = () => document.getElementById(idCampo) as HTMLInputElement | null;

  const barras = codigo ? barrasDeCodigo(codigo) : null;
  // Para la vista previa en pantalla: un módulo de 0,3 mm (el tamaño de la barra fina) y 12 mm de alto.
  const medida = barras ? medirBarras(barras.tipo, 38, 203) : null;

  function terminar(nuevo: string | null, mensaje: string) {
    setTexto("");
    setError(null);
    setConflicto(null);
    setAviso(mensaje);
    onCambio?.(nuevo);
    router.refresh();
    setTimeout(() => setAviso(null), 3000);
  }

  function guardar(moverDeOtro = false) {
    setError(null);
    setAviso(null);
    if (!moverDeOtro) setConflicto(null);
    iniciar(async () => {
      let r: Awaited<ReturnType<typeof asignarCodigoProducto>>;
      try {
        r = await asignarCodigoProducto(productId, texto, moverDeOtro);
      } catch {
        setError(MENSAJE_SIN_RED);
        return;
      }
      if (!r.ok) {
        setError(r.error);
        setConflicto(r.conflicto ?? null);
        enCampo()?.select();
        return;
      }
      terminar(r.codigo, "✓ Código guardado");
    });
  }

  function generar() {
    setError(null);
    setConflicto(null);
    iniciar(async () => {
      const r = await llamarAlServidor(() => generarCodigoProducto(productId));
      if (!r.ok) return setError(r.error);
      terminar(r.codigo, "✓ Código generado");
    });
  }

  function quitar() {
    if (!confirm("¿Quitarle el código de barras a este producto? Dejará de sumarse al escanearlo.")) return;
    setError(null);
    setConflicto(null);
    iniciar(async () => {
      const r = await llamarAlServidor(() => quitarCodigoProducto(productId));
      if (!r.ok) return setError(r.error);
      terminar(null, "Código quitado");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {codigo ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="cifra text-[1.15rem] font-semibold tracking-wider text-tinta">{codigo}</p>
            <p className="text-[0.76rem] text-tinta-suave">
              {esCodigoInterno(codigo) ? "Código propio del sistema." : "Código del producto (de fábrica o cargado a mano)."}
              {!barras && " No es un EAN/UPC: se escanea en el punto de venta, pero no se imprime en etiquetas."}
            </p>
          </div>
          {barras && medida?.ok && (
            <div className="overflow-hidden rounded-lg border border-linea bg-white p-1.5">
              <BarrasSvg codigo={codigo} moduloMm={medida.moduloMm} altoBarrasMm={11} altoNumerosMm={2.6} />
            </div>
          )}
        </div>
      ) : (
        <p className="text-[0.84rem] text-tinta-media">
          Este producto todavía no tiene código. Escaneale el de fábrica, escribilo, o generá uno propio para imprimirle la etiqueta.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pendiente && texto.trim()) guardar();
        }}
        className="campos-grises flex flex-wrap items-center gap-2"
      >
        <div className="min-w-[12rem] flex-1">
          <Entrada
            id={idCampo}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value.slice(0, 40));
              setError(null);
              setConflicto(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder={codigo ? "Escaneá o escribí otro código para cambiarlo" : "Escaneá el producto o escribí el código"}
            aria-label="Código de barras"
            invalido={!!error}
          />
        </div>
        <button type="button" onClick={() => enCampo()?.focus()} className={clasesBoton("suave", "md")} title="Deja el cursor en el campo para escanear">
          📷 Escanear
        </button>
        <button type="submit" disabled={pendiente || !texto.trim()} className={clasesBoton("navegar", "md")}>
          {pendiente ? "Guardando…" : "Guardar código"}
        </button>
      </form>
      <p className="-mt-1 text-[0.76rem] text-tinta-suave">
        Con el lector: tocá el campo y escaneá el producto; se guarda solo al terminar la lectura.
      </p>

      {error && (
        <div className="flex flex-col gap-2">
          <MensajeError>{error}</MensajeError>
          {conflicto && (
            <div>
              <button type="button" onClick={() => guardar(true)} disabled={pendiente} className={clasesBoton("navegar", "sm")}>
                Pasárselo a este producto (se lo saca a «{conflicto.nombre}»)
              </button>
            </div>
          )}
        </div>
      )}
      {aviso && <p className="text-[0.82rem] font-semibold text-exito">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {!codigo && (
          <button type="button" onClick={generar} disabled={pendiente} className={clasesBoton("nuevo", "sm")}>
            + Generar código propio
          </button>
        )}
        {barras && (
          <a
            href={`/admin/codigos-barras/etiquetas?producto=${encodeURIComponent(productId)}`}
            className={clasesBoton("navegar", "sm")}
          >
            🏷 Imprimir etiqueta
          </a>
        )}
        {codigo && (
          <button type="button" onClick={quitar} disabled={pendiente} className={`${clasesBoton("peligro", "sm")} sm:ml-auto`}>
            Quitar código
          </button>
        )}
      </div>
    </div>
  );
}
