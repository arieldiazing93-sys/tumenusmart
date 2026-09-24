import { AVATARES, iniciales } from "@/lib/agenda";

/**
 * El círculo de una persona del personal: su foto, o sus iniciales sobre un
 * color si todavía no tiene. El tamaño y el de la letra se pasan en `className`.
 */
export function AvatarPersonal({
  nombre,
  fotoUrl,
  indice = 0,
  className = "h-8 w-8 text-[0.72rem]",
}: {
  nombre: string;
  fotoUrl?: string | null;
  /** Su posición en la lista, para darle su color (solo decora). */
  indice?: number;
  className?: string;
}) {
  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fotoUrl} alt="" className={`flex-none rounded-full object-cover ${className}`} />
    );
  }
  return (
    <span
      className={`flex flex-none items-center justify-center rounded-full font-semibold ${
        AVATARES[Math.max(0, indice) % AVATARES.length]
      } ${className}`}
    >
      {iniciales(nombre)}
    </span>
  );
}
