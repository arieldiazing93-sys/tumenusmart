import Link from "next/link";
import { clasesBoton } from "@/components/ui";

export type ServicioDeCaja = "pos" | "comedor" | "delivery";

/**
 * Los accesos directos entre los tres lugares donde trabaja la caja: el Punto de venta (mostrador), el Servicio comedor y el Servicio
 * delivery. Van en la cabecera de cada uno para pasar de uno a otro de un toque, sin volver al menú. Muestra solo los OTROS (el que ya
 * está abierto no se repite) y solo los que quien mira tiene permiso de ver.
 *
 * Es el mismo conjunto de botones en las tres pantallas, así que vive en un solo lugar: si mañana se suma un servicio, se suma acá.
 */
export function AccesosDeServicio({
  actual,
  pos,
  comedor,
  delivery,
  tam = "md",
}: {
  /** En cuál de los tres se está. */
  actual: ServicioDeCaja;
  /** El tamaño de los botones: «sm» cuando la cabecera tiene que ser baja (el punto de venta). */
  tam?: "sm" | "md";
  /** Qué accesos puede ver quien mira (cada uno según su permiso). */
  pos: boolean;
  comedor: boolean;
  delivery: boolean;
}) {
  return (
    <>
      {actual !== "pos" && pos && (
        <Link href="/admin/pos" className={clasesBoton("acceso", tam)}>
          🏪 Punto de venta
        </Link>
      )}
      {actual !== "comedor" && comedor && (
        <Link href="/admin/comedor" className={clasesBoton("acceso", tam)}>
          🍽 Servicio comedor
        </Link>
      )}
      {actual !== "delivery" && delivery && (
        <Link href="/admin/delivery" className={clasesBoton("acceso", tam)}>
          🛵 Servicio delivery
        </Link>
      )}
    </>
  );
}
