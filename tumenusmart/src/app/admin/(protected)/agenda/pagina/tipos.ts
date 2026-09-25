import type { DatosPagina } from "@/lib/pagina-reservas";

/** Lo que recibe cada sección del editor de la página de reservas. */
export type PropsSeccion = {
  datos: DatosPagina;
  /** Cambia solo esos campos: el editor guarda todo junto recién al apretar "Guardar cambios". */
  cambiar: (parche: Partial<DatosPagina>) => void;
};
