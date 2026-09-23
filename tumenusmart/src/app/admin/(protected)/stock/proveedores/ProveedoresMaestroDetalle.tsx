"use client";

import { MaestroDetalle } from "@/components/MaestroDetalle";
import { Pastilla } from "@/components/ui";
import { ProveedorPanel, type ProveedorDatos } from "./ProveedorPanel";
import { CrearProveedorForm } from "./CrearProveedorForm";

export function ProveedoresMaestroDetalle({ proveedores }: { proveedores: ProveedorDatos[] }) {
  return (
    <MaestroDetalle
      items={proveedores}
      columnas={[
        { titulo: "Nombre comercial", celda: (p) => <span className="font-medium">{p.nombre}</span> },
        { titulo: "Ciudad", celda: (p) => p.ciudad || "—" },
        {
          titulo: "Estado",
          celda: (p) => <Pastilla color={p.activo ? "exito" : "neutro"}>{p.activo ? "Activo" : "Desactivado"}</Pastilla>,
        },
      ]}
      textoNuevo="+ Nuevo proveedor"
      textoVacio="Todavía no cargaste ningún proveedor."
      textoPlaceholder="Hacé doble clic en un proveedor de la lista para ver y editar sus datos, o creá uno nuevo con el botón de arriba."
      renderPanel={(proveedor, alGuardar) => <ProveedorPanel proveedor={proveedor} alGuardar={alGuardar} />}
      renderNuevo={(alCrear) => <CrearProveedorForm onCreado={alCrear} />}
    />
  );
}
