import type { Canal } from "./reporte-promociones";
import { ZONA_NEGOCIO } from "./timezone";

/**
 * Reporte de cancelaciones y descuentos: las cuentas que se cancelaron, los productos que se cancelaron y los descuentos que se dieron,
 * cada registro con la persona que lo AUTORIZÓ (el usuario del panel que lo hizo: quien canceló, quien anuló o quien puso el descuento) y
 * con el motivo que dejó. Es el control del dueño sobre la caja; los tres salen de la misma pantalla y de la misma forma.
 *
 * Esto es solo el armado: lo que sale de la base lo arma `reporte-cancelaciones-servidor.ts` como una lista de `FilaRegistro`, y acá se
 * filtra por persona, se ordena y se suma.
 */

export type TipoRegistro = "cuentas" | "productos" | "descuentos";

export const TIPOS_DE_REGISTRO: { value: TipoRegistro; label: string; cancelado: string }[] = [
  { value: "cuentas", label: "Cuentas canceladas", cancelado: "Cancelado" },
  { value: "productos", label: "Productos cancelados", cancelado: "Cancelado" },
  { value: "descuentos", label: "Descuentos", cancelado: "Descontado" },
];

/** Lo que dice el reporte cuando un registro no tiene guardado quién lo autorizó (registros viejos). */
export const SIN_DATO = "Sin dato";

/** El tipo que viene de la dirección ("?tipo=productos"): si no es uno de los tres, el primero. */
export function leerTipo(valor: string | undefined | null): TipoRegistro {
  return TIPOS_DE_REGISTRO.find((t) => t.value === valor)?.value ?? "cuentas";
}

/** Un registro del reporte, ya listo para mostrar. */
export type FilaRegistro = {
  /** Único dentro del reporte (para la clave de la fila). */
  id: string;
  fecha: Date;
  canal: Canal;
  /** "Mesa 5 · cuenta 12", "Delivery · cuenta 7", "Venta 45". */
  referencia: string;
  /** Qué fue: "Sin cobrar" / "Cobrada y anulada" (cuentas), "2 × Cerveza" (productos), "10 %" o "Monto fijo" (descuentos). */
  detalle: string;
  /** Unidades, solo en los productos cancelados. */
  cantidad: number | null;
  /** Guaraníes: lo que se canceló, o lo que se descontó. */
  monto: number;
  /** Solo en los descuentos: lo que se cobró de esa venta, ya con el descuento. */
  cobrado: number | null;
  motivo: string | null;
  /** El usuario que lo autorizó; null si no quedó guardado. */
  autorizo: string | null;
  /** Solo en los productos cancelados: quién lo había cargado (el mozo o la caja). */
  cargo: string | null;
};

export type FilaPorPersona = { usuario: string; registros: number; monto: number };

export type ResumenRegistros = {
  /** Los registros que quedan después de filtrar por persona, del más nuevo al más viejo. */
  filas: FilaRegistro[];
  /** Todas las personas que autorizaron algo en el período (sin filtrar): para elegir en el selector. */
  usuarios: string[];
  porPersona: FilaPorPersona[];
  totales: { registros: number; unidades: number; monto: number; cobrado: number; personas: number };
};

export function autorizoDe(f: FilaRegistro): string {
  const nombre = f.autorizo?.trim();
  return nombre ? nombre : SIN_DATO;
}

/** Filtra por persona (null = todas), ordena del más nuevo al más viejo y suma. Los montos son guaraníes enteros: la suma es exacta. */
export function resumirRegistros(filas: FilaRegistro[], usuario: string | null): ResumenRegistros {
  const usuarios = [...new Set(filas.map(autorizoDe))].sort((a, b) => a.localeCompare(b, "es"));
  const elegidas = (usuario ? filas.filter((f) => autorizoDe(f) === usuario) : [...filas]).sort(
    (a, b) => b.fecha.getTime() - a.fecha.getTime() || a.id.localeCompare(b.id)
  );

  const grupos = new Map<string, FilaPorPersona>();
  for (const f of elegidas) {
    const nombre = autorizoDe(f);
    const g = grupos.get(nombre) ?? { usuario: nombre, registros: 0, monto: 0 };
    g.registros += 1;
    g.monto += f.monto;
    grupos.set(nombre, g);
  }
  const porPersona = [...grupos.values()].sort((a, b) => b.monto - a.monto || b.registros - a.registros || a.usuario.localeCompare(b.usuario, "es"));

  return {
    filas: elegidas,
    usuarios,
    porPersona,
    totales: {
      registros: elegidas.length,
      unidades: Math.round(elegidas.reduce((s, f) => s + (f.cantidad ?? 0), 0) * 10000) / 10000,
      monto: elegidas.reduce((s, f) => s + f.monto, 0),
      cobrado: elegidas.reduce((s, f) => s + (f.cobrado ?? 0), 0),
      personas: grupos.size,
    },
  };
}

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat("es-PY", {
  timeZone: ZONA_NEGOCIO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "07/10/2026 18:45", en la hora de Asunción. */
export function formatearFechaHora(fecha: Date): string {
  return FORMATO_FECHA_HORA.format(fecha).replace(",", "");
}
