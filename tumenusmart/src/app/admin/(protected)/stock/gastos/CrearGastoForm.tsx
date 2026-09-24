"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { type OpcionCategoriaGasto } from "@/lib/categoria-gasto";
import { TASAS_IVA } from "@/lib/iva";
import { crearGasto } from "./actions";

type Proveedor = { id: string; nombre: string; ruc: string | null; razonSocial: string | null };

export function CrearGastoForm({
  proveedores,
  categorias,
}: {
  proveedores: Proveedor[];
  /** Las cinco fijas más las que creó el local. */
  categorias: OpcionCategoriaGasto[];
}) {
  const [pendiente, iniciar] = useTransition();
  const [agregado, setAgregado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [fecha, setFecha] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState(false);
  const [proveedorId, setProveedorId] = useState("");
  const [condicionPago, setCondicionPago] = useState<"contado" | "credito">("contado");
  const proveedorElegido = proveedores.find((p) => p.id === proveedorId) ?? null;

  // Se completa recién en el navegador: en el servidor "hoy" sería el de UTC,
  // y de noche ya es "mañana" en Paraguay.
  useEffect(() => {
    setFecha(new Date().toLocaleDateString("en-CA"));
  }, []);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearGasto(formData);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
      setNuevaCategoria(false);
      setProveedorId("");
      setCondicionPago("contado");
      setAgregado(true);
      setTimeout(() => setAgregado(false), 2500);
    });
  }

  return (
    <Tarjeta className="mb-6 flex flex-col gap-3">
      <p className="rotulo text-[0.8rem] font-bold">Nuevo gasto</p>
      <form ref={formRef} action={alCrear} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Concepto">
          <Entrada name="concepto" required placeholder="Ej: Alquiler de septiembre" />
        </Campo>
        <div>
          <Campo etiqueta="Categoría">
            {!nuevaCategoria ? (
              <Selector name="categoria" defaultValue="otros">
                {categorias.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </Selector>
            ) : (
              // Si se escribe una categoría nueva, se crea al guardar el gasto.
              <Entrada name="categoriaNueva" placeholder="Nombre de la categoría nueva" maxLength={40} autoFocus required />
            )}
          </Campo>
          <button
            type="button"
            onClick={() => setNuevaCategoria((v) => !v)}
            className={`mt-1.5 ${clasesBoton("suave", "sm")}`}
          >
            {nuevaCategoria ? "Elegir una categoría existente" : "+ Nueva categoría"}
          </button>
        </div>
        <Campo etiqueta="Monto">
          <Entrada type="number" name="monto" required step="1" min="0" placeholder="Gs." />
        </Campo>
        <Campo etiqueta="Fecha">
          <Entrada type="date" name="fecha" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <Campo etiqueta="Proveedor (opcional)">
          <Selector name="proveedorId" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Notas (opcional)">
          <Entrada name="notas" />
        </Campo>

        {/* Los datos de la factura NO son obligatorios: muchos gastos no tienen
            factura, ni RUC, ni razón social de nadie. Es lo mismo que se carga
            en una compra, para poder informarlos más adelante en el registro de
            compras de la DNIT (RG 90). Cerrado de entrada para no estorbar. */}
        <details className="rounded-lg border border-linea sm:col-span-2">
          <summary className="cursor-pointer px-3 py-2.5 text-[0.86rem] font-semibold text-tinta">
            Datos de la factura{" "}
            <span className="text-xs font-normal text-tinta-suave">
              (opcional) — folio, timbrado, RUC, IVA y crédito
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-3 border-t border-linea p-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo etiqueta="Folio de factura">
              <Entrada name="numeroComprobante" maxLength={40} placeholder="Ej: 001-001-0001234" />
            </Campo>
            <Campo etiqueta="Timbrado" ayuda="Hasta 8 números.">
              <Entrada name="timbrado" inputMode="numeric" maxLength={8} placeholder="Ej: 12345678" />
            </Campo>
            <Campo etiqueta="Tasa de IVA">
              <Selector name="iva" defaultValue="gravado10">
                {TASAS_IVA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo
              etiqueta="RUC o cédula de quien emitió la factura"
              ayuda={proveedorElegido?.ruc ? `Si lo dejás vacío se usa el del proveedor: ${proveedorElegido.ruc}.` : undefined}
            >
              <Entrada name="proveedorRuc" maxLength={40} placeholder={proveedorElegido?.ruc ?? "Si no está cargado como proveedor"} />
            </Campo>
            <Campo
              etiqueta="Razón social"
              ayuda={
                proveedorElegido?.razonSocial ? `Si lo dejás vacío se usa: ${proveedorElegido.razonSocial}.` : undefined
              }
            >
              <Entrada name="proveedorRazonSocial" maxLength={200} />
            </Campo>
            <div className="hidden lg:block" />
            <Campo etiqueta="Condición de pago">
              <Selector
                name="condicionPago"
                value={condicionPago}
                onChange={(e) => setCondicionPago(e.target.value === "credito" ? "credito" : "contado")}
              >
                <option value="contado">Al contado</option>
                <option value="credito">A crédito</option>
              </Selector>
            </Campo>
            <Campo
              etiqueta="Fecha de vencimiento de la factura (solo a crédito)"
              ayuda={condicionPago === "credito" ? "La fecha límite para pagarla." : "Se completa solo si es a crédito."}
            >
              <Entrada type="date" name="fechaVencimiento" disabled={condicionPago !== "credito"} />
            </Campo>
          </div>
        </details>
        <div className="flex items-center gap-2 sm:col-span-2">
          <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
            {pendiente ? "Agregando…" : "Agregar"}
          </button>
          {agregado && <span className="text-xs font-medium text-exito">✓ Agregado</span>}
        </div>
      </form>
    </Tarjeta>
  );
}
