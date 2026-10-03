import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { cargarCatalogoDeVenta } from "@/lib/catalogo-venta";
import { localPorTokenMozos, mozoDeSesion, nombreDeMozo } from "@/lib/sesion-mozo";
import { PinMozo } from "./PinMozo";
import { MozoApp } from "./MozoApp";

export const dynamic = "force-dynamic";

// Es un enlace privado del local: que ningún buscador lo indexe.
export const metadata: Metadata = {
  title: "Servicio comedor",
  robots: { index: false, follow: false },
};

/**
 * El enlace público del mozo (/mozo/<llave>). La llave lleva al local; sin la sesión del mozo (su PIN) no se ve nada de
 * la carta ni de las mesas. Con la sesión, se carga el catálogo de venta del local una sola vez y el resto lo maneja el
 * celular.
 */
export default async function MozoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const local = await localPorTokenMozos(token);
  if (!local) notFound();

  const mozo = await mozoDeSesion(local);
  if (!mozo) return <PinMozo token={token} nombreLocal={local.nombre} />;

  const { categorias, gruposMitad } = await cargarCatalogoDeVenta(prismaDelLocal(local.id));
  return (
    <MozoApp
      token={token}
      nombreLocal={local.nombre}
      mozo={nombreDeMozo(mozo)}
      categorias={categorias}
      gruposMitad={gruposMitad}
    />
  );
}
