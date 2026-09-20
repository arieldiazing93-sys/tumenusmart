"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Boton } from "@/components/ui";
import { VerFacturaModal } from "./VerFacturaModal";

type Props = {
  origen: "pedido" | "venta";
  id: string;
  facturaNumero: string;
  fecha: Date;
  razonSocial: string;
  etiquetaIdentificacion: string;
  identificacion: string;
  total: number;
  origenLabel: string;
  href: string;
  cuentaAnulada: boolean;
  facturaAnulada: boolean;
};

export function VerFacturaBoton(props: Props) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Boton tono="navegar" tam="sm" onClick={() => setAbierto(true)}>
        Ver
      </Boton>
      {/* Portal a document.body: <tr> solo puede tener <td>/<th> como hijos
          directos — un modal con position:fixed adentro de la fila es HTML
          inválido y el navegador lo puede reubicar o descartar. */}
      {abierto &&
        createPortal(<VerFacturaModal {...props} onCerrar={() => setAbierto(false)} />, document.body)}
    </>
  );
}
