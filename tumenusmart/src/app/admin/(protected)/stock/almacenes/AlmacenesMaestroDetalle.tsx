"use client";

import { MaestroDetalle } from "@/components/MaestroDetalle";
import { Pastilla } from "@/components/ui";
import { AlmacenPanel, type AlmacenDatos } from "./AlmacenPanel";
import { CrearAlmacenForm } from "./CrearAlmacenForm";

export function AlmacenesMaestroDetalle({ almacenes }: { almacenes: AlmacenDatos[] }) {
  return (
    <MaestroDetalle
      items={almacenes}
      columnas={[
        { titulo: "Nombre", celda: (a) => <span className="font-medium">{a.nombre}</span> },
        {
          titulo: "Estado",
          celda: (a) => <Pastilla color={a.activo ? "exito" : "neutro"}>{a.activo ? "Activo" : "Desactivado"}</Pastilla>,
        },
      ]}
      textoNuevo="+ Nuevo almacén"
      textoVacio="Todavía no cargaste ningún almacén. Hace falta al menos uno: todo lo que se compra entra a un almacén y cada producto descuenta del suyo."
      textoPlaceholder="Hacé doble clic en un almacén de la lista para ver y editar sus datos, o creá uno nuevo con el botón de arriba."
      renderPanel={(almacen, alGuardar) => <AlmacenPanel almacen={almacen} alGuardar={alGuardar} />}
      renderNuevo={(alCrear) => <CrearAlmacenForm onCreado={alCrear} />}
    />
  );
}
